import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff } from 'lucide-react';
import { chatApi, createLiveToken } from '../lib/api';
import { APP_LANGUAGE_KEY, getLanguageInstruction, type AppLanguage } from '../lib/i18n';
import pcmCaptureWorkletSource from '../audio/pcm-capture-worklet.ts?raw';
import { getSavedLiveTalkColor } from '../lib/liveTalkColors';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Called after the final Live Talk data has been persisted. */
  onSessionComplete?: (sessionId: number, sessionName?: string) => void;
};

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  released: boolean;
  addEventListener?: (type: string, listener: EventListener) => void;
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

export default function LiveTalkModal({ open, onClose, onSessionComplete }: Props) {
  const socketRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
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
  const userTurnRef = useRef('');
  const assistantTurnRef = useRef('');
  const endingRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  // Buffer microphone PCM while the Gemini Live socket is connecting so
  // the user can start speaking immediately without losing the first words.
  const pendingPcmRef = useRef<string[]>([]);

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
  const [liveTalkColor, setLiveTalkColor] = useState(() => getSavedLiveTalkColor());
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

    const handleColorChange = (event: Event) => {
      const custom = event as CustomEvent<string>;
      if (custom.detail) setLiveTalkColor(getSavedLiveTalkColor());
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
    window.addEventListener('twinkle-live-talk-color-change', handleColorChange);
    return () => {
      window.removeEventListener('twinkle-voice-change', handleVoiceChange);
      window.removeEventListener('twinkle-language-change', handleLanguageChange);
      window.removeEventListener('twinkle-live-talk-color-change', handleColorChange);
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
    silentGainRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    silentGainRef.current = null;
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
    const processor = new AudioWorkletNode(context, 'twinkle-pcm-capture');
    const silentGain = context.createGain();
    silentGain.gain.value = 0;

    processor.port.onmessage = event => {
      try {
        const pcmBytes = new Uint8Array(event.data as ArrayBuffer);
        const encodedPcm = bytesToBase64(pcmBytes);
        const activeSocket = socketRef.current;

        if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
          // Keep a short startup buffer. This lets the user speak immediately
          // while the token/WebSocket/Live setup finishes.
          pendingPcmRef.current.push(encodedPcm);
          if (pendingPcmRef.current.length > 150) pendingPcmRef.current.shift();
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

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    streamRef.current = stream;
    sourceRef.current = source;
    processorRef.current = processor;
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

      const stream = await streamPromise;
      if (attempt !== connectAttemptRef.current || endingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = stream;

      if (context.state === 'suspended') {
        void context.resume().catch(() => undefined);
      }

      // Start the microphone pipeline without awaiting it. It buffers PCM
      // while the token/WebSocket/setup is still completing.
      void Promise.resolve(workletPromise)
        .then(() => {
          if (attempt === connectAttemptRef.current && !endingRef.current) {
            return startInputRef.current?.();
          }
          return undefined;
        })
        .catch(error => {
          if (attempt === connectAttemptRef.current && !endingRef.current) {
            console.error('Live Talk audio pipeline failed to start:', error);
          }
        });

      const { token, model } = await tokenPromise;
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
    const savePromise = hasFinalTurn
      ? persistCompletedTurn()
      : Promise.resolve(existingSessionId);

    // Close the Live Talk UI immediately. The parent callback is deliberately
    // fired only after the final save finishes, so Chat.tsx can safely load
    // the complete database transcript.
    cleanup();
    onClose();

    void savePromise
      .then(sessionId => {
        const normalizedId = Number(sessionId);
        if (Number.isFinite(normalizedId)) {
          onSessionComplete?.(normalizedId, lastSavedSessionNameRef.current || undefined);
        }
      })
      .catch(error => {
        console.error('Failed to finalize Live Talk session:', error);

        // Even if the final save failed, if a session was already created we
        // can still hand it back to Chat.tsx so it can attempt to load the
        // available persisted history.
        if (existingSessionId != null && Number.isFinite(existingSessionId)) {
          onSessionComplete?.(existingSessionId, lastSavedSessionNameRef.current || undefined);
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
                  background: `radial-gradient(circle at center, ${liveTalkColor.glow}, transparent 36%)`,
                }}
              />

              <div className="relative z-10 flex flex-col items-center text-center">
                <motion.div
                  animate={
                    speaking
                      ? { scale: [1, 1.08, 1], boxShadow: [`0 0 0 0 ${liveTalkColor.glow}`, `0 0 0 28px transparent`, `0 0 0 0 ${liveTalkColor.glow}`] }
                      : listening
                        ? { scale: [1, 1.035, 1] }
                        : { scale: 1 }
                  }
                  transition={{ duration: speaking ? 1.15 : 1.8, repeat: speaking || listening ? Infinity : 0, ease: 'easeInOut' }}
                  className="h-28 w-28 rounded-full sm:h-36 sm:w-36"
                  style={{
                    background: liveTalkColor.background,
                    boxShadow: `0 24px 80px ${liveTalkColor.glow}`, 
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
