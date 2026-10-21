import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Mic, MicOff, RotateCw, X } from 'lucide-react';
import VoiceRing from './VoiceRing';
import { getVoiceOrbPalette } from '../lib/voiceThemes'; 
import { VOICES, DEFAULT_VOICE, getVoiceGreeting } from '../lib/voices';
import {
  chatApi,
  createLiveToken, 
  assistantNameContext,
  ASSISTANT_NAME_RULES,
  learnAssistantName,
  learnAssistantNameFromReply,
  buildLiveSocketUrl,
  reportLiveSocketFailure,
  reportLiveSocketSuccess,
} from '../lib/api';
import type { WeatherSnapshot } from '../lib/api';
import { LIVE_TOOL_DECLARATIONS, LIVE_TOOL_ACTIVITY, runLiveTool, describeWeatherCode, warmLiveContext, getLiveContextLine } from '../lib/liveTools';
import { APP_LANGUAGE_KEY, getLanguageInstruction, type AppLanguage } from '../lib/i18n';
import pcmCaptureWorkletSource from '../audio/pcm-capture-worklet.ts?raw';
import { describeLiveClose, friendlyLiveError } from '../lib/liveErrors';

/** A weather lookup made during the call and the assistant reply (0-based) it belongs to. */
export type LiveWeatherEntry = { assistantIndex: number; snapshot: WeatherSnapshot };

