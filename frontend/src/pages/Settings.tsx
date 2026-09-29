import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Globe2,
  HardDrive,
  Mic,
  Moon,
  RefreshCw,
  SlidersHorizontal,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { User, Session } from '../types';
import { chatApi, previewGeminiVoice } from '../lib/api';
import { getVoiceTheme } from '../lib/voiceThemes';

type SettingsSection =
  | 'general'
  | 'voice'
  | 'usage'
  | 'analytics'
  | 'storage';

type VoiceOption = {
  name: string;
  description: string;
};

const APP_LANGUAGES = [
  { code: 'auto', label: 'Auto-detect', native: 'Auto-detect', prompt: '' },
  { code: 'en', label: 'English', native: 'English', prompt: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', prompt: 'Hindi' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', prompt: 'Telugu' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', prompt: 'Tamil' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', prompt: 'Kannada' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', prompt: 'Malayalam' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', prompt: 'Bengali' },
  { code: 'mr', label: 'Marathi', native: 'मराठी', prompt: 'Marathi' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', prompt: 'Gujarati' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', prompt: 'Punjabi' },
  { code: 'ur', label: 'Urdu', native: 'اردو', prompt: 'Urdu' },
  { code: 'ar', label: 'Arabic', native: 'العربية', prompt: 'Arabic' },
  { code: 'es', label: 'Spanish', native: 'Español', prompt: 'Spanish' },
  { code: 'fr', label: 'French', native: 'Français', prompt: 'French' },
  { code: 'de', label: 'German', native: 'Deutsch', prompt: 'German' },
  { code: 'it', label: 'Italian', native: 'Italiano', prompt: 'Italian' },
  { code: 'pt', label: 'Portuguese', native: 'Português', prompt: 'Portuguese' },
  { code: 'ru', label: 'Russian', native: 'Русский', prompt: 'Russian' },
  { code: 'ja', label: 'Japanese', native: '日本語', prompt: 'Japanese' },
  { code: 'ko', label: 'Korean', native: '한국어', prompt: 'Korean' },
  { code: 'zh', label: 'Chinese', native: '中文', prompt: 'Chinese' },
  { code: 'tr', label: 'Turkish', native: 'Türkçe', prompt: 'Turkish' },
  { code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt', prompt: 'Vietnamese' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia', prompt: 'Indonesian' },
  { code: 'th', label: 'Thai', native: 'ไทย', prompt: 'Thai' },
  { code: 'fil', label: 'Filipino', native: 'Filipino', prompt: 'Filipino' },
] as const;

const APP_LANGUAGE_KEY = 'twinkle_app_language';

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

const SECTIONS: Array<{
  label: string;
  id: SettingsSection;
  icon: typeof SlidersHorizontal;
}> = [
  { label: 'General', id: 'general', icon: SlidersHorizontal },
  { label: 'Voice', id: 'voice', icon: Mic },
  { label: 'Usage', id: 'usage', icon: BarChart3 },
  { label: 'Analytics', id: 'analytics', icon: BarChart3 },
  { label: 'Storage', id: 'storage', icon: HardDrive },
];

type LiveMetrics = {
  sessions: Session[];
  messageCount: number;
  userMessages: number;
  assistantMessages: number;
  todayMessages: number;
  weekMessages: number;
  todaySessions: number;
  weekSessions: number;
  conversationBytes: number;
  messageBytes: number;
  lastUpdated: Date | null;
};

const EMPTY_METRICS: LiveMetrics = {
  sessions: [],
  messageCount: 0,
  userMessages: 0,
  assistantMessages: 0,
  todayMessages: 0,
  weekMessages: 0,
  todaySessions: 0,
  weekSessions: 0,
  conversationBytes: 0,
  messageBytes: 0,
  lastUpdated: null,
};

const normalizeSessions = (value: unknown): Session[] => {
  const raw =
    Array.isArray(value)
      ? value
      : Array.isArray((value as any)?.sessions)
        ? (value as any).sessions
        : [];

  return raw
    .map((item: any) => ({
      ...item,
      id: Number(item?.id ?? item?.sessionId ?? item?.session_id),
      sessionName: String(
        item?.sessionName ??
          item?.name ??
          item?.title ??
          'New Chat'
      ),
    }))
    .filter((item: any) => Number.isFinite(item.id));
};

