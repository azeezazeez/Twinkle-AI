import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff, RotateCw, X } from 'lucide-react';
import VoiceRing from './VoiceRing';
import { getVoiceOrbPalette } from '../lib/voiceThemes';
import { VOICES, DEFAULT_VOICE } from '../lib/voices';
import { chatApi, createLiveToken, assistantNameContext, getAssistantName, learnAssistantName } from '../lib/api';
import { APP_LANGUAGE_KEY, getLanguageInstruction, type AppLanguage } from '../lib/i18n';
import pcmCaptureWorkletSource from '../audio/pcm-capture-worklet.ts?raw';

type Props = {
  open: boolean;
  onClose: () => void; 
  /** Called after the final Live Talk data has been persisted. */
  onSessionComplete?: (sessionId: number, sessionName?: string, publicId?: string) => void;
  /** Fired the instant Live Talk ends, with the local transcript, so the chat can be shown before saving finishes. */
  onSessionPreview?: (info: {
    sessionId: number | null;
    publicId?: string;
    sessionName?: string;
    turns: Array<{ role: 'user' | 'assistant'; content: string }>;
  }) => void;
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  released: boolean;
  addEventListener?: (type: string, listener: EventListener) => void;
};

const LIVE_MODEL = 'gemini-3.8-live';

