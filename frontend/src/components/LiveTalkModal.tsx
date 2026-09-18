import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';
import { chatApi, createLiveToken } from '../lib/api';
import { APP_LANGUAGE_KEY, getLanguageInstruction, type AppLanguage } from '../lib/i18n';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after the final Live Talk data has been persisted. */
  onSessionComplete?: (sessionId: number) => void;
};

type VoiceOption = {
  name: string;
  description: string;
};

const VOICES: VoiceOption[] = [
  { name: 'Zephyr', description: 'Bright' },
  { name: 'Puck', description: 'Upbeat' },
  { name: 'Charon', description: 'Informative · clear' },
  { name: 'Kore', description: 'Firm' },
  { name: 'Fenrir', description: 'Excitable' },
  { name: 'Leda', description: 'Youthful' },
  { name: 'Orus', description: 'Firm' },
  { name: 'Aoede', description: 'Breezy' },
  { name: 'Callirrhoe', description: 'Easy-going' },
  { name: 'Autonoe', description: 'Bright' },
  { name: 'Enceladus', description: 'Breathy' },
  { name: 'Iapetus', description: 'Clear' },
  { name: 'Umbriel', description: 'Easy-going' },
  { name: 'Algieba', description: 'Smooth' },
  { name: 'Despina', description: 'Smooth' },
  { name: 'Erinome', description: 'Clear' },
  { name: 'Algenib', description: 'Gravelly' },
  { name: 'Rasalgethi', description: 'Informative' },
  { name: 'Laomedeia', description: 'Upbeat' },
  { name: 'Achernar', description: 'Soft' },
  { name: 'Alnilam', description: 'Firm' },
  { name: 'Schedar', description: 'Even' },
  { name: 'Gacrux', description: 'Mature' },
  { name: 'Pulcherrima', description: 'Forward' },
  { name: 'Achird', description: 'Friendly' },
  { name: 'Zubenelgenubi', description: 'Casual' },
  { name: 'Vindemiatrix', description: 'Gentle' },
  { name: 'Sadachbia', description: 'Lively' },
  { name: 'Sadaltager', description: 'Knowledgeable' },
  { name: 'Sulafat', description: 'Warm' },
];

const LIVE_MODEL = 'gemini-3.8-live';
const DEFAULT_VOICE = 'Charon';

