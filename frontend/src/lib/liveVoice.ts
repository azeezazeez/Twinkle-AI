import { createLiveToken } from './api';

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/**
 * Plays a short sample using the selected Gemini Live native voice.
 * Browser speechSynthesis is intentionally not used because it makes
 * the different Gemini voices sound identical on many systems.
 */
export async function previewGeminiVoice(voiceName: string, greeting?: string, language = 'auto'): Promise<void> {
  const { token, model } = await createLiveToken(voiceName, language);
  const context = new AudioContext();
  if (context.state === 'suspended') await context.resume();

  const socket = new WebSocket(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`
  );

  let nextPlayTime = context.currentTime + 0.03;
  const sources = new Set<AudioBufferSourceNode>();

  const cleanup = () => {
    sources.forEach(source => {
      try { source.stop(); } catch { /* already stopped */ }
    });
    sources.clear();
    try { socket.close(1000, 'Voice preview complete'); } catch { /* ignore */ }
    void context.close();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error(`Voice preview for ${voiceName} timed out.`));
      }, 18_000);

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error(message));
      };

      socket.onopen = () => {
        socket.send(JSON.stringify({
          setup: {
            model: `models/${model || 'gemini-3.8-live'}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: 'Give one short friendly greeting. Do not explain anything else.' }],
            },
          },
        }));
      };

      socket.onmessage = async event => {
        try {
          const message = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : event.data instanceof Blob
              ? JSON.parse(await event.data.text())
              : event.data instanceof ArrayBuffer
                ? JSON.parse(new TextDecoder().decode(new Uint8Array(event.data)))
                : JSON.parse(String(event.data));
          if (message.setupComplete) {
            socket.send(JSON.stringify({
              clientContent: {
                turns: [{
                  role: 'user',
                  parts: [{ text: greeting || 'Give one short friendly greeting. Do not explain anything else.' }],
                }],
                turnComplete: true,
              },
            }));
            return;
          }

          const parts = message.serverContent?.modelTurn?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              const data = part?.inlineData?.data;
              if (!data || !String(part?.inlineData?.mimeType || '').startsWith('audio/pcm')) continue;
              const bytes = base64ToBytes(data);
              const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
              const buffer = context.createBuffer(1, pcm.length, 24000);
              const channel = buffer.getChannelData(0);
              for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;

              const source = context.createBufferSource();
              source.buffer = buffer;
              source.connect(context.destination);
              sources.add(source);
              const startAt = Math.max(context.currentTime + 0.01, nextPlayTime);
              nextPlayTime = startAt + buffer.duration;
              source.onended = () => sources.delete(source);
              source.start(startAt);
            }
          }

          if (message.serverContent?.turnComplete) {
            const wait = Math.max(0, (nextPlayTime - context.currentTime) * 1000 + 100);
            window.setTimeout(() => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeout);
              resolve();
            }, wait);
          }
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Voice preview failed.');
        }
      };

      socket.onerror = () => fail(`Unable to preview ${voiceName}. Check the Gemini Live configuration.`);
      socket.onclose = event => {
        if (!settled && event.code !== 1000) fail(`Voice preview disconnected (${event.code}).`);
      };
    });
  } finally {
    cleanup();
  }
}