const getSessionDate = (session: any): Date | null => {
  const raw =
    session?.createdAt ??
    session?.created_at ??
    session?.updatedAt ??
    session?.updated_at;

  if (!raw) return null;

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isWithinDays = (date: Date, days: number) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return date >= start;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const formatRelativeTime = (date: Date | null) => {
  if (!date) return 'Not available';

  const seconds = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 1000)
  );

  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
};

const readStoredBytes = () => {
  let bytes = 0;

  const measure = (storage: Storage) => {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key) continue;
      const value = storage.getItem(key) || '';
      bytes += new Blob([key, value]).size;
    }
  };

  try {
    measure(localStorage);
    measure(sessionStorage);
  } catch {
    // Some privacy modes can block storage access.
  }

  return bytes;
};

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-zinc-100 py-5 last:border-0 dark:border-zinc-800">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">
          {title}
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          {desc}
        </p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {detail}
        </p>
      )}
    </div>
  );
}

function VoicePickerModal({
  open,
  selectedVoice,
  previewingVoice,
  voiceError,
  onSelect,
  onClose,
}: {
  open: boolean;
  selectedVoice: string;
  previewingVoice: string | null;
  voiceError: string;
  onSelect: (voice: string) => void;
  onClose: () => void;
}) {
  const selectedIndex = Math.max(0, VOICES.findIndex(voice => voice.name === selectedVoice));
  const selected = VOICES[selectedIndex] ?? VOICES[2];
  const selectedTheme = getVoiceTheme(selected.name);

  const selectRelative = (offset: number) => {
    const next = VOICES[(selectedIndex + offset + VOICES.length) % VOICES.length];
    onSelect(next.name);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100001] flex items-center justify-center bg-black/35 p-4 backdrop-blur-xl"
          onMouseDown={event => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.985 }}
            className="w-full max-w-[720px] overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_30px_90px_rgba(0,0,0,.18)] dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5 dark:border-zinc-800">
              <div>
                <h2 className="text-[17px] font-semibold tracking-tight text-zinc-950 dark:text-white">Voice</h2>
                <p className="mt-1 text-xs text-zinc-400">Choose the Gemini voice used by Live Talk.</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-white"
                aria-label="Close voice selector"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-7 pb-7 pt-8">
              <div className="flex items-center justify-center gap-5 sm:gap-10">
                <button
                  type="button"
                  onClick={() => selectRelative(-1)}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                  aria-label="Previous voice"
                >
                  <ChevronRight className="h-6 w-6 rotate-180" />
                </button>

                <div className="flex min-w-0 flex-col items-center text-center">
                  <motion.div
                    animate={{ scale: previewingVoice === selected.name ? [1, 1.035, 1] : 1 }}
                    transition={{ duration: 1.1, repeat: previewingVoice === selected.name ? Infinity : 0, ease: 'easeInOut' }}
                    className="relative h-32 w-32 overflow-hidden rounded-full sm:h-36 sm:w-36"
                    style={{
                      background: `radial-gradient(circle at 35% 25%, ${selectedTheme.soft} 0%, ${selectedTheme.mid} 48%, ${selectedTheme.strong} 100%)`,
                      boxShadow: `0 18px 45px ${selectedTheme.strong}35`,
                    }}
                    aria-label={`${selected.name} voice`}
                  />
                  <h3 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">{selected.name}</h3>
                  <p className="mt-1 text-base text-zinc-500 dark:text-zinc-400">{selected.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => selectRelative(1)}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                  aria-label="Next voice"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-6 flex justify-center gap-2">
                {VOICES.slice(0, 9).map(voice => (
                  <button
                    key={voice.name}
                    type="button"
                    onClick={() => onSelect(voice.name)}
                    disabled={Boolean(previewingVoice)}
                    className={`h-2.5 w-2.5 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${voice.name === selected.name ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                    aria-label={`Select ${voice.name}`}
                  />
                ))}
              </div>

              {voiceError && (
                <div
                  role="alert"
                  className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
                >
                  {voiceError}
                </div>
              )}

              <div className="mt-8 max-h-[280px] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
                {VOICES.map(voice => (
                  <button
                    key={voice.name}
                    type="button"
                    onClick={() => onSelect(voice.name)}
                    disabled={Boolean(previewingVoice)}
                    className={`flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left last:border-0 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 ${voice.name === selected.name ? 'bg-zinc-50 dark:bg-zinc-900' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900/60'}`}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                      {voice.name === selected.name ? <Check className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-zinc-900 dark:text-white">{voice.name}</span>
                      <span className="block text-xs text-zinc-400">{voice.description}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-zinc-300" />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Settings({
  user,
}: {
  user: User;
}) {
  const navigate = useNavigate();

  const [active, setActive] =
    useState<SettingsSection>('general');

  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  const [appLanguage, setAppLanguage] = useState(() => {
    try {
      const saved = localStorage.getItem(APP_LANGUAGE_KEY);

      // English is Twinkle AI's default UI language.
      // Only an explicit saved language choice overrides it.
      if (!saved || saved === 'auto') return 'en';

      return APP_LANGUAGES.some(item => item.code === saved)
        ? saved
        : 'en';
    } catch {
      return 'auto';
    }
  });

  const selectedLanguage = APP_LANGUAGES.find(item => item.code === appLanguage) ?? APP_LANGUAGES[0];

  const changeAppLanguage = (code: string) => {
    const next = APP_LANGUAGES.find(item => item.code === code) ?? APP_LANGUAGES[0];
    setAppLanguage(next.code);
    try {
      localStorage.setItem(APP_LANGUAGE_KEY, next.code);
      document.documentElement.lang = next.code === 'auto' ? (navigator.language || 'en').split('-')[0] : next.code;
    } catch { /* best effort */ }
    window.dispatchEvent(new CustomEvent('twinkle-language-change', { detail: next.code }));
  };


  const [voicePickerOpen, setVoicePickerOpen] =
    useState(false);

  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState('');

  const [selectedVoice, setSelectedVoice] =
    useState(() => {
      try {
        const saved = localStorage.getItem('twinkle_live_voice');
        const migrated = localStorage.getItem('twinkle_live_voice_default_v2');
        if (!migrated) {
          if (!saved || saved === 'Kore') localStorage.setItem('twinkle_live_voice', 'Charon');
          localStorage.setItem('twinkle_live_voice_default_v2', '1');
          return saved === 'Kore' || !saved ? 'Charon' : saved;
        }
        return VOICES.some((voice) => voice.name === saved) ? saved || 'Charon' : 'Charon';
      } catch {
        return 'Charon';
      }
    });

  const [metrics, setMetrics] =
    useState<LiveMetrics>(EMPTY_METRICS);

  const [loadingMetrics, setLoadingMetrics] =
    useState(false);

  const [metricsError, setMetricsError] =
    useState('');

  useEffect(() => {
    try {
      document.documentElement.lang = selectedLanguage.code === 'auto'
        ? (navigator.language || 'en').split('-')[0]
        : selectedLanguage.code;
    } catch { /* ignore */ }
  }, [selectedLanguage.code]);

  const toggleDark = () => {
    const next = !dark;

    document.documentElement.classList.toggle(
      'dark',
      next
    );

    localStorage.setItem(
      'theme',
      next ? 'dark' : 'light'
    );

    setDark(next);
  };

  const previewVoice = async (voice: string) => {
    if (previewingVoice) return;
    setVoiceError('');
    setPreviewingVoice(voice);
    try {
      const greetingName = user.username?.trim() || user.name?.trim() || 'there';
      await previewGeminiVoice(
        voice,
        `Hello ${greetingName}. I'm Twinkle AI. How can I help you today?`,
        appLanguage
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Gemini voice preview failed.';
      console.error('Gemini voice preview failed:', error);
      setVoiceError(message);
    } finally {
      setPreviewingVoice(null);
    }
  };

  const saveVoice = (voice: string) => {
    setSelectedVoice(voice);
    try {
      localStorage.setItem('twinkle_live_voice', voice);
    } catch {
      // Ignore storage failures.
    }
    window.dispatchEvent(new CustomEvent('twinkle-voice-change', { detail: voice }));
    void previewVoice(voice);
  };

  const refreshMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    setMetricsError('');

    try {
      const sessionsResponse =
        (await chatApi.getSessions()) as any;

      const sessions =
        normalizeSessions(sessionsResponse);

      let messageCount = 0;
      let userMessages = 0;
      let assistantMessages = 0;
      let todayMessages = 0;
      let weekMessages = 0;
      let messageBytes = 0;

      const now = new Date();

      // Existing backend API: GET /api/chat/history/{sessionId}.
      // Read histories in small batches so a large account does not create
      // hundreds of simultaneous requests.
      const batchSize = 5;

      for (
        let start = 0;
        start < sessions.length;
        start += batchSize
      ) {
        const batch =
          sessions.slice(
            start,
            start + batchSize
          );

        const histories =
          await Promise.all(
            batch.map(async (session) => {
              try {
                const response =
                  (await chatApi.getMessages(
                    session.id
                  )) as any;

                return Array.isArray(
                  response?.messages
                )
                  ? response.messages
                  : [];
              } catch {
                return [];
              }
            })
          );

        histories.flat().forEach((message: any) => {
          messageCount += 1;

          if (message?.role === 'user') {
            userMessages += 1;
          } else {
            assistantMessages += 1;
          }

          const timestamp = message?.timestamp
            ? new Date(message.timestamp)
            : null;

          if (
            timestamp &&
            !Number.isNaN(timestamp.getTime())
          ) {
            if (isSameDay(timestamp, now)) {
              todayMessages += 1;
            }

            if (isWithinDays(timestamp, 7)) {
              weekMessages += 1;
            }
          }

          messageBytes += new Blob([
            JSON.stringify(message ?? {}),
          ]).size;
        });
      }

      const todaySessions =
        sessions.filter((session) => {
          const date = getSessionDate(session);
          return (
            date !== null &&
            isSameDay(date, now)
          );
        }).length;

      const weekSessions =
        sessions.filter((session) => {
          const date = getSessionDate(session);
          return (
            date !== null &&
            isWithinDays(date, 7)
          );
        }).length;

      const conversationBytes =
        sessions.reduce(
          (total, session) =>
            total +
            new Blob([
              JSON.stringify(session ?? {}),
            ]).size,
          0
        );

      setMetrics({
        sessions,
        messageCount,
        userMessages,
        assistantMessages,
        todayMessages,
        weekMessages,
        todaySessions,
        weekSessions,
        conversationBytes,
        messageBytes,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error(
        'Settings metrics refresh failed:',
        error
      );

      setMetricsError(
        'Live account data could not be loaded. Try refreshing.'
      );
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  useEffect(() => {
    void refreshMetrics();

    const interval =
      window.setInterval(
        () => void refreshMetrics(),
        30_000
      );

    const handleVisibility = () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void refreshMetrics();
      }
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    );

    return () => {
      window.clearInterval(interval);
      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      );
    };
  }, [refreshMetrics]);

  const browserBytes = useMemo(
    () => readStoredBytes(),
    [metrics.lastUpdated]
  );

  const totalStorageBytes =
    metrics.conversationBytes +
    metrics.messageBytes +
    browserBytes;

  const averageMessages =
    metrics.sessions.length > 0
      ? metrics.messageCount /
        metrics.sessions.length
      : 0;

  const activeVoice =
    VOICES.find(
      (voice) =>
        voice.name === selectedVoice
    ) ?? VOICES[0];

  const recentSessions =
    [...metrics.sessions]
      .filter((session) => getSessionDate(session))
      .sort((a, b) => {
        const da =
          getSessionDate(a)?.getTime() ?? 0;
        const db =
          getSessionDate(b)?.getTime() ?? 0;
        return db - da;
      })
      .slice(0, 5);

  return (
    <div className="min-h-[100dvh] w-full bg-white dark:bg-zinc-950">
      <div className="flex min-h-[100dvh] w-full">
        {/* Settings navigation */}

        <aside className="hidden w-[292px] shrink-0 border-r border-zinc-200 px-4 py-6 dark:border-zinc-800 md:block">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-7 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Settings
          </button>

          <div className="space-y-1">
            {SECTIONS.map(
              ({
                label,
                id,
                icon: Icon,
              }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setActive(id)
                  }
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    active === id
                      ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-900 dark:text-white'
                      : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/60'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              )
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-5 py-6 sm:px-10 sm:py-10">
          <div className="mx-auto w-full max-w-[900px]">
            {/* Mobile back */}

            <button
              type="button"
              onClick={() => navigate('/')}
              className="mb-6 flex items-center gap-2 text-sm text-zinc-500 md:hidden"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>

            <div className="mb-8">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                {
                  SECTIONS.find(
                    (item) =>
                      item.id === active
                  )?.label
                }
              </h1>

              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                Manage your Twinkle account and application preferences.
              </p>
            </div>

            {/* GENERAL */}

            {active === 'general' && (
              <div className="rounded-3xl border border-zinc-200 px-6 dark:border-zinc-800">
                <Row
                  title="Account"
                  desc={user.email}
                >
                  <button
                    type="button"
                    onClick={() =>
                      navigate('/profile')
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <UserRound className="h-4 w-4" />
                    Profile
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </Row>

                <Row
                  title="Appearance"
                  desc="Choose the interface theme."
                >
                  <button
                    type="button"
                    onClick={toggleDark}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold dark:border-zinc-800"
                  >
                    {dark ? (
                      <Moon className="h-4 w-4" />
                    ) : (
                      <SlidersHorizontal className="h-4 w-4" />
                    )}
                    {dark ? 'Dark' : 'Light'}
                  </button>
                </Row>

                <Row
                  title="Language"
                  desc="Choose the interface language and preferred language for Live Talk responses."
                >
                  <label className="relative flex min-w-[190px] items-center">
                    <Globe2 className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-400" />
                    <select
                      value={appLanguage}
                      onChange={event => changeAppLanguage(event.target.value)}
                      className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-10 text-sm font-semibold text-zinc-800 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                      aria-label="Interface language"
                    >
                      {APP_LANGUAGES.map(language => (
                        <option key={language.code} value={language.code}>
                          {language.label}{language.code !== 'auto' ? ` · ${language.native}` : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-400"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </label>
                </Row>
                <Row
                  title="Voice"
                  desc={`Live Talk uses ${activeVoice.name} · ${activeVoice.description}.`}
                >
                  <button
                    type="button"
                    onClick={() => setVoicePickerOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    aria-label="Change Live Talk voice"
                  >
                    {activeVoice.name}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </Row>
              </div>
            )}

            {/* VOICE */}
            {active === 'voice' && (
              <div className="w-full">
                <div className="flex min-h-[calc(100dvh-190px)] flex-col items-center justify-center">
                  <div className="flex items-center justify-center gap-4 sm:gap-10">
                    <button
                      type="button"
                      onClick={() => {
                        const index = VOICES.findIndex(voice => voice.name === activeVoice.name);
                        const next = VOICES[(index - 1 + VOICES.length) % VOICES.length];
                        saveVoice(next.name);
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                      aria-label="Previous voice"
                    >
                      <ChevronRight className="h-6 w-6 rotate-180" />
                    </button>

                    <div className="flex flex-col items-center text-center">
                      <motion.div
                        animate={{ scale: previewingVoice === activeVoice.name ? [1, 1.035, 1] : 1 }}
                        transition={{ duration: 1.1, repeat: previewingVoice === activeVoice.name ? Infinity : 0, ease: 'easeInOut' }}
                        className="relative h-36 w-36 overflow-hidden rounded-full sm:h-40 sm:w-40"
                        style={{
                          background: `radial-gradient(circle at 35% 25%, ${getVoiceTheme(activeVoice.name).soft} 0%, ${getVoiceTheme(activeVoice.name).mid} 48%, ${getVoiceTheme(activeVoice.name).strong} 100%)`,
                          boxShadow: `0 20px 55px ${getVoiceTheme(activeVoice.name).strong}30`,
                        }}
                        aria-label={`${activeVoice.name} voice`}
                      />

                      <h2 className="mt-7 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">{activeVoice.name}</h2>
                      <p className="mt-1 text-base text-zinc-500 dark:text-zinc-400">{activeVoice.description}</p>

                      <div className="mt-5 flex items-center gap-2">
                        {VOICES.slice(0, 9).map(voice => (
                          <button
                            key={voice.name}
                            type="button"
                            onClick={() => saveVoice(voice.name)}
                            className={`h-2.5 w-2.5 rounded-full transition ${voice.name === activeVoice.name ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                            aria-label={`Select ${voice.name}`}
                          />
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const index = VOICES.findIndex(voice => voice.name === activeVoice.name);
                        const next = VOICES[(index + 1) % VOICES.length];
                        saveVoice(next.name);
                      }}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                      aria-label="Next voice"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="mt-10 w-full max-w-[860px] overflow-hidden rounded-3xl border border-zinc-200 bg-white px-3 py-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-5 sm:py-3">
                    <Row title="Model" desc="Live Talk uses Gemini's native audio model.">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Gemini 3.8 Live</span>
                    </Row>
                    <Row title="Language" desc="Live Talk follows your selected language when one is chosen; Auto-detect follows your speech.">
                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {selectedLanguage.label}
                      </span>
                    </Row>
                    <Row title="Voice" desc={`${activeVoice.name} · ${activeVoice.description}`}>
                      <button
                        type="button"
                        onClick={() => setVoicePickerOpen(true)}
                        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                      >
                        Change voice <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </Row>
                  </div>

                  <div className="mt-7 flex max-w-[760px] flex-col items-center text-center">
                    <p className="text-xs leading-5 text-zinc-400 dark:text-zinc-500">
                      30 Gemini native voices are available. Selecting a voice plays a short personalized greeting automatically.
                    </p>
                  </div>

                  {voiceError && (
                    <div className="mt-4 w-full max-w-[760px] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs leading-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
                      {voiceError}
                    </div>
                  )}


                </div>
              </div>
            )}

            {/* USAGE */}

            {active === 'usage' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    {metrics.lastUpdated
                      ? `Updated ${formatRelativeTime(
                          metrics.lastUpdated
                        )}`
                      : 'Loading live data…'}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void refreshMetrics()
                    }
                    disabled={
                      loadingMetrics
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${
                        loadingMetrics
                          ? 'animate-spin'
                          : ''
                      }`}
                    />
                    Refresh
                  </button>
                </div>

                {metricsError && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                    {metricsError}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <StatCard
                    label="Total chats"
                    value={String(
                      metrics.sessions.length
                    )}
                    detail={`${metrics.todaySessions} today · ${metrics.weekSessions} in 7 days`}
                  />

                  <StatCard
                    label="Total messages"
                    value={String(
                      metrics.messageCount
                    )}
                    detail={`${metrics.userMessages} user · ${metrics.assistantMessages} assistant`}
                  />

                  <StatCard
                    label="Messages today"
                    value={String(
                      metrics.todayMessages
                    )}
                    detail={`${metrics.weekMessages} in the last 7 days`}
                  />

                  <StatCard
                    label="Average per chat"
                    value={
                      metrics.sessions.length
                        ? averageMessages.toFixed(
                            1
                          )
                        : '0'
                    }
                    detail="Based on loaded conversation history"
                  />
                </div>

              </div>
            )}

            {/* ANALYTICS */}

            {active === 'analytics' && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-zinc-900 dark:text-white">
                        Conversation activity
                      </h3>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Calculated from your live session and message history.
                      </p>
                    </div>

                    <BarChart3 className="h-5 w-5 text-zinc-400" />
                  </div>

                  <div className="mt-6 space-y-4">
                    {Array.from(
                      { length: 7 },
                      (_, index) => {
                        const day = new Date();
                        day.setHours(
                          0,
                          0,
                          0,
                          0
                        );
                        day.setDate(
                          day.getDate() -
                            (6 - index)
                        );

                        const count =
                          metrics.sessions.filter(
                            (session) => {
                              const date =
                                getSessionDate(
                                  session
                                );

                              return (
                                date !== null &&
                                isSameDay(
                                  date,
                                  day
                                )
                              );
                            }
                          ).length;

                        const maxCount =
                          Math.max(
                            1,
                            ...Array.from(
                              { length: 7 },
                              (_, offset) => {
                                const compare =
                                  new Date();
                                compare.setHours(
                                  0,
                                  0,
                                  0,
                                  0
                                );
                                compare.setDate(
                                  compare.getDate() -
                                    (6 - offset)
                                );

                                return metrics.sessions.filter(
                                  (
                                    session
                                  ) => {
                                    const date =
                                      getSessionDate(
                                        session
                                      );

                                    return (
                                      date !==
                                        null &&
                                      isSameDay(
                                        date,
                                        compare
                                      )
                                    );
                                  }
                                ).length;
                              }
                            )
                          );

                        return (
                          <div
                            key={day.toISOString()}
                            className="flex items-center gap-3"
                          >
                            <span className="w-12 text-[10px] font-semibold text-zinc-400">
                              {day.toLocaleDateString(
                                'en-US',
                                {
                                  weekday:
                                    'short',
                                }
                              )}
                            </span>

                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                              <div
                                className="h-full rounded-full bg-pink-400 transition-all"
                                style={{
                                  width: `${Math.max(
                                    4,
                                    (count /
                                      maxCount) *
                                      100
                                  )}%`,
                                }}
                              />
                            </div>

                            <span className="w-8 text-right text-xs font-semibold text-zinc-500">
                              {count}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="User messages"
                    value={String(
                      metrics.userMessages
                    )}
                  />
                  <StatCard
                    label="AI messages"
                    value={String(
                      metrics.assistantMessages
                    )}
                  />
                  <StatCard
                    label="7-day chats"
                    value={String(
                      metrics.weekSessions
                    )}
                  />
                </div>

                <div className="rounded-3xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <h3 className="font-semibold text-zinc-900 dark:text-white">
                    Recent activity
                  </h3>

                  <div className="mt-4 space-y-2">
                    {recentSessions.length === 0 ? (
                      <p className="text-sm text-zinc-500">
                        No dated sessions are available yet.
                      </p>
                    ) : (
                      recentSessions.map(
                        (session) => (
                          <div
                            key={session.id}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                              <Database className="h-4 w-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                {session.sessionName}
                              </p>
                              <p className="text-[10px] text-zinc-400">
                                {getSessionDate(
                                  session
                                )?.toLocaleString(
                                  'en-US'
                                )}
                              </p>
                            </div>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STORAGE */}

            {active === 'storage' && (
              <div className="space-y-4">
                <div className="rounded-3xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                        Estimated conversation storage
                      </p>

                      <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                        {formatBytes(
                          totalStorageBytes
                        )}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Live estimate from your loaded account data and browser preferences.
                      </p>
                    </div>

                    <HardDrive className="h-6 w-6 text-zinc-400" />
                  </div>

                  <div className="mt-6 h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                    <div
                      className="h-full rounded-full bg-pink-400 transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(
                            2,
                            totalStorageBytes
                              ? (metrics.messageBytes /
                                  totalStorageBytes) *
                                  100
                              : 2
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Sessions"
                    value={formatBytes(
                      metrics.conversationBytes
                    )}
                    detail={`${metrics.sessions.length} chats`}
                  />

                  <StatCard
                    label="Messages"
                    value={formatBytes(
                      metrics.messageBytes
                    )}
                    detail={`${metrics.messageCount} messages`}
                  />

                  <StatCard
                    label="Browser data"
                    value={formatBytes(
                      browserBytes
                    )}
                    detail="local + session storage"
                  />
                </div>

                <div className="rounded-3xl border border-zinc-200 px-6 dark:border-zinc-800">
                  <Row
                    title="Storage refresh"
                    desc="Metrics automatically refresh every 30 seconds while this page is open."
                  >
                    <button
                      type="button"
                      onClick={() =>
                        void refreshMetrics()
                      }
                      className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </button>
                  </Row>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <VoicePickerModal
        open={voicePickerOpen}
        selectedVoice={selectedVoice}
        previewingVoice={previewingVoice}
        voiceError={voiceError}
        onSelect={saveVoice}
        onClose={() => setVoicePickerOpen(false)}
      />


    </div>
  );
}