const getSavedVoice = () => {
  try {
    const saved = localStorage.getItem('twinkle_live_voice');
    return VOICES.some(voice => voice.name === saved) ? saved! : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
};

const VOICE_THEMES: Record<string, { background: string; glow: string }> = {
  Zephyr: { background: 'radial-gradient(circle at 35% 25%, #fef9c3 0%, #dff6ff 28%, #74c7ff 58%, #1479ed 100%)', glow: 'rgba(20,121,237,.24)' },
  Puck: { background: 'radial-gradient(circle at 35% 25%, #fff7ed 0%, #fed7aa 30%, #fb923c 62%, #ea580c 100%)', glow: 'rgba(234,88,12,.24)' },
  Charon: { background: 'radial-gradient(circle at 35% 25%, #f5f3ff 0%, #ddd6fe 30%, #8b5cf6 62%, #5b21b6 100%)', glow: 'rgba(91,33,182,.24)' },
  Kore: { background: 'radial-gradient(circle at 35% 25%, #f0fdf4 0%, #bbf7d0 30%, #4ade80 62%, #15803d 100%)', glow: 'rgba(21,128,61,.24)' },
  Fenrir: { background: 'radial-gradient(circle at 35% 25%, #fef2f2 0%, #fecaca 30%, #f87171 62%, #b91c1c 100%)', glow: 'rgba(185,28,28,.24)' },
  Leda: { background: 'radial-gradient(circle at 35% 25%, #fdf2f8 0%, #fbcfe8 30%, #f472b6 62%, #be185d 100%)', glow: 'rgba(190,24,93,.24)' },
  Orus: { background: 'radial-gradient(circle at 35% 25%, #eff6ff 0%, #bfdbfe 30%, #60a5fa 62%, #1d4ed8 100%)', glow: 'rgba(29,78,216,.24)' },
  Aoede: { background: 'radial-gradient(circle at 35% 25%, #ecfdf5 0%, #a7f3d0 30%, #34d399 62%, #047857 100%)', glow: 'rgba(4,120,87,.24)' },
  Callirrhoe: { background: 'radial-gradient(circle at 35% 25%, #f0fdfa 0%, #99f6e4 30%, #2dd4bf 62%, #0f766e 100%)', glow: 'rgba(15,118,110,.24)' },
  Autonoe: { background: 'radial-gradient(circle at 35% 25%, #fffbeb 0%, #fde68a 30%, #facc15 62%, #a16207 100%)', glow: 'rgba(161,98,7,.24)' },
  Enceladus: { background: 'radial-gradient(circle at 35% 25%, #f8fafc 0%, #cbd5e1 30%, #94a3b8 62%, #475569 100%)', glow: 'rgba(71,85,105,.24)' },
  Iapetus: { background: 'radial-gradient(circle at 35% 25%, #f0f9ff 0%, #bae6fd 30%, #38bdf8 62%, #0369a1 100%)', glow: 'rgba(3,105,161,.24)' },
  Umbriel: { background: 'radial-gradient(circle at 35% 25%, #f5f5f4 0%, #d6d3d1 30%, #a8a29e 62%, #57534e 100%)', glow: 'rgba(87,83,78,.24)' },
  Algieba: { background: 'radial-gradient(circle at 35% 25%, #fff1f2 0%, #fecdd3 30%, #fb7185 62%, #be123c 100%)', glow: 'rgba(190,18,60,.24)' },
  Despina: { background: 'radial-gradient(circle at 35% 25%, #faf5ff 0%, #e9d5ff 30%, #c084fc 62%, #7e22ce 100%)', glow: 'rgba(126,34,206,.24)' },
  Erinome: { background: 'radial-gradient(circle at 35% 25%, #ecfeff 0%, #a5f3fc 30%, #22d3ee 62%, #0e7490 100%)', glow: 'rgba(14,116,144,.24)' },
  Algenib: { background: 'radial-gradient(circle at 35% 25%, #f4f4f5 0%, #d4d4d8 30%, #71717a 62%, #27272a 100%)', glow: 'rgba(39,39,42,.24)' },
  Rasalgethi: { background: 'radial-gradient(circle at 35% 25%, #eef2ff 0%, #c7d2fe 30%, #818cf8 62%, #4338ca 100%)', glow: 'rgba(67,56,202,.24)' },
  Laomedeia: { background: 'radial-gradient(circle at 35% 25%, #fff7ed 0%, #fed7aa 30%, #fb7185 62%, #db2777 100%)', glow: 'rgba(219,39,119,.24)' },
  Achernar: { background: 'radial-gradient(circle at 35% 25%, #f0f9ff 0%, #bae6fd 30%, #7dd3fc 62%, #0284c7 100%)', glow: 'rgba(2,132,199,.24)' },
  Alnilam: { background: 'radial-gradient(circle at 35% 25%, #f8fafc 0%, #e2e8f0 30%, #64748b 62%, #1e293b 100%)', glow: 'rgba(30,41,59,.24)' },
  Schedar: { background: 'radial-gradient(circle at 35% 25%, #f7fee7 0%, #d9f99d 30%, #84cc16 62%, #3f6212 100%)', glow: 'rgba(63,98,18,.24)' },
  Gacrux: { background: 'radial-gradient(circle at 35% 25%, #fff7ed 0%, #fed7aa 30%, #a78bfa 62%, #6d28d9 100%)', glow: 'rgba(109,40,217,.24)' },
  Pulcherrima: { background: 'radial-gradient(circle at 35% 25%, #fdf4ff 0%, #f5d0fe 30%, #e879f9 62%, #a21caf 100%)', glow: 'rgba(162,28,175,.24)' },
  Achird: { background: 'radial-gradient(circle at 35% 25%, #eff6ff 0%, #bfdbfe 30%, #60a5fa 62%, #2563eb 100%)', glow: 'rgba(37,99,235,.24)' },
  Zubenelgenubi: { background: 'radial-gradient(circle at 35% 25%, #fff7ed 0%, #fde68a 30%, #fb923c 62%, #c2410c 100%)', glow: 'rgba(194,65,12,.24)' },
  Vindemiatrix: { background: 'radial-gradient(circle at 35% 25%, #f0fdf4 0%, #bbf7d0 30%, #86efac 62%, #16a34a 100%)', glow: 'rgba(22,163,74,.24)' },
  Sadachbia: { background: 'radial-gradient(circle at 35% 25%, #ecfeff 0%, #a5f3fc 30%, #67e8f9 62%, #0891b2 100%)', glow: 'rgba(8,145,178,.24)' },
  Sadaltager: { background: 'radial-gradient(circle at 35% 25%, #eef2ff 0%, #c7d2fe 30%, #6366f1 62%, #3730a3 100%)', glow: 'rgba(55,48,163,.24)' },
  Sulafat: { background: 'radial-gradient(circle at 35% 25%, #fff1f2 0%, #fecdd3 30%, #fb7185 62%, #9f1239 100%)', glow: 'rgba(159,18,57,.24)' },
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const downsampleTo16k = (buffer: Float32Array, inputRate: number): Int16Array => {
  if (inputRate === 16000) {
    const pcm = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, buffer[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }

  const ratio = inputRate / 16000;
  const outputLength = Math.max(1, Math.round(buffer.length / ratio));
  const pcm = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, buffer.length - 1);
    const fraction = position - left;
    const sample = buffer[left] * (1 - fraction) + buffer[right] * fraction;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return pcm;
};

const decodeLiveMessage = async (data: unknown): Promise<any> => {
  if (typeof data === 'string') return JSON.parse(data);

  if (data instanceof Blob) {
    return JSON.parse(await data.text());
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(data)
      )
    );
  }

  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return JSON.parse(
      new TextDecoder().decode(
        new Uint8Array(
          view.buffer,
          view.byteOffset,
          view.byteLength
        )
      )
    );
  }

  throw new Error(
    'Gemini Live API returned an unsupported WebSocket message type.'
  );
};