const getSavedVoice = () => {
  try {
    const saved = localStorage.getItem('twinkle_live_voice');
    return VOICES.some(voice => voice.name === saved) ? saved! : DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
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

export default function LiveTalkModal({ open, onClose, onSessionComplete, onSessionPreview }: Props) {
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const outputGainRef = useRef<GainNode | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputGainRef = useRef<GainNode | null>(null);
  const inputCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef(0);
  const connectAttemptRef = useRef(0);
  const startInputRef = useRef<(() => Promise<void>) | null>(null);
  const audioWorkletReadyRef = useRef<Promise<void> | null>(null);
  const liveSessionIdRef = useRef<number | null>(null);
  const liveSessionPromiseRef = useRef<Promise<number> | null>(null);
  const liveSavePromiseRef = useRef<Promise<void> | null>(null);
  const liveTitleGeneratedRef = useRef(false);
  const lastSavedSessionNameRef = useRef<string | null>(null);
  const livePublicIdRef = useRef<string | null>(null);
  const turnsRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  const userTurnRef = useRef('');
  const assistantTurnRef = useRef('');
  const endingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  // Buffer microphone PCM while the Gemini Live socket is connecting so
  // the user can start speaking immediately without losing the first words.
  const pendingPcmRef = useRef<string[]>([]);
  // Client-side VAD: finalize a speech turn locally instead of waiting for
  // Gemini's server-side silence timer. Gemini's automatic VAD remains enabled
  // as a safety fallback.
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const vadSpeechStartedRef = useRef(false);
  const vadLastSpeechAtRef = useRef(0);
  const vadTurnEndedRef = useRef(false);
  const VAD_SILENCE_MS = 300;
  const VAD_THRESHOLD = 0.013;

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
  const [status, setStatus] = useState('Connecting');
  // Live captions: the latest thing said, by whom.
  const [caption, setCaption] = useState<{ role: 'user' | 'assistant'; text: string }>({ role: 'user', text: '' });
  const [elapsed, setElapsed] = useState(0);
  const levelRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');

  // Creates the persistent chat session once. It is started when Live Talk
  // opens (in parallel with connecting), so the first saved turn is a single
  // request instead of "create session, then save".
  const ensureSession = useCallback(async (): Promise<number> => {
    if (liveSessionIdRef.current != null) return liveSessionIdRef.current;
    if (!liveSessionPromiseRef.current) {
      liveSessionPromiseRef.current = (async () => {
        const response = (await chatApi.createSession()) as any;
        const id = Number(response?.id ?? response?.sessionId);
        if (!Number.isFinite(id)) {
          throw new Error('Live Talk could not create a chat session.');
        }
        liveSessionIdRef.current = id;
        const publicId = String(response?.publicId ?? response?.public_id ?? '');
        if (publicId) livePublicIdRef.current = publicId;
        return id;
      })().finally(() => {
        liveSessionPromiseRef.current = null;
      });
    }
    return liveSessionPromiseRef.current;
  }, []);

  const persistCompletedTurn = useCallback(async () => {
    const userText = userTurnRef.current.trim();
    const assistantText = assistantTurnRef.current.trim();

    if (!userText && !assistantText) {
      return liveSessionIdRef.current;
    }

    userTurnRef.current = '';
    assistantTurnRef.current = '';

    // Keep a local copy so the chat can be displayed instantly when Live Talk ends.
    if (userText) turnsRef.current.push({ role: 'user', content: userText });
    if (assistantText) turnsRef.current.push({ role: 'assistant', content: assistantText });

    const save = async () => {
      try {
        await ensureSession();

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

        if (sessionName) {
          lastSavedSessionNameRef.current = sessionName;
        }

        // The backend owns Live Talk titles so every Live Talk session is
        // consistently stored as "Live Talk - [conversation topic]".
        // Do not overwrite that title with the normal-chat title generator.
        if (sessionName) {
          liveTitleGeneratedRef.current = true;
        }

        window.dispatchEvent(new CustomEvent('twinkle-live-session-updated', {
          detail: { sessionId, id: sessionId, sessionName, publicId: livePublicIdRef.current || undefined, source: 'live-talk' },
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
  }, [ensureSession]);

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

  const releaseWakeLock = useCallback(async () => {
    const lock = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!lock) return;

    try {
      if (!lock.released) await lock.release();
    } catch {
      // Wake Lock is best-effort and may be revoked by the browser/OS.
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!open || typeof document === 'undefined') return;

    const wakeLockApi = (navigator as Navigator & {
      wakeLock?: {
        request: (type: 'screen') => Promise<WakeLockSentinelLike>;
      };
    }).wakeLock;

    if (!wakeLockApi) return;

    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      wakeLockRef.current = await wakeLockApi.request('screen');
    } catch {
      // Screen Wake Lock is optional and can be unavailable on some browsers.
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [open, requestWakeLock, releaseWakeLock]);

  const cleanupAudioInput = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    inputCompressorRef.current?.disconnect();
    inputGainRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    inputAnalyserRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    inputCompressorRef.current = null;
    inputGainRef.current = null;
    silentGainRef.current = null;
    inputAnalyserRef.current = null;
    if (vadFrameRef.current != null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    vadSpeechStartedRef.current = false;
    vadLastSpeechAtRef.current = 0;
    vadTurnEndedRef.current = false;
    pendingPcmRef.current = [];
    audioWorkletReadyRef.current = null;

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
    outputCompressorRef.current = null;
    outputGainRef.current = null;
    setConnected(false);
    setStatus('Live Talk ended');
    void releaseWakeLock();
  }, [cleanupAudioInput, closeSocket, stopAudioPlayback, releaseWakeLock]);

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
    const outputCompressor = outputCompressorRef.current;
    if (outputCompressor) source.connect(outputCompressor);
    else source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.008, nextPlayTimeRef.current);
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
    if (!outputCompressorRef.current || !outputGainRef.current) {
      // Gentle output compression reduces the perceived jump from a quiet
      // opening syllable to the rest of the generated speech.
      const outputCompressor = context.createDynamicsCompressor();
      outputCompressor.threshold.value = -30;
      outputCompressor.knee.value = 18;
      outputCompressor.ratio.value = 4;
      outputCompressor.attack.value = 0.003;
      outputCompressor.release.value = 0.18;
      const outputGain = context.createGain();
      outputGain.gain.value = 1.25;
      outputCompressor.connect(outputGain);
      outputGain.connect(context.destination);
      outputCompressorRef.current = outputCompressor;
      outputGainRef.current = outputGain;
    }
    if (context.state === 'suspended') await context.resume();

    // The worklet is prepared independently from the Gemini WebSocket.
    // connect() starts this promise in parallel with microphone permission
    // and token acquisition, so worklet compilation never blocks the socket.
    if (!audioWorkletReadyRef.current) {
      const workletBlob = new Blob(
        [pcmCaptureWorkletSource],
        { type: 'application/javascript' },
      );
      const workletUrl = URL.createObjectURL(workletBlob);
      audioWorkletReadyRef.current = context.audioWorklet.addModule(workletUrl)
        .finally(() => URL.revokeObjectURL(workletUrl));
    }
    await audioWorkletReadyRef.current;

    const source = context.createMediaStreamSource(stream);

    // Quiet-speech enhancement: AGC/noise suppression is requested from the
    // browser, then a controlled gain + compressor lifts low-volume speech
    // without allowing louder speech to clip the PCM stream.
    const inputGain = context.createGain();
    inputGain.gain.value = 3;

    const inputCompressor = context.createDynamicsCompressor();
    inputCompressor.threshold.value = -50;
    inputCompressor.knee.value = 24;
    inputCompressor.ratio.value = 6;
    inputCompressor.attack.value = 0.003;
    inputCompressor.release.value = 0.22;

    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.05;
    const analyserData = new Float32Array(analyser.fftSize);

    const processor = new AudioWorkletNode(context, 'twinkle-pcm-capture');
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    const runVad = () => {
      if (endingRef.current || !processorRef.current) return;

      analyser.getFloatTimeDomainData(analyserData);
      let sum = 0;
      for (let i = 0; i < analyserData.length; i += 1) {
        const sample = analyserData[i];
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / analyserData.length);
      const now = performance.now();
      const hasSpeech = rms >= VAD_THRESHOLD;

      if (hasSpeech) {
        vadSpeechStartedRef.current = true;
        vadLastSpeechAtRef.current = now;
        vadTurnEndedRef.current = false;
      } else if (
        vadSpeechStartedRef.current &&
        !vadTurnEndedRef.current &&
        socketRef.current?.readyState === WebSocket.OPEN &&
        now - vadLastSpeechAtRef.current >= VAD_SILENCE_MS
      ) {
        // Hybrid VAD: tell Gemini the turn ended immediately. This avoids
        // waiting for the server's longer silenceDurationMs fallback.
        try {
          socketRef.current.send(JSON.stringify({
            realtimeInput: { audioStreamEnd: true },
          }));
          vadTurnEndedRef.current = true;
          setStatus('Thinking');
        } catch {
          // The socket may close between the readyState check and send().
        }
      }

      vadFrameRef.current = requestAnimationFrame(runVad);
    };

    processor.port.onmessage = event => {
      try {
        const pcmBytes = new Uint8Array(event.data as ArrayBuffer);
        const encodedPcm = bytesToBase64(pcmBytes);
        const activeSocket = socketRef.current;

        if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
          // Keep a short startup buffer. This lets the user speak immediately
          // while the token/WebSocket/Live setup finishes.
          pendingPcmRef.current.push(encodedPcm);
          // Keep only a short startup window. A large backlog makes the model
          // process stale speech after the socket becomes ready.
          if (pendingPcmRef.current.length > 25) pendingPcmRef.current.shift();
          return;
        }

        activeSocket.send(JSON.stringify({
          realtimeInput: {
            audio: {
              data: encodedPcm,
              mimeType: 'audio/pcm;rate=16000',
            },
          },
        }));
      } catch {
        // The socket can close between the readyState check and send().
      }
    };

    source.connect(inputGain);
    inputGain.connect(inputCompressor);
    inputCompressor.connect(analyser);
    analyser.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    streamRef.current = stream;
    sourceRef.current = source;
    inputGainRef.current = inputGain;
    inputCompressorRef.current = inputCompressor;
    inputAnalyserRef.current = analyser;
    processorRef.current = processor;
    vadSpeechStartedRef.current = false;
    vadLastSpeechAtRef.current = performance.now();
    vadTurnEndedRef.current = false;
    if (vadFrameRef.current != null) cancelAnimationFrame(vadFrameRef.current);
    vadFrameRef.current = requestAnimationFrame(runVad);
    silentGainRef.current = silentGain;
    void requestWakeLock();
    setListening(true);
    setStatus('Listening');
  }, [requestWakeLock]);

  startInputRef.current = startInput;

  const stopInput = useCallback(() => {
    cleanupAudioInput();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch { /* ignore */ }
    }
    if (connected) setStatus('Thinking');
  }, [cleanupAudioInput, connected]);

  const connect = useCallback(async () => {
    const attempt = ++connectAttemptRef.current;
    endingRef.current = false;
    setError('');
    setStatus('Connecting');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.');
      }

      // Start every independent startup operation together. The microphone,
      // reusable token and AudioWorklet all race in parallel. None of them
      // waits for the others, and the WebSocket is opened as soon as the token
      // is available.
      const tokenPromise = createLiveToken(voiceName, appLanguage);
      tokenPromise.catch(() => undefined);

      const streamPromise = navigator.mediaDevices.getUserMedia({
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

      // Prepare the AudioWorklet immediately, in parallel with getUserMedia()
      // and token acquisition. Do not await it on the WebSocket path.
      if (!audioWorkletReadyRef.current) {
        const workletBlob = new Blob(
          [pcmCaptureWorkletSource],
          { type: 'application/javascript' },
        );
        const workletUrl = URL.createObjectURL(workletBlob);
        audioWorkletReadyRef.current = context.audioWorklet.addModule(workletUrl)
          .finally(() => URL.revokeObjectURL(workletUrl));
      }
      const workletPromise = audioWorkletReadyRef.current;

      // The microphone pipeline runs fully in parallel with the token and the
      // WebSocket handshake. The socket no longer waits for the permission
      // prompt or device start-up; early PCM is buffered and flushed on
      // setupComplete.
      void (async () => {
        try {
          const stream = await streamPromise;
          if (attempt !== connectAttemptRef.current || endingRef.current) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          streamRef.current = stream;
          if (context.state === 'suspended') {
            void context.resume().catch(() => undefined);
          }
          await workletPromise;
          if (attempt === connectAttemptRef.current && !endingRef.current) {
            await startInputRef.current?.();
          }
        } catch (micError) {
          if (attempt !== connectAttemptRef.current || endingRef.current) return;
          console.error('Live Talk microphone failed to start:', micError);
          setError(micError instanceof Error ? micError.message : 'Microphone access failed.');
          setStatus('Unable to start');
          cleanupAudioInput();
          closeSocket();
        }
      })();

      const { token, model } = await tokenPromise;
      if (endingRef.current || attempt !== connectAttemptRef.current) return;

      const socket = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`
      );
      socket.binaryType = 'arraybuffer';
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
                    ? 'At the beginning of this conversation, identify the language of the user’s first clearly spoken sentence. Use that as the conversation language and keep speaking and transcribing naturally in that language for the rest of this Live Talk session. Do not switch languages just because later words or phrases are mixed-language. Switch only if the user explicitly asks you to change language. If the first sentence is genuinely ambiguous, use the next clearly spoken sentence to identify the language.'
                    : `${getLanguageInstruction(appLanguage)} Continue using the selected language consistently, while following an explicit request from the user to switch languages.`) +
                  (assistantNameContext() ? `\n\n${assistantNameContext()}` : ''),
              }],
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                prefixPaddingMs: 40,
                silenceDurationMs: 300,
                startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              },
            },
          },
        }));
      };

      socket.onmessage = async event => {
        try {
          if (endingRef.current || attempt !== connectAttemptRef.current) return;
          const message = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : await decodeLiveMessage(event.data);

          if (message.setupComplete) {
            setConnected(true);
            setStatus('Listening');
            vadSpeechStartedRef.current = false;
            vadLastSpeechAtRef.current = performance.now();
            vadTurnEndedRef.current = false;

            // Send any speech captured while authentication/WebSocket setup
            // was in progress. This is what makes Live Talk feel as immediate
            // as the Mic/dictation button without losing the first words.
            const queuedAudio = pendingPcmRef.current.splice(0);
            for (const data of queuedAudio) {
              if (socket.readyState !== WebSocket.OPEN) break;
              try {
                socket.send(JSON.stringify({
                  realtimeInput: {
                    audio: { data, mimeType: 'audio/pcm;rate=16000' },
                  },
                }));
              } catch {
                break;
              }
            }

            // The microphone pipeline is normally already active. Keep this
            // call as a safe no-op fallback for reconnect/setup races.
            void startInputRef.current?.().catch(() => undefined);
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
            setCaption(prev => (prev.role === 'user' ? { role: 'user', text: prev.text + text } : { role: 'user', text }));
          }

          if (serverContent.outputTranscription?.text) {
            const text = String(serverContent.outputTranscription.text);
            assistantTurnRef.current += text;
            setCaption(prev => (prev.role === 'assistant' ? { role: 'assistant', text: prev.text + text } : { role: 'assistant', text }));
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
            vadSpeechStartedRef.current = false;
            vadLastSpeechAtRef.current = performance.now();
            vadTurnEndedRef.current = false;
            setListening(true);
            if (audioSourcesRef.current.size === 0) setStatus('Listening');
            // If the user just told the assistant what to call it, remember the
            // name and tell the running session so it applies immediately.
            const spokenUserTurn = userTurnRef.current.trim();
            if (spokenUserTurn) {
              const nameBefore = getAssistantName();
              learnAssistantName(spokenUserTurn);
              const nameAfter = getAssistantName();
              if (nameAfter && nameAfter !== nameBefore && socket.readyState === WebSocket.OPEN) {
                try {
                  socket.send(JSON.stringify({
                    clientContent: {
                      turns: [{ role: 'user', parts: [{ text: `(System note: the user now calls you "${nameAfter}". Use "${nameAfter}" as your own name from now on.)` }] }],
                      turnComplete: false,
                    },
                  }));
                } catch { /* ignore */ }
              } else if (!nameAfter && nameBefore && socket.readyState === WebSocket.OPEN) {
                try {
                  socket.send(JSON.stringify({
                    clientContent: {
                      turns: [{ role: 'user', parts: [{ text: '(System note: the user reset your custom name. You are Twinkle AI again.)' }] }],
                      turnComplete: false,
                    },
                  }));
                } catch { /* ignore */ }
              }
            }
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
    setCaption({ role: 'user', text: '' });
    setElapsed(0);
    setError('');
    // Activate the listening UI immediately; microphone/network initialization
    // continues underneath it without making the user wait for a connection.
    setListening(true);
    setStatus('Listening');
    endingRef.current = false;
    userTurnRef.current = '';
    assistantTurnRef.current = '';
    liveSessionIdRef.current = null;
    liveSessionPromiseRef.current = null;
    liveSavePromiseRef.current = null;
    liveTitleGeneratedRef.current = false;
    lastSavedSessionNameRef.current = null;
    livePublicIdRef.current = null;
    turnsRef.current = [];
    void ensureSession().catch(error => console.warn('Live Talk session pre-create failed:', error));
    void connect();
    return () => cleanup();
  }, [open, connect, cleanup, ensureSession]);

  const handleClose = () => {
    if (endingRef.current) return;

    // Capture the current session ID before cleanup. cleanup() intentionally
    // stops the live connection but does not destroy the persisted session ID.
    const existingSessionId = liveSessionIdRef.current;
    const hasFinalTurn =
      Boolean(userTurnRef.current.trim()) ||
      Boolean(assistantTurnRef.current.trim());

    // Nothing was said: discard the pre-created empty session and just close.
    if (turnsRef.current.length === 0 && !hasFinalTurn) {
      void (async () => {
        try {
          const id = liveSessionIdRef.current ?? (await liveSessionPromiseRef.current?.catch(() => null));
          if (id) await chatApi.deleteSession(id);
        } catch { /* best effort */ }
      })();
      cleanup();
      onClose();
      return;
    }

    // Show the conversation immediately from the local transcript; the saved
    // copy replaces it as soon as the final save finishes.
    const previewTurns = [...turnsRef.current];
    if (userTurnRef.current.trim()) previewTurns.push({ role: 'user', content: userTurnRef.current.trim() });
    if (assistantTurnRef.current.trim()) previewTurns.push({ role: 'assistant', content: assistantTurnRef.current.trim() });
    onSessionPreview?.({
      sessionId: existingSessionId,
      publicId: livePublicIdRef.current || undefined,
      sessionName: lastSavedSessionNameRef.current || undefined,
      turns: previewTurns,
    });

    // Persist the final partial turn, if any, and ALWAYS wait for saves that
    // are still in flight. Previously, ending the call while the first turn was
    // still being saved (session not created yet) reported an empty session id,
    // so the chat never opened until a refresh.
    const savePromise: Promise<number | null> = (hasFinalTurn
      ? persistCompletedTurn()
      : (liveSavePromiseRef.current ?? Promise.resolve())
    ).then(() => liveSessionIdRef.current ?? existingSessionId);

    // Close the Live Talk UI immediately. The parent callback is deliberately
    // fired only after the final save finishes, so Chat.tsx can safely load
    // the complete database transcript.
    cleanup();
    onClose();

    void savePromise
      .then(sessionId => {
        const normalizedId = Number(sessionId);
        if (sessionId != null && Number.isFinite(normalizedId) && normalizedId > 0) {
          onSessionComplete?.(normalizedId, lastSavedSessionNameRef.current || undefined, livePublicIdRef.current || undefined);
        }
      })
      .catch(error => {
        console.error('Failed to finalize Live Talk session:', error);

        // Even if the final save failed, if a session was already created we
        // can still hand it back to Chat.tsx so it can attempt to load the
        // available persisted history.
        const fallbackId = liveSessionIdRef.current ?? existingSessionId;
        if (fallbackId != null && Number.isFinite(fallbackId) && fallbackId > 0) {
          onSessionComplete?.(fallbackId, lastSavedSessionNameRef.current || undefined, livePublicIdRef.current || undefined);
        }
      });
  };

  // ── Keyboard: M toggles the microphone, Esc ends the conversation ─────────
  const keyActionsRef = useRef({ close: () => {}, toggleMic: () => {} });
  keyActionsRef.current = {
    close: handleClose,
    toggleMic: () => (listening ? stopInput() : void startInput()),
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        keyActionsRef.current.close();
      } else if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        keyActionsRef.current.toggleMic();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // ── Call timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  // ── Microphone level → voice ring (written straight to the DOM, no re-render)
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let smooth = 0;
    const makeBuffer = (size: number) => new Uint8Array(size);
    let buffer: ReturnType<typeof makeBuffer> | null = null;

    const tick = () => {
      const analyser = inputAnalyserRef.current;
      let level = 0;
      if (analyser) {
        if (!buffer || buffer.length !== analyser.fftSize) buffer = makeBuffer(analyser.fftSize);
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.min(1, Math.sqrt(sum / buffer.length) * 6);
      }
      smooth += (level - smooth) * 0.25;
      levelRef.current?.style.setProperty('--lvl', smooth.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const retry = () => {
    cleanupAudioInput();
    closeSocket();
    void connect();
  };

  const palette = getVoiceOrbPalette(voiceName);
  const thinking = status === 'Thinking';
  const hasError = Boolean(error);

  const label = hasError
    ? status
    : speaking
      ? 'Speaking'
      : thinking
        ? 'Thinking'
        : listening
          ? connected || status === 'Listening' ? 'Listening' : status
          : 'Microphone paused';

  const hint = hasError
    ? ''
    : speaking
      ? 'Start talking any time to interrupt.'
      : thinking
        ? ''
        : listening
          ? 'Just start talking.'
          : 'Tap the microphone to talk again.';

  const orbState = speaking ? 'speaking' : thinking ? 'thinking' : listening ? 'listening' : 'idle';
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const captionText = caption.text.trim().slice(-240);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Live Talk"
          className="fixed inset-0 z-[100000] flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--bg-main)] text-zinc-900 dark:text-zinc-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Ambient light in the voice's color */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 transition-opacity duration-700"
            style={{
              background: `radial-gradient(55% 48% at 50% 40%, ${palette.glow}, transparent 72%)`,
              opacity: speaking ? 0.9 : 0.5,
            }}
          />

          {/* Top bar */}
          <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                {connected && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />}
                <span className={`relative inline-flex h-2 w-2 rounded-full ${hasError ? 'bg-red-500' : connected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              </span>
              <span className="font-medium">Live Talk</span>
              <span className="tabular-nums text-zinc-500 dark:text-zinc-400">{mm}:{ss}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 items-center gap-2 rounded-full border border-zinc-200 bg-white/70 pl-1.5 pr-3 text-[13px] text-zinc-700 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
                <span className="h-5 w-5 rounded-full" style={{ background: palette.background }} aria-hidden="true" />
                {voiceName}
              </span>
              <button
                type="button"
                onClick={handleClose}
                aria-label="End conversation"
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-200/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-300 dark:hover:bg-white/10"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
            </div>
          </header>

          {/* Stage */}
          <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6">
            <div ref={levelRef}>
              <VoiceRing
                palette={palette}
                state={orbState}
                muted={!listening && !speaking && !thinking && !hasError}
                className="h-56 w-56 sm:h-72 sm:w-72"
                label={`${voiceName} voice`}
              />
            </div>

            <div className="mt-12 flex flex-col items-center text-center" role="status" aria-live="polite">
              <motion.p
                key={label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 text-xl font-medium tracking-tight sm:text-2xl"
              >
                {label}
                {thinking && !hasError && (
                  <span className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2].map(dot => (
                      <motion.span
                        key={dot}
                        className="h-1.5 w-1.5 rounded-full bg-current"
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1, repeat: Infinity, delay: dot * 0.18 }}
                      />
                    ))}
                  </span>
                )}
              </motion.p>
              {hint && <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{hint}</p>}
            </div>

            {/* Live captions */}
            <div className="mt-6 flex min-h-[72px] w-full max-w-xl flex-col items-center text-center" aria-live="off">
              <AnimatePresence mode="wait">
                {captionText && !hasError && (
                  <motion.div
                    key={caption.role}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                      {caption.role === 'user' ? 'You' : 'Twinkle'}
                    </p>
                    <p
                      data-twinkle-user-content
                      className={`mt-1 text-[15px] leading-6 ${
                        caption.role === 'user' ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-800 dark:text-zinc-100'
                      }`}
                    >
                      {captionText}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {hasError && (
              <div
                role="alert"
                className="mt-2 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-[#ecc5c3] bg-[#fdf6f5] px-5 py-4 text-center text-sm leading-5 text-[#b3261e] dark:border-[#7f1d1d] dark:bg-[#2a0f12] dark:text-[#f2b8b5]"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={retry}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-current/30 px-3 text-[13px] font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Try again
                </button>
              </div>
            )}
          </main>

          {/* Controls */}
          <footer className="relative z-10 flex flex-col items-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white/80 p-1.5 shadow-[0_6px_28px_rgba(0,0,0,0.08)] backdrop-blur dark:border-white/10 dark:bg-[#30302E]/80">
              <button
                type="button"
                onClick={listening ? stopInput : () => void startInput()}
                aria-pressed={!listening}
                aria-label={listening ? 'Pause microphone' : 'Resume microphone'}
                title={listening ? 'Pause microphone (M)' : 'Resume microphone (M)'}
                className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
                  listening
                    ? 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/15'
                    : 'bg-[#fdecea] text-[#b3261e] hover:bg-[#fbd9d5] dark:bg-[#3a1a1a] dark:text-[#f2b8b5]'
                }`}
              >
                {listening ? <Mic className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <MicOff className="h-[18px] w-[18px]" strokeWidth={1.8} />}
              </button>
              <button
                type="button"
                onClick={handleClose}
                title="End conversation (Esc)"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#C6613F] px-6 text-sm font-medium text-white transition-colors hover:bg-[#b4553a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C6613F]/50"
              >
                End
              </button>
            </div>

            <p className="hidden items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400 sm:flex">
              <span><kbd className="rounded border border-zinc-300 px-1.5 py-0.5 font-sans dark:border-white/20">M</kbd> mute</span>
              <span><kbd className="rounded border border-zinc-300 px-1.5 py-0.5 font-sans dark:border-white/20">Esc</kbd> end</span>
            </p>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