type Props = {
  open: boolean;
  onClose: () => void; 
  /** Name used when the voice greets the user at the start of a session. */
  userName?: string | null;
  /** Called after the final Live Talk data has been persisted. */
  onSessionComplete?: (sessionId: number, sessionName?: string, publicId?: string, weather?: LiveWeatherEntry[]) => void;
  /** Fired the instant Live Talk ends, with the local transcript, so the chat can be shown before saving finishes. */
  onSessionPreview?: (info: {
    sessionId: number | null;
    publicId?: string;
    sessionName?: string;
    turns: Array<{ role: 'user' | 'assistant'; content: string }>;
    weather?: LiveWeatherEntry[];
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


// The capture worklet may be registered only ONCE per AudioContext. Calling
// addModule() again for the same context (for example on "Try again", after a
// reconnect, or in React StrictMode) throws "A processor with name
// 'twinkle-pcm-capture' is already registered" - the "Uncaught" error seen in
// the console. Tracking the load per context makes registration idempotent.
const captureWorkletByContext = new WeakMap<BaseAudioContext, Promise<void>>();

const ensureCaptureWorklet = (context: AudioContext): Promise<void> => {
  let ready = captureWorkletByContext.get(context);
  if (!ready) {
    const workletUrl = URL.createObjectURL(
      new Blob([pcmCaptureWorkletSource], { type: 'application/javascript' }),
    );
    ready = context.audioWorklet.addModule(workletUrl)
      .finally(() => URL.revokeObjectURL(workletUrl));
    captureWorkletByContext.set(context, ready);
    ready.catch(() => captureWorkletByContext.delete(context));
  }
  return ready;
};

// AudioContext.close() rejects when the context is already closed. Closing is
// best-effort cleanup, so that must never surface as an unhandled rejection.
const closeAudioContext = (context: AudioContext | null | undefined) => {
  if (!context || context.state === 'closed') return;
  context.close().catch(() => undefined);
};

// BCP-47 hints for Gemini's input transcription when the user picked a
// specific language. Telling the recogniser the language removes a whole class
// of mis-hearings between similar-sounding words.
const TRANSCRIPTION_LOCALES: Record<string, string> = {
  en: 'en-US', hi: 'hi-IN', te: 'te-IN', ta: 'ta-IN', kn: 'kn-IN', ml: 'ml-IN',
  bn: 'bn-IN', mr: 'mr-IN', gu: 'gu-IN', pa: 'pa-IN', ur: 'ur-PK', ar: 'ar-SA',
  es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-PT', ru: 'ru-RU',
  ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', tr: 'tr-TR', vi: 'vi-VN', id: 'id-ID',
  th: 'th-TH', fil: 'fil-PH',
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

// Startup / resilience tuning.
// - MAX_SOCKET_RETRIES: extra connection attempts (each with a freshly minted
//   token) when the handshake or setup fails before the session is ready.
// - MAX_SESSION_RECONNECTS: silent reconnects of a session that was working
//   (network blip, the server's ~10 minute connection limit, goAway).
// - SETUP_TIMEOUT_MS: give up on a socket that never reaches setupComplete.
// - PENDING_PCM_MAX_CHUNKS: microphone audio buffered while connecting
//   (~10 ms per chunk, so ~4 s) so the first words are never lost.
const MAX_SOCKET_RETRIES = 2;
const MAX_SESSION_RECONNECTS = 6;
const SETUP_TIMEOUT_MS = 8000;
const PENDING_PCM_MAX_CHUNKS = 400;
const STABLE_SESSION_MS = 60_000;

// Remember (for a week) that the server rejected the optional transcription
// language hint, so later sessions skip it instead of paying for a failed
// setup + reconnect every single time.
const BASIC_SETUP_KEY = 'twinkle_live_basic_setup_at';
const BASIC_SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const readBasicSetupFlag = (): boolean => {
  try {
    const at = Number(localStorage.getItem(BASIC_SETUP_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < BASIC_SETUP_TTL_MS;
  } catch {
    return false;
  }
};
const saveBasicSetupFlag = () => {
  try { localStorage.setItem(BASIC_SETUP_KEY, String(Date.now())); } catch { /* storage unavailable */ }
};

// Live tools (function calling + Google Search). If Google ever rejects the tool
// configuration (close 1007/1008 before setupComplete) Live Talk steps down one
// level and retries instead of failing:
//   2 = Google Search + app tools (time, location, weather, knowledge base)
//   1 = app tools only
//   0 = no tools
// The reduced level is remembered for a few hours so later sessions do not
// repeat the failed attempt.
// Off: Google Search grounding has its own quota that the free Gemini tier
// exceeds, which made every Live Talk start fail once before reconnecting.
// Set to true again once billing is enabled on the Gemini project.
const ENABLE_GOOGLE_SEARCH = false;
const MAX_TOOLS_LEVEL = ENABLE_GOOGLE_SEARCH ? 2 : 1;
const TOOLS_LEVEL_KEY = 'twinkle_live_tools_level';
const TOOLS_LEVEL_TTL_MS = 3 * 60 * 60 * 1000;
const readToolsLevel = (): number => {
  try {
    const raw = JSON.parse(localStorage.getItem(TOOLS_LEVEL_KEY) || 'null') as { level?: number; at?: number } | null;
    if (raw && Number.isFinite(raw.level) && Number.isFinite(raw.at) && Date.now() - (raw.at as number) < TOOLS_LEVEL_TTL_MS) {
      // Never reuse a persisted "no tools" session. Level 0 disables every
      // app tool, which makes Live Talk unable to answer weather/location
      // questions even though the session itself connects successfully.
      return Math.max(1, Math.min(MAX_TOOLS_LEVEL, raw.level as number));
    }
  } catch { /* ignore */ }
  return MAX_TOOLS_LEVEL;
};
const saveToolsLevel = (level: number) => {
  try { localStorage.setItem(TOOLS_LEVEL_KEY, JSON.stringify({ level, at: Date.now() })); } catch { /* storage unavailable */ }
};

const buildSystemInstruction = (language: AppLanguage, toolsLevel: number, voiceName: string): string => {
  const languageRule = language === 'auto'
    ? 'At the beginning of this conversation, identify the language of the user’s first clearly spoken sentence. Use that as the conversation language and keep speaking and transcribing naturally in that language for the rest of this Live Talk session. Do not switch languages just because later words or phrases are mixed-language. Switch only if the user explicitly asks you to change language. If the first sentence is genuinely ambiguous, use the next clearly spoken sentence to identify the language.'
    : `${getLanguageInstruction(language)} Continue using the selected language consistently, while following an explicit request from the user to switch languages.`;

  const clock = `Current local date and time for the user: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(new Date())} (timezone ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'}).`;

  const toolRules = toolsLevel === 0
    ? 'You have no live lookup tools in this voice session, but you still always help. For the time and date, use the clock line below. ' +
      'For anything else live (weather, location, news, prices), give the most useful answer you can from your own knowledge, ' +
      'say in a few words that it may not be the very latest, and offer a quick next step. Never answer with just "I don\'t know" or "I can\'t".'
    : 'LIVE TOOLS: You are connected to live tools, so you CAN answer live questions. ' +
      'Never say you lack real-time, location, weather, date or clock access, and never guess or invent these values. Use the right tool:\n' +
      '- get_weather: ANY question about weather, temperature, rain, umbrella, wind, humidity, forecast, sunrise or sunset, or how hot or cold it is. If the user names a place, pass it as `place`; otherwise omit `place` to use their current location.\n' +
      '- get_user_location: "where am I", "my location", "near me", "nearby", "nearest", or which village, mandal, district, state or country they are in.\n' +
      '- get_current_datetime: ANY question about the time, date, day, month or year (the clock line below can be out of date in a long conversation). For the time in another city or country, pass it as `place`.\n' +
      '- get_exchange_rate: currency conversion and exchange rates.\n' +
      '- search_web: any factual question about people, places, companies, events, science, sports or history that you are not completely sure about or that may have changed recently.\n' +
      '- search_knowledge_base: questions about the user\'s own uploaded documents, files, notes or library.\n' +
      (toolsLevel >= 2
        ? '- Google Search: current events, news, sports scores, prices, schedules, and any fact that may have changed recently or that you are not sure about.\n'
        : '') +
      'You may say a very short natural phrase such as "one moment" before using a tool. Then answer in one or two natural spoken sentences. ' +
      'Never read out JSON, field names, weather codes or coordinates (unless the user asks for coordinates).\n' +
      'NEVER REFUSE A LIVE QUESTION: do not answer with "I don\'t know", "I can\'t access that" or "I don\'t have real-time data". ' +
      'If a tool returns an error or approximate data, still give the best helpful answer: use another tool, the clock line, the known location, or your own knowledge, ' +
      'state any limit in a few natural words (for example "that is approximate" or "that may not be the very latest"), and offer the next step ' +
      '(for example asking which city they mean). Never make up live values such as temperatures, scores or prices.';

  const knownLocation = getLiveContextLine();

  return (
    `You are ${voiceName}, a polished professional voice assistant. Use the name ${voiceName} if you introduce yourself. Speak naturally, concisely, confidently, and warmly. Answer the user directly and keep the conversation conversational. ` +
    `${languageRule}` +
    `\n\n${ASSISTANT_NAME_RULES}` +
    (assistantNameContext() ? `\n\n${assistantNameContext()}` : '') +
    `\n\n${clock}` +
    (knownLocation ? `\n${knownLocation}` : '') +
    `\n\n${toolRules}`
  );
};

const describeMicError = (error: unknown): string => {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone permission is blocked. Allow microphone access for this site in your browser, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Connect one and try again.';
  }
  if (name === 'NotReadableError') {
    return 'The microphone is being used by another app. Close it and try again.';
  }
  return error instanceof Error && error.message ? error.message : 'Microphone access failed.';
};

export default function LiveTalkModal({ open, onClose, userName, onSessionComplete, onSessionPreview }: Props) {
  // The voice greets the user once per session (not again after a reconnect).
  const greetedRef = useRef(false);
  const userNameRef = useRef<string | null | undefined>(userName);
  userNameRef.current = userName;
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
  const setupDoneRef = useRef(false);
  const basicSetupRef = useRef(false);
  const toolsLevelRef = useRef(MAX_TOOLS_LEVEL);
  // Tool calls the server cancelled (the user interrupted); their results must
  // not be sent back.
  const cancelledToolIdsRef = useRef<Set<string>>(new Set());
  const weatherTimerRef = useRef<number | null>(null);
  const reconnectsRef = useRef(0);
  // Latest Gemini session-resumption handle, so a dropped session can be
  // resumed with its conversation context instead of starting from scratch.
  const resumeHandleRef = useRef<string | null>(null);
  // True once the model finished its turn; lets the UI leave "Thinking" as
  // soon as the last audio chunk has played.
  const modelTurnDoneRef = useRef(true);
  const liveSessionIdRef = useRef<number | null>(null);
  const liveSessionPromiseRef = useRef<Promise<number> | null>(null);
  const liveSavePromiseRef = useRef<Promise<void> | null>(null);
  const liveTitleGeneratedRef = useRef(false);
  const lastSavedSessionNameRef = useRef<string | null>(null);
  const livePublicIdRef = useRef<string | null>(null);
  const turnsRef = useRef<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  // Every weather lookup of this call, so the chat can show the weather card(s) afterwards.
  const weatherLogRef = useRef<LiveWeatherEntry[]>([]);
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
  // The server-side detector is the primary end-of-turn signal. This local
  // fallback only fires after a clearly longer pause, so a natural gap inside a
  // sentence ("Who ... are you?") can no longer split it into two turns.
  const VAD_SILENCE_MS = 700;
  const VAD_THRESHOLD = 0.006;

  const [connected, setConnected] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceName, setVoiceName] = useState(getSavedVoice);
  const [, setAppLanguage] = useState<AppLanguage>(() => {
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
  // What a running live tool is doing ("Checking the weather"), and the latest
  // weather lookup, shown as a small card on the Live Talk screen.
  const [toolActivity, setToolActivity] = useState('');
  const [weatherChip, setWeatherChip] = useState<WeatherSnapshot | null>(null);
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
    closeAudioContext(audioContextRef.current);
    audioContextRef.current = null;
    outputCompressorRef.current = null;
    outputGainRef.current = null;
    setConnected(false);
    setToolActivity('');
    setWeatherChip(null);
    if (weatherTimerRef.current != null) {
      window.clearTimeout(weatherTimerRef.current);
      weatherTimerRef.current = null;
    }
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
        if (modelTurnDoneRef.current) {
          setStatus(current => (current === 'Thinking' ? 'Listening' : current));
        }
      }
    };

    source.start(startAt);
  }, []);

  const ensureOutputChain = useCallback((context: AudioContext) => {
    if (outputCompressorRef.current && outputGainRef.current) return;
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
  }, []);

  const startInputOnce = useCallback(async () => {
    if (endingRef.current) return;
    if (processorRef.current) return;
    const attempt = connectAttemptRef.current;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone access is not supported in this browser.');
    }
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio is not supported in this browser.');

    // Never build on a closed context: nodes constructed on it are useless and
    // AudioWorkletNode construction fails outright.
    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioContextCtor({ latencyHint: 'interactive' }) as AudioContext;
      outputCompressorRef.current = null;
      outputGainRef.current = null;
    }
    audioContextRef.current = context;
    ensureOutputChain(context);
    // Do not block on resume(): it can only finish once the context is allowed
    // to run, and everything below can proceed meanwhile.
    if (context.state === 'suspended') void context.resume().catch(() => undefined);

    // Microphone permission/device start-up and the AudioWorklet module load
    // are independent, so they run at the same time.
    const existingStream = streamRef.current;
    const streamPromise: Promise<MediaStream> = existingStream
      ? Promise.resolve(existingStream)
      : navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
    const workletPromise = ensureCaptureWorklet(context);
    const [streamResult, workletResult] = await Promise.allSettled([streamPromise, workletPromise]);

    if (streamResult.status === 'rejected') throw streamResult.reason;
    const stream = streamResult.value;
    if (workletResult.status === 'rejected') {
      if (streamRef.current !== stream) stream.getTracks().forEach(track => track.stop());
      throw workletResult.reason;
    }

    // Live Talk may have ended, or the context been replaced, while the mic and
    // worklet were loading. Building nodes now would only produce "context is
    // closed" warnings and leak the microphone stream.
    if (
      endingRef.current ||
      attempt !== connectAttemptRef.current ||
      audioContextRef.current !== context ||
      context.state === 'closed'
    ) {
      if (streamRef.current !== stream) stream.getTracks().forEach(track => track.stop());
      return;
    }

    const source = context.createMediaStreamSource(stream);

    // Speech-recognition friendly capture: the browser already applies echo
    // cancellation, noise suppression and automatic gain control, so the
    // signal stays clean at unity gain.
    const inputGain = context.createGain();
    inputGain.gain.value = 1;

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

      if (audioSourcesRef.current.size > 0) {
        // While the assistant is speaking, the microphone mostly hears the
        // speaker (echo) and room noise. Ending the user's "turn" from that
        // signal made the server cut the answer off half-way, so the client
        // VAD stays idle until playback is finished. Real interruptions are
        // still detected by the server's own voice activity detection.
        vadSpeechStartedRef.current = false;
        vadTurnEndedRef.current = false;
        vadLastSpeechAtRef.current = now;
      } else if (hasSpeech) {
        vadSpeechStartedRef.current = true;
        vadLastSpeechAtRef.current = now;
        vadTurnEndedRef.current = false;
      } else if (
        vadSpeechStartedRef.current &&
        !vadTurnEndedRef.current &&
        socketRef.current?.readyState === WebSocket.OPEN &&
        setupDoneRef.current &&
        now - vadLastSpeechAtRef.current >= VAD_SILENCE_MS
      ) {
        // Hybrid VAD: tell Gemini the turn ended immediately. This avoids
        // waiting for the server's longer silenceDurationMs fallback.
        try {
          socketRef.current.send(JSON.stringify({
            realtimeInput: { audioStreamEnd: true },
          }));
          vadTurnEndedRef.current = true;
          modelTurnDoneRef.current = false;
          setStatus('Thinking');
          // Safety net: background noise can end a "turn" the model never
          // answers. Do not stay on "Thinking" forever in that case.
          window.setTimeout(() => {
            if (!endingRef.current && audioSourcesRef.current.size === 0) {
              setStatus(current => (current === 'Thinking' ? 'Listening' : current));
            }
          }, 10_000);
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

        // Audio may only be sent after the server's setupComplete frame.
        if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN || !setupDoneRef.current) {
          // Keep a startup buffer. This lets the user speak immediately while
          // the token/WebSocket/Live setup finishes, without losing the first
          // word. Anything older than ~4 s would only make the model process
          // stale speech, so the oldest chunks are dropped first.
          pendingPcmRef.current.push(encodedPcm);
          if (pendingPcmRef.current.length > PENDING_PCM_MAX_CHUNKS) pendingPcmRef.current.shift();
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
    inputGain.connect(analyser);
    analyser.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    streamRef.current = stream;
    sourceRef.current = source;
    inputGainRef.current = inputGain;
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
    setStatus(current => (current === 'Connecting' ? 'Listening' : current));
  }, [requestWakeLock, ensureOutputChain]);

  // The microphone can be started from two places at nearly the same moment
  // (session start and the mic button). Share one in-flight start so that
  // only a single capture pipeline is ever created.
  const startInputPromiseRef = useRef<Promise<void> | null>(null);
  const startInput = useCallback((): Promise<void> => {
    if (!startInputPromiseRef.current) {
      startInputPromiseRef.current = startInputOnce().finally(() => {
        startInputPromiseRef.current = null;
      });
    }
    return startInputPromiseRef.current;
  }, [startInputOnce]);

  const stopInput = useCallback(() => {
    cleanupAudioInput();
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } })); } catch { /* ignore */ }
    }
    if (connected) setStatus('Thinking');
  }, [cleanupAudioInput, connected]);

  const showWeather = useCallback((snapshot: WeatherSnapshot) => {
    // The assistant reply that is being spoken right now is the next one to be saved.
    const assistantIndex = turnsRef.current.filter(turn => turn.role === 'assistant').length;
    weatherLogRef.current.push({ assistantIndex, snapshot });
    setWeatherChip(snapshot);
    if (weatherTimerRef.current != null) window.clearTimeout(weatherTimerRef.current);
    weatherTimerRef.current = window.setTimeout(() => setWeatherChip(null), 45_000);
  }, []);

  const startSession = useCallback(async () => {
    const attempt = ++connectAttemptRef.current;
    endingRef.current = false;
    const isStale = () => endingRef.current || attempt !== connectAttemptRef.current;

    setError('');
    setStatus('Connecting');
    setupDoneRef.current = false;
    reconnectsRef.current = 0;
    resumeHandleRef.current = null;
    basicSetupRef.current = readBasicSetupFlag();
    toolsLevelRef.current = readToolsLevel();
    cancelledToolIdsRef.current = new Set();
    setToolActivity('');
    setWeatherChip(null);
    pendingPcmRef.current = [];
    modelTurnDoneRef.current = true;

    // Read the session configuration once, straight from storage, so a
    // re-render during the session can never restart the connection.
    const voice = getSavedVoice();
    let language: AppLanguage = 'auto';
    try {
      language = (localStorage.getItem(APP_LANGUAGE_KEY) || 'auto') as AppLanguage;
    } catch { /* keep auto */ }

    const failSession = (message: string, nextStatus: string) => {
      setError(message);
      setStatus(nextStatus);
      cleanupAudioInput();
      closeSocket();
    };

    // The microphone pipeline runs fully in parallel with the token and the
    // WebSocket handshake: the socket never waits for the permission prompt or
    // device start-up, and early PCM is buffered and flushed on setupComplete.
    void startInput().catch(micError => {
      if (isStale()) return;
      console.error('Live Talk microphone failed to start:', micError);
      failSession(describeMicError(micError), 'Unable to start');
      // Invalidate any pending reconnect timers for this attempt.
      connectAttemptRef.current += 1;
    });

    // Resolve the user's rough location in the background (no permission
    // prompt) so the very first "near me" / weather question is already grounded.
    const contextWarmup = warmLiveContext();

    // True once this Live Talk call has been ready at least once. Before that,
    // a retry is just part of starting up, so the screen keeps saying
    // "Connecting" instead of "Reconnecting".
    let sessionWasReady = false;

    const scheduleRetry = (nextIndex: number) => {
      setStatus(sessionWasReady ? 'Reconnecting' : 'Connecting');
      window.setTimeout(() => {
        if (!isStale()) void openSocket(nextIndex);
      }, 150 + 150 * nextIndex);
    };

    const openSocket = async (retryIndex: number): Promise<void> => {
      if (isStale()) return;
      // A resume handle that keeps failing is discarded on the last retries.
      if (retryIndex >= MAX_SOCKET_RETRIES) resumeHandleRef.current = null;

      let tokenInfo: Awaited<ReturnType<typeof createLiveToken>>;
      try {
        // A retry always mints a fresh token: the cached one may be exactly
        // what the server just rejected.
        tokenInfo = await createLiveToken(voice, language, retryIndex > 0);
      } catch (tokenError) {
        if (isStale()) return;
        const fatal = (tokenError as { fatal?: boolean } | null)?.fatal === true;
        if (!fatal && retryIndex < MAX_SOCKET_RETRIES) {
          scheduleRetry(retryIndex + 1);
          return;
        }
        failSession(
          friendlyLiveError(tokenError, 'Could not start Live Talk. Please try again.'),
          'Unable to start',
        );
        return;
      }
      if (isStale()) return;

      // Give the location warm-up a moment (it usually finished during the token
      // request) so it can be placed in the system instruction.
      await Promise.race([contextWarmup, new Promise<void>(resolve => window.setTimeout(resolve, 1200))]);
      if (isStale()) return;

      const { token, model, apiVersion } = tokenInfo;
      const socket = new WebSocket(buildLiveSocketUrl(token, apiVersion));
      socket.binaryType = 'arraybuffer';
      socketRef.current = socket;
      let opened = false;
      let setupDone = false;
      let setupAt = 0;
      let hintSent = false;
      setupDoneRef.current = false;

      // A handshake that never completes must not leave the user waiting.
      const setupTimer = window.setTimeout(() => {
        if (!setupDone && socketRef.current === socket) {
          try { socket.close(4000, 'Live Talk setup timed out'); } catch { /* ignore */ }
        }
      }, SETUP_TIMEOUT_MS);

      // Runs the live tools the model asked for (weather, location, time,
      // knowledge base) in the browser and sends the results back.
      const handleToolCalls = async (calls: Array<{ id?: string; name?: string; args?: Record<string, unknown> }>) => {
        modelTurnDoneRef.current = false;
        const firstName = String(calls.find(call => call?.name)?.name ?? '');
        setToolActivity(LIVE_TOOL_ACTIVITY[firstName] ?? 'Looking that up');

        const functionResponses = await Promise.all(calls.map(async call => {
          const name = String(call?.name ?? '');
          const result = await runLiveTool(name, call?.args, { onWeather: showWeather });
          return {
            ...(call?.id ? { id: call.id } : {}),
            name,
            response: typeof result.error === 'string' ? { error: result.error } : { output: result },
          };
        }));

        setToolActivity('');
        if (isStale() || socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return;
        const toSend = functionResponses.filter(
          response => !('id' in response) || !cancelledToolIdsRef.current.has(String((response as { id?: string }).id)),
        );
        if (!toSend.length) return;
        try {
          socket.send(JSON.stringify({ toolResponse: { functionResponses: toSend } }));
        } catch {
          // The socket closed while the lookup was running.
        }
      };

      socket.onopen = () => {
        if (isStale()) {
          try { socket.close(1000, 'Live Talk ended'); } catch { /* ignore */ }
          return;
        }
        opened = true;
        reportLiveSocketSuccess(apiVersion);

        // Optional recognition hints. If the server ever rejects them
        // (close code 1007 before setupComplete) the connection is retried
        // with the plain setup, and that choice is remembered.
        const transcriptionLocale = TRANSCRIPTION_LOCALES[language];
        hintSent = !basicSetupRef.current && Boolean(transcriptionLocale);
        const inputTranscription: Record<string, unknown> = hintSent
          ? { languageCodes: [transcriptionLocale] }
          : {};

        const toolsLevel = toolsLevelRef.current;
        const tools = toolsLevel > 0
          ? [
              ...(toolsLevel >= 2 ? [{ googleSearch: {} }] : []),
              { functionDeclarations: LIVE_TOOL_DECLARATIONS },
            ]
          : undefined;

        socket.send(JSON.stringify({
          setup: {
            model: `models/${model || LIVE_MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: voice },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: buildSystemInstruction(language, toolsLevel, voice) }],
            },
            ...(tools ? { tools } : {}),
            inputAudioTranscription: inputTranscription,
            outputAudioTranscription: {},
            sessionResumption: resumeHandleRef.current ? { handle: resumeHandleRef.current } : {},
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                // 40 ms of lead-in cut off the first sound of an utterance, so
                // "Who are you" arrived as "ho are you" / "How are you". Keep
                // ~250 ms before detected speech so the whole first word is sent.
                prefixPaddingMs: 250,
                silenceDurationMs: 500,
                // LOW: the assistant's own voice (speaker echo) and room noise
                // were being heard as the user speaking, which made the server
                // interrupt and cut its answer off half-way. Clear speech still
                // interrupts normally.
                startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
              },
            },
          },
        }));
      };

      socket.onmessage = async event => {
        try {
          if (isStale() || socketRef.current !== socket) return;
          const message = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : await decodeLiveMessage(event.data);

          if (message.setupComplete) {
            window.clearTimeout(setupTimer);
            setupDone = true;
            sessionWasReady = true;
            setupAt = Date.now();
            setupDoneRef.current = true;
            setConnected(true);
            setError('');
            setStatus('Listening');
            vadSpeechStartedRef.current = false;
            vadLastSpeechAtRef.current = performance.now();
            vadTurnEndedRef.current = false;

            // Fresh session only: the voice opens with its own greeting.
            if (!greetedRef.current && !resumeHandleRef.current) {
              greetedRef.current = true;
              try {
                const greeting = getVoiceGreeting(voice, userNameRef.current);
                socket.send(JSON.stringify({
                  clientContent: {
                    turns: [{
                      role: 'user',
                      parts: [{ text: `Greet me now by saying this aloud in your own voice, word for word, with nothing added: "${greeting}"` }],
                    }],
                    turnComplete: true,
                  },
                }));
              } catch { /* the greeting is optional */ }
            }

            // Send any speech captured while authentication/WebSocket setup
            // was in progress. This is what makes Live Talk feel immediate
            // without losing the first words.
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

            // The microphone is normally already active. Keep this as a safe
            // no-op fallback for reconnect/setup races.
            void startInput().catch(() => undefined);
            return;
          }

          if (message.error) {
            throw new Error(friendlyLiveError(message.error.message, 'The voice service returned an error. Please try again.'));
          }

          const resumption = message.sessionResumptionUpdate;
          if (resumption && resumption.resumable !== false && typeof resumption.newHandle === 'string' && resumption.newHandle) {
            resumeHandleRef.current = resumption.newHandle;
          }

          if (message.goAway) {
            // The server will close this connection soon (connection time
            // limit). The close handler reconnects with the resume handle.
            console.info('Live Talk: the server announced it will close the connection soon.');
          }

          if (Array.isArray(message.toolCallCancellation?.ids)) {
            for (const id of message.toolCallCancellation.ids) cancelledToolIdsRef.current.add(String(id));
            setToolActivity('');
          }

          if (Array.isArray(message.toolCall?.functionCalls) && message.toolCall.functionCalls.length) {
            void handleToolCalls(message.toolCall.functionCalls);
            return;
          }

          const serverContent = message.serverContent;
          if (!serverContent) return;

          if (serverContent.inputTranscription?.text) {
            const text = String(serverContent.inputTranscription.text);
            userTurnRef.current += text;
            // Show the whole turn so far, not just the latest chunk. User and
            // assistant transcript chunks can interleave, and rebuilding the
            // caption from the previous caption dropped earlier words.
            setCaption({ role: 'user', text: userTurnRef.current });
          }

          if (serverContent.outputTranscription?.text) {
            const text = String(serverContent.outputTranscription.text);
            assistantTurnRef.current += text;
            setCaption({ role: 'assistant', text: assistantTurnRef.current });
          }

          if (serverContent.interrupted) {
            setToolActivity('');
            stopAudioPlayback();
            modelTurnDoneRef.current = true;
            setStatus('Listening');
          }

          const parts = serverContent.modelTurn?.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              if (part?.inlineData?.data && String(part.inlineData.mimeType || '').startsWith('audio/pcm')) {
                modelTurnDoneRef.current = false;
                await playPcm24k(part.inlineData.data);
              }
            }
          }

          if (serverContent.turnComplete) {
            modelTurnDoneRef.current = true;
            vadSpeechStartedRef.current = false;
            vadLastSpeechAtRef.current = performance.now();
            vadTurnEndedRef.current = false;
            // Only show "listening" again if the microphone is really on.
            if (processorRef.current) setListening(true);
            if (audioSourcesRef.current.size === 0) setStatus('Listening');
            // If the user just told the assistant what to call it, remember the
            // name for future chats and Live Talk sessions. The running session
            // already heard the request and its rules (ASSISTANT_NAME_RULES)
            // make it accept the name straight away, so nothing needs to be
            // injected mid-session. (Mid-session clientContent is not supported
            // by newer Live models and could drop the connection.)
            const spokenUserTurn = userTurnRef.current.trim();
            if (spokenUserTurn) {
              learnAssistantName(spokenUserTurn);
              // Speech transcripts are noisy; if the pattern missed it but the
              // assistant accepted a name, learn it from the reply.
              learnAssistantNameFromReply(spokenUserTurn, assistantTurnRef.current);
            }
            // Persist the completed turn without blocking Live Talk.
            void persistCompletedTurn();
          }
        } catch (messageError) {
          console.error('Live Talk message error:', messageError);
          const message = friendlyLiveError(messageError, 'Live Talk returned an unexpected response. Please try again.');
          setError(message);
          setStatus('Connection error');
        }
      };

      socket.onerror = () => {
        // A close event always follows and decides whether to retry or report.
        if (isStale()) return;
        console.debug(
          `Live Talk socket error (Live API ${apiVersion}, ${opened ? 'after the socket opened' : 'before the socket opened'}).`,
        );
      };

      socket.onclose = event => {
        window.clearTimeout(setupTimer);
        // A socket that belongs to an older attempt (the user pressed "Try
        // again", Live Talk was closed and re-opened, or a retry started) must
        // not touch the current attempt's microphone, audio graph or state.
        if (socketRef.current === socket) socketRef.current = null;
        if (isStale()) return;

        setupDoneRef.current = false;
        setConnected(false);
        setToolActivity('');
        stopAudioPlayback();

        // Translate Gemini's technical close code/reason into plain language.
        const closeFailure = describeLiveClose(event.code, event.reason, opened);

        // A usage limit is an expected condition that the screen already explains,
        // so it is logged quietly; anything else is a real warning.
        (closeFailure.kind === 'quota' ? console.info : console.warn)(
          `Live Talk socket closed (code ${event.code}${event.reason ? `, ${event.reason}` : ''}) ` +
          `${setupDone ? 'after' : 'before'} setup.`,
        );

        if (!opened) {
          // Handshake rejected: drop the token that was just refused.
          reportLiveSocketFailure(apiVersion, token);
        }

        const failure = closeFailure;

        // A quota problem cannot be fixed by retrying, so stop right away
        // instead of burning more attempts and showing a raw Google error.
        if (failure.kind === 'quota') {
          // A quota rejection during setup can come from an optional tool
          // (for example Google Search grounding has its own, smaller quota).
          // Step down to fewer tools and retry before reporting a limit.
          if (!setupDone && opened && toolsLevelRef.current > 0) {
            toolsLevelRef.current -= 1;
            saveToolsLevel(toolsLevelRef.current);
            console.warn(`Live Talk: quota rejection during setup; retrying with tools level ${toolsLevelRef.current}.`);
            // Do not reuse the token that was just rejected.
            reportLiveSocketFailure(apiVersion, token);
            scheduleRetry(retryIndex);
            return;
          }
          cleanupAudioInput();
          setError(failure.message);
          setStatus('Usage limit reached');
          return;
        }

        if (setupDone) {
          // A working session dropped. Reconnect quietly (the microphone keeps
          // buffering meanwhile) and resume the conversation. A session that
          // stayed up for a while resets the budget.
          if (Date.now() - setupAt > STABLE_SESSION_MS) reconnectsRef.current = 0;
          if (reconnectsRef.current < MAX_SESSION_RECONNECTS) {
            reconnectsRef.current += 1;
            scheduleRetry(0);
            return;
          }
        } else {
          if (opened && (event.code === 1007 || event.code === 1008)) {
            // Setup rejected. Drop the newest optional feature and retry; this
            // does not use up the normal retry budget (the steps are finite).
            if (toolsLevelRef.current > 0) {
              toolsLevelRef.current -= 1;
              saveToolsLevel(toolsLevelRef.current);
              console.warn(`Live Talk: setup rejected; retrying with tools level ${toolsLevelRef.current}.`);
              scheduleRetry(retryIndex);
              return;
            }
            if (hintSent && !basicSetupRef.current) {
              basicSetupRef.current = true;
              saveBasicSetupFlag();
              scheduleRetry(retryIndex);
              return;
            }
          }
          if (retryIndex < MAX_SOCKET_RETRIES) {
            scheduleRetry(retryIndex + 1);
            return;
          }
        }

        cleanupAudioInput();
        setError(failure.message);
        setStatus('Disconnected');
      };
    };

    void openSocket(0);
  }, [cleanupAudioInput, closeSocket, persistCompletedTurn, playPcm24k, showWeather, startInput, stopAudioPlayback]);

  useEffect(() => {
    if (!open) return;
    setCaption({ role: 'user', text: '' });
    setElapsed(0);
    setError('');
    // Honest startup state: "Connecting" until the microphone is really
    // capturing. (Audio spoken while the socket finishes connecting is
    // buffered and delivered, so the user can talk as soon as it says
    // "Listening".)
    setListening(false);
    setConnected(false);
    setStatus('Connecting');
    endingRef.current = false;
    greetedRef.current = false;
    userTurnRef.current = '';
    assistantTurnRef.current = '';
    liveSessionIdRef.current = null;
    liveSessionPromiseRef.current = null;
    liveSavePromiseRef.current = null;
    liveTitleGeneratedRef.current = false;
    lastSavedSessionNameRef.current = null;
    livePublicIdRef.current = null;
    turnsRef.current = [];
    weatherLogRef.current = [];
    // Connect first: the token request and Gemini handshake are the critical
    // path to a ready conversation, so the session pre-create must not queue
    // ahead of them on the same backend.
    void startSession();
    void ensureSession().catch(error => console.warn('Live Talk session pre-create failed:', error));
    return () => cleanup();
  }, [open, startSession, cleanup, ensureSession]);

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
    // Weather lookups made during the call (kept after cleanup() clears the log).
    const weatherEntries = [...weatherLogRef.current];
    onSessionPreview?.({
      sessionId: existingSessionId,
      publicId: livePublicIdRef.current || undefined,
      sessionName: lastSavedSessionNameRef.current || undefined,
      turns: previewTurns,
      weather: weatherEntries,
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
          onSessionComplete?.(normalizedId, lastSavedSessionNameRef.current || undefined, livePublicIdRef.current || undefined, weatherEntries);
        }
      })
      .catch(error => {
        console.error('Failed to finalize Live Talk session:', error);

        // Even if the final save failed, if a session was already created we
        // can still hand it back to Chat.tsx so it can attempt to load the
        // available persisted history.
        const fallbackId = liveSessionIdRef.current ?? existingSessionId;
        if (fallbackId != null && Number.isFinite(fallbackId) && fallbackId > 0) {
          onSessionComplete?.(fallbackId, lastSavedSessionNameRef.current || undefined, livePublicIdRef.current || undefined, weatherEntries);
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
  // The timer only runs while the call is healthy: any error (usage limit,
  // disconnect, microphone failure…) stops it and keeps the last value.
  useEffect(() => {
    if (!open || error) return;
    const id = window.setInterval(() => setElapsed(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [open, error]);

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
        level = Math.min(1, Math.sqrt(sum / buffer.length) * 10);
      }
      smooth += (level - smooth) * 0.25;
      levelRef.current?.style.setProperty('--lvl', smooth.toFixed(3));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const retry = () => {
    setElapsed(0);
    cleanupAudioInput();
    closeSocket();
    void startSession();
  };

  const palette = getVoiceOrbPalette(voiceName);
  const thinking = status === 'Thinking';
  const hasError = Boolean(error);

  const toolBusy = Boolean(toolActivity);
  const reconnecting = status === 'Reconnecting';
  const connecting = status === 'Connecting';

  const label = hasError
    ? status
    : speaking
      ? 'Speaking'
      : toolBusy
        ? toolActivity
      : thinking
        ? 'Thinking'
        : reconnecting
          ? 'Reconnecting'
          : listening
            ? 'Listening'
            : connecting
              ? 'Connecting'
              : 'Microphone paused';

  const hint = hasError
    ? ''
    : speaking
      ? 'Start talking any time to interrupt.'
      : toolBusy
        ? 'One moment…'
      : thinking
        ? ''
        : reconnecting
          ? 'Hang on, reconnecting…'
          : listening
            ? connected ? 'Just start talking.' : 'Getting ready… you can start talking.'
            : connecting
              ? 'Starting the microphone…'
              : 'Tap the microphone to talk again.';

  const working = thinking || toolBusy;
  const orbState = speaking ? 'speaking' : working ? 'thinking' : listening ? 'listening' : 'idle';
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
                muted={!listening && !speaking && !working && !hasError && !connecting && !reconnecting}
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
                {working && !hasError && (
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

            {/* Live weather card (shown when the weather tool is used) */}
            <AnimatePresence>
              {weatherChip && !hasError && (() => {
                const c = weatherChip.current || {};
                const temp = Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) : null;
                if (temp === null) return null;
                const { label: conditions, icon } = describeWeatherCode(Number(c.weather_code), Number(c.is_day) !== 0);
                const feels = Number.isFinite(c.apparent_temperature) ? Math.round(c.apparent_temperature) : null;
                const humidity = Number.isFinite(c.relative_humidity_2m) ? Math.round(c.relative_humidity_2m) : null;
                const wind = Number.isFinite(c.wind_speed_10m) ? Math.round(c.wind_speed_10m) : null;
                return (
                  <motion.div
                    key={`${weatherChip.label}-${weatherChip.at}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 flex max-w-full items-center gap-3 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-2.5 text-left shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5"
                    aria-label={`Weather for ${weatherChip.label}`}
                  >
                    <span className="text-3xl leading-none" aria-hidden="true">{icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{weatherChip.label}</p>
                      <p className="text-base font-semibold leading-tight">
                        {temp}°C <span className="font-normal text-zinc-600 dark:text-zinc-300">{conditions}</span>
                      </p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {[feels !== null && `Feels ${feels}°`, humidity !== null && `${humidity}% humidity`, wind !== null && `${wind} km/h wind`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>

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