export default function LiveTalkModal({ open, onClose, onSessionComplete }: Props) {
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef(0);
  const connectAttemptRef = useRef(0);
  const startInputRef = useRef<(() => Promise<void>) | null>(null);
  const liveSessionIdRef = useRef<number | null>(null);
  const liveSessionPromiseRef = useRef<Promise<number> | null>(null);
  const liveSavePromiseRef = useRef<Promise<void> | null>(null);
  const liveTitleGeneratedRef = useRef(false);
  const userTurnRef = useRef('');
  const assistantTurnRef = useRef('');
  const endingRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceName, setVoiceName] = useState(getSavedVoice);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(APP_LANGUAGE_KEY) || 'auto';
      return saved as AppLanguage;
    } catch {
      return 'auto';
    }
  });
  const [status, setStatus] = useState('Connecting…');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState('');

  const persistCompletedTurn = useCallback(async () => {
    const userText = userTurnRef.current.trim();
    const assistantText = assistantTurnRef.current.trim();

    if (!userText && !assistantText) {
      return liveSessionIdRef.current;
    }

    userTurnRef.current = '';
    assistantTurnRef.current = '';

    const save = async () => {
      try {
        if (liveSessionIdRef.current == null) {
          if (!liveSessionPromiseRef.current) {
            liveSessionPromiseRef.current = (async () => {
              const response = (await chatApi.createSession()) as any;
              const id = Number(response?.id ?? response?.sessionId);
              if (!Number.isFinite(id)) {
                throw new Error('Live Talk could not create a chat session.');
              }
              liveSessionIdRef.current = id;
              return id;
            })().finally(() => {
              liveSessionPromiseRef.current = null;
            });
          }
          await liveSessionPromiseRef.current;
        }

        const sessionId = liveSessionIdRef.current;
        if (sessionId == null) return;

        const saved = (await chatApi.saveLiveTurn(
          sessionId,
          userText,
          assistantText
        )) as any;

        let sessionName =
          typeof saved?.sessionName === 'string' && saved.sessionName.trim()
            ? saved.sessionName.trim()
            : undefined;

        // The backend owns Live Talk titles so every Live Talk session is
        // consistently stored as "Live Talk - [conversation topic]".
        // Do not overwrite that title with the normal-chat title generator.
        if (sessionName) {
          liveTitleGeneratedRef.current = true;
        }

        window.dispatchEvent(new CustomEvent('twinkle-live-session-updated', {
          detail: { sessionId, id: sessionId, sessionName, source: 'live-talk' },
        }));
      } catch (error) {
        console.error('Live Talk background save failed:', error);
      }
    };

    // Serialize saves so ending Live Talk cannot race a turn that is still
    // being written to the database.
    const previous = liveSavePromiseRef.current ?? Promise.resolve();
    const current = previous.then(save, save);
    liveSavePromiseRef.current = current;
    await current;

    return liveSessionIdRef.current;
  }, []);

  useEffect(() => {
    if (!open) return;

    const syncVoice = () => setVoiceName(getSavedVoice());
    syncVoice();

    const handleVoiceChange = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setVoiceName(
        VOICES.some(voice => voice.name === custom.detail)
          ? custom.detail
          : getSavedVoice()
      );
    };

    const handleLanguageChange = (event: Event) => {
      const custom = event as CustomEvent<AppLanguage>;
      if (custom.detail) setAppLanguage(custom.detail);
    };

    const syncLanguage = () => {
      try {
        const saved = localStorage.getItem(APP_LANGUAGE_KEY) || 'auto';
        setAppLanguage(saved as AppLanguage);
      } catch {
        setAppLanguage('auto');
      }
    };

    syncLanguage();
    window.addEventListener('twinkle-voice-change', handleVoiceChange);
    window.addEventListener('twinkle-language-change', handleLanguageChange);
    return () => {
      window.removeEventListener('twinkle-voice-change', handleVoiceChange);
      window.removeEventListener('twinkle-language-change', handleLanguageChange);
    };
  }, [open]);

  const stopAudioPlayback = useCallback(() => {
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch { /* already ended */ }
    });
    audioSourcesRef.current.clear();
    nextPlayTimeRef.current = 0;
    setSpeaking(false);
  }, []);

  const cleanupAudioInput = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;

    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setListening(false);
  }, []);

  const closeSocket = useCallback(() => {
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      try { socket.close(1000, 'User closed Live Talk'); } catch { /* ignore */ }
    }
  }, []);

  const cleanup = useCallback(() => {
    endingRef.current = true;
    connectAttemptRef.current += 1;
    cleanupAudioInput();
    closeSocket();
    stopAudioPlayback();
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setConnected(false);
    setStatus('Live Talk ended');
  }, [cleanupAudioInput, closeSocket, stopAudioPlayback]);

  const playPcm24k = useCallback(async (base64: string) => {
    if (endingRef.current) return;
    const context = audioContextRef.current;
    if (!context) return;
    if (context.state === 'suspended') await context.resume();
    if (endingRef.current) return;

    const pcmBytes = base64ToBytes(base64);
    const pcm = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, Math.floor(pcmBytes.byteLength / 2));
    if (!pcm.length) return;

    const buffer = context.createBuffer(1, pcm.length, 24000);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 32768;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.02, nextPlayTimeRef.current);
    nextPlayTimeRef.current = startAt + buffer.duration;
    audioSourcesRef.current.add(source);
    setSpeaking(true);

    source.onended = () => {
      audioSourcesRef.current.delete(source);
      if (audioSourcesRef.current.size === 0 && context.currentTime >= nextPlayTimeRef.current - 0.04) {
        setSpeaking(false);
      }
    };

    source.start(startAt);
  }, []);

  const startInput = useCallback(async () => {
    if (endingRef.current) return;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error('Live Talk is not connected yet.');
    }

    if (processorRef.current) return;

    const stream = streamRef.current ?? await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');

    const context = audioContextRef.current ?? new AudioContextCtor();
    audioContextRef.current = context;
    if (context.state === 'suspended') await context.resume();

    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(2048, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    processor.onaudioprocess = event => {
      const activeSocket = socketRef.current;
      if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) return;
      const pcm = downsampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate);
      try {
        activeSocket.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: bytesToBase64(new Uint8Array(pcm.buffer)),
              mimeType: 'audio/pcm;rate=16000',
            },
          },
        }));
      } catch {
        // The socket can close between the readyState check and send().
      }
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    streamRef.current = stream;
    sourceRef.current = source;
    processorRef.current = processor;
    silentGainRef.current = silentGain;
    setListening(true);
    setStatus('Listening');
  }, []);

  startInputRef.current = startInput;

  const stopInput = useCallback(() => {
    cleanupAudioInput();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch { /* ignore */ }
    }
    if (connected) setStatus('Thinking…');
  }, [cleanupAudioInput, connected]);

  const connect = useCallback(async () => {
    const attempt = ++connectAttemptRef.current;
    endingRef.current = false;
    setError('');
    setStatus('Connecting…');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      // Ask for the microphone from the original click before the network work.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (attempt !== connectAttemptRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');
      const context = new AudioContextCtor();
      audioContextRef.current = context;
      await context.resume();

      const { token, model } = await createLiveToken(voiceName, appLanguage);
      if (endingRef.current || attempt !== connectAttemptRef.current) return;

      const socket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`
      );
      socketRef.current = socket;

      socket.onopen = () => {
        if (endingRef.current || attempt !== connectAttemptRef.current) {
          try { socket.close(1000, 'Live Talk ended'); } catch {}
          return;
        }
        socket.send(JSON.stringify({
          setup: {
            model: `models/${model || LIVE_MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName },
                },
              },
            },
            systemInstruction: {
              parts: [{
                text:
                  `You are Twinkle AI, a polished professional voice assistant. Speak naturally, concisely, confidently, and warmly. Answer the user directly and keep the conversation conversational. ` +
                  (appLanguage === 'auto'
                    ? 'Detect the language the user is speaking on every turn and respond in that same language. If the user switches languages, immediately switch with them. Do not translate or change languages unless the user asks you to.'
                    : `${getLanguageInstruction(appLanguage)} Continue using the selected language consistently, while following an explicit request from the user to switch languages.`),
              }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                prefixPaddingMs: 300,
                silenceDurationMs: 700,
              },
            },
          },
        }));
      };

      socket.onmessage = async event => {
        try {
          if (endingRef.current || attempt !== connectAttemptRef.current) return;
          const message = await decodeLiveMessage(event.data);

          if (message.setupComplete) {
            setConnected(true);
            setStatus('Listening');
            // Start streaming immediately. No second popup or start button.
            await startInputRef.current?.();
            return;
          }

          if (message.error) {
            throw new Error(message.error.message || 'Gemini Live API returned an error.');
          }

          const serverContent = message.serverContent;
          if (!serverContent) return;

          if (serverContent.inputTranscription?.text) {
            const text = String(serverContent.inputTranscription.text);
            userTurnRef.current += text;
            setTranscript(prev => `${prev}${text}`);
          }

          if (serverContent.outputTranscription?.text) {
            const text = String(serverContent.outputTranscription.text);
            assistantTurnRef.current += text;
          }

          if (serverContent.interrupted) {
            stopAudioPlayback();
            setStatus('Listening');
          }

          const parts = serverContent.modelTurn?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part?.inlineData?.data && String(part.inlineData.mimeType || '').startsWith('audio/pcm')) {
                await playPcm24k(part.inlineData.data);
              }
            }
          }

          if (serverContent.turnComplete) {
            setListening(true);
            if (audioSourcesRef.current.size === 0) setStatus('Listening');
            // Persist the completed turn without blocking Live Talk.
            void persistCompletedTurn();
          }
        } catch (messageError) {
          console.error('Live Talk message error:', messageError);
          const message = messageError instanceof Error ? messageError.message : 'Live Talk returned an invalid response.';
          setError(message);
          setStatus('Connection error');
        }
      };

      socket.onerror = () => {
        if (endingRef.current || attempt !== connectAttemptRef.current) return;
        setConnected(false);
        setError('Live Talk connection failed. Check the Gemini API key and try again.');
        setStatus('Connection error');
      };

      socket.onclose = event => {
        if (socketRef.current === socket) socketRef.current = null;
        cleanupAudioInput();
        setConnected(false);
        if (!endingRef.current && event.code !== 1000 && attempt === connectAttemptRef.current) {
          setError(`Live Talk disconnected (${event.code}).`);
          setStatus('Disconnected');
        }
      };
    } catch (connectError) {
      if (attempt !== connectAttemptRef.current) return;
      setError(connectError instanceof Error ? connectError.message : 'Could not start Live Talk.');
      setStatus('Unable to start');
      cleanupAudioInput();
      closeSocket();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    }
  }, [cleanupAudioInput, closeSocket, persistCompletedTurn, playPcm24k, stopAudioPlayback, voiceName, appLanguage]);

  useEffect(() => {
    if (!open) return;
    setTranscript('');
    setError('');
    setStatus('Connecting…');
    endingRef.current = false;
    userTurnRef.current = '';
    assistantTurnRef.current = '';
    liveSessionIdRef.current = null;
    liveSessionPromiseRef.current = null;
    liveSavePromiseRef.current = null;
    liveTitleGeneratedRef.current = false;
    void connect();
    return () => cleanup();
  }, [open, connect, cleanup]);

  const handleClose = () => {
    if (endingRef.current) return;

    // Capture the current session ID before cleanup. cleanup() intentionally
    // stops the live connection but does not destroy the persisted session ID.
    const existingSessionId = liveSessionIdRef.current;
    const hasFinalTurn =
      Boolean(userTurnRef.current.trim()) ||
      Boolean(assistantTurnRef.current.trim());

    // Persist the final partial turn, if any. If the last completed turn was
    // already saved, reuse the existing session ID instead of creating or
    // saving anything again.
    // Always wait for both the final turn and any already-running save.
    // A completed turn may have cleared the refs while its network request is
    // still in flight. If we only inspect hasFinalTurn here, Chat.tsx can be
    // opened before that database write finishes.
    const finalTurnPromise = hasFinalTurn
      ? persistCompletedTurn()
      : Promise.resolve(existingSessionId);
    const pendingSave = liveSavePromiseRef.current ?? Promise.resolve();
    const pendingSession = liveSessionPromiseRef.current ?? Promise.resolve(existingSessionId);

    const savePromise = Promise.all([finalTurnPromise, pendingSave, pendingSession])
      .then(results => {
        const ids = results.map(Number).filter(Number.isFinite);
        return ids.length > 0 ? ids[ids.length - 1] : liveSessionIdRef.current;
      });

    // Close the Live Talk UI immediately. The parent callback is fired only
    // after all persistence promises have settled.
    cleanup();
    onClose();

    void savePromise
      .then(sessionId => {
        const normalizedId = Number(sessionId);
        if (Number.isFinite(normalizedId)) {
          onSessionComplete?.(normalizedId);
        }
      })
      .catch(error => {
        console.error('Failed to finalize Live Talk session:', error);

        // Even if the final save failed, if a session was already created we
        // can still hand it back to Chat.tsx so it can attempt to load the
        // available persisted history.
        if (existingSessionId != null && Number.isFinite(existingSessionId)) {
          onSessionComplete?.(existingSessionId);
        }
      });
  };

  const selectedVoice = VOICES.find(voice => voice.name === voiceName) ?? VOICES[2];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100000] flex h-[100dvh] w-full items-center justify-center bg-white dark:bg-zinc-950"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="relative flex h-full w-full flex-col overflow-hidden">

            <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-32 pt-8">
              <div
                className="absolute inset-0 pointer-events-none transition-all duration-500"
                style={{
                  background: `radial-gradient(circle at center, ${VOICE_THEMES[voiceName]?.glow ?? VOICE_THEMES.Charon.glow}, transparent 36%)`,
                }}
              />

              <div className="relative z-10 flex flex-col items-center text-center">
                <motion.div
                  animate={
                    speaking
                      ? { scale: [1, 1.08, 1], boxShadow: ['0 0 0 0 rgba(236,106,168,.18)', '0 0 0 28px rgba(236,106,168,0)', '0 0 0 0 rgba(236,106,168,0)'] }
                      : listening
                        ? { scale: [1, 1.035, 1] }
                        : { scale: 1 }
                  }
                  transition={{ duration: speaking ? 1.15 : 1.8, repeat: speaking || listening ? Infinity : 0, ease: 'easeInOut' }}
                  className="h-28 w-28 rounded-full sm:h-36 sm:w-36"
                  style={{
                    background: VOICE_THEMES[voiceName]?.background ?? VOICE_THEMES.Charon.background,
                    boxShadow: `0 24px 80px ${VOICE_THEMES[voiceName]?.glow ?? VOICE_THEMES.Charon.glow}`,
                  }}
                />

                <div className="mt-9 flex h-12 items-end justify-center gap-1.5" aria-hidden="true">
                  {Array.from({ length: 24 }).map((_, index) => (
                    <motion.span
                      key={index}
                      animate={
                        listening || speaking
                          ? { height: [6, 8 + ((index * 7) % 22), 6] }
                          : { height: 5 }
                      }
                      transition={{ duration: 0.7 + (index % 5) * 0.08, repeat: listening || speaking ? Infinity : 0, delay: index * 0.025, ease: 'easeInOut' }}
                      className="w-1 rounded-full bg-zinc-950/75 dark:bg-white/75"
                    />
                  ))}
                </div>

                <motion.p
                  key={status}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-7 max-w-xl text-lg font-medium tracking-tight text-zinc-900 dark:text-white sm:text-xl"
                >
                  {status}
                </motion.p>

                {transcript && (
                  <p className="mt-3 max-h-24 max-w-2xl overflow-y-auto text-sm leading-6 text-zinc-400">
                    {transcript}
                  </p>
                )}

                {error && (
                  <div className="mt-5 max-w-xl rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                    {error}
                  </div>
                )}
              </div>
            </main>

            <footer className="absolute bottom-0 inset-x-0 flex items-center justify-center gap-3 border-t border-zinc-200/70 bg-white/90 px-5 py-5 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90">
              <button
                type="button"
                onClick={listening ? stopInput : () => void startInput()}
                disabled={!connected}
                className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
              >
                {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                {listening ? 'Pause microphone' : 'Resume microphone'}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                End conversation
              </button>
            </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
