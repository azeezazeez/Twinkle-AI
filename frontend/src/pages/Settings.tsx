import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Database,
  Download,
  FileJson,
  FileText,
  Globe2,
  HardDrive,
  Info,
  Keyboard,
  LogOut,
  Mic,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { User, Session } from '../types';
import { authApi, chatApi, previewGeminiVoice } from '../lib/api';
import { getVoiceTheme } from '../lib/voiceThemes';
import { getSavedLiveTalkColor } from '../lib/liveTalkColors';
import {
  loadPrefs,
  savePrefs,
  type DisplayPrefs,
  type FontSizePref,
} from '../lib/preferences';
import ConfirmationModal from '../components/ConfirmationModal';

type SettingsSection =
  | 'general'
  | 'appearance'
  | 'voice'
  | 'usage'
  | 'analytics'
  | 'storage'
  | 'data'
  | 'shortcuts'
  | 'about';

type ThemeChoice = 'light' | 'dark' | 'system';

type VoiceOption = {
  name: string;
  description: string;
};

const APP_VERSION = '1.0';

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

const APP_STORAGE_KEYS = [
  'scout_current_session_id',
  'Twinkle_pinned_sessions',
  'Twinkle_sidebar_seen',
  'Twinkle_sidebar_width',
];

const SECTION_GROUPS: Array<{
  heading: string;
  items: Array<{ label: string; id: SettingsSection; icon: typeof SlidersHorizontal; blurb: string }>;
}> = [
  {
    heading: 'Preferences',
    items: [
      { label: 'General', id: 'general', icon: SlidersHorizontal, blurb: 'Account, language and Live Talk basics.' },
      { label: 'Appearance', id: 'appearance', icon: Palette, blurb: 'Theme, text size and motion.' },
      { label: 'Voice', id: 'voice', icon: Mic, blurb: 'Pick the Gemini voice used by Live Talk.' },
      { label: 'Shortcuts', id: 'shortcuts', icon: Keyboard, blurb: 'Keyboard shortcuts to move faster.' },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { label: 'Usage', id: 'usage', icon: BarChart3, blurb: 'Live totals from your conversations.' },
      { label: 'Analytics', id: 'analytics', icon: BarChart3, blurb: 'Activity trends for the last 7 days.' },
      { label: 'Storage', id: 'storage', icon: HardDrive, blurb: 'Estimated space used by your data.' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: 'Data controls', id: 'data', icon: ShieldCheck, blurb: 'Export, delete and reset your data.' },
      { label: 'About', id: 'about', icon: Info, blurb: 'Version and account details.' },
    ],
  },
];

const ALL_SECTIONS = SECTION_GROUPS.flatMap(group => group.items);
const isSection = (value: string | null): value is SettingsSection =>
  ALL_SECTIONS.some(item => item.id === value);

type SessionActivity = {
  id: number;
  name: string;
  publicId?: string;
  count: number;
  last: Date | null;
};

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
  dailyMessages: number[]; // last 7 days, oldest first
  activity: SessionActivity[];
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
  dailyMessages: [0, 0, 0, 0, 0, 0, 0],
  activity: [],
  lastUpdated: null,
};

type ConversationBundle = { session: Session; messages: any[] };

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

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const getStoredThemeChoice = (): ThemeChoice => {
  try {
    const stored = localStorage.getItem('theme');
    return stored === 'dark' || stored === 'light' ? stored : 'system';
  } catch {
    return 'system';
  }
};

const applyThemeChoice = (choice: ThemeChoice) => {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = choice === 'system' ? systemDark : choice === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  try {
    if (choice === 'system') localStorage.removeItem('theme');
    else localStorage.setItem('theme', choice);
  } catch { /* storage may be blocked */ }
};

const downloadBlob = (content: string, filename: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const isMac = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:cursor-not-allowed disabled:opacity-50';

function Btn({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  label?: string;
}) {
  const styles = {
    default:
      'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900',
    primary:
      'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200',
    danger:
      'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 dark:hover:bg-red-950/40',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`${buttonBase} ${styles}`}
    >
      {children}
    </button>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-zinc-200 bg-white px-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 ${className}`}>
      {children}
    </div>
  );
}

function Row({
  title,
  desc,
  children,
  stack = false,
}: {
  title: string;
  desc: ReactNode;
  children?: ReactNode;
  stack?: boolean;
}) {
  return (
    <div
      className={`gap-4 border-b border-zinc-100 py-5 last:border-0 dark:border-zinc-800 ${
        stack ? 'flex flex-col' : 'flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-6'
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{desc}</p>
      </div>
      {children !== undefined && <div className="shrink-0">{children}</div>}
    </div>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
        checked ? 'bg-violet-500' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: typeof Sun }>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900"
    >
      {options.map(option => {
        const Icon = option.icon;
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
              selected
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  loading,
}: {
  label: string;
  value: string;
  detail?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      {loading ? (
        <div className="mt-3 h-7 w-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{value}</p>
      )}
      {detail && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[26px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-700 shadow-[0_1px_0_rgba(0,0,0,0.06)] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
      {children}
    </kbd>
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

// Loads every session and its messages (in small batches so a large account
// does not fire hundreds of simultaneous requests).
async function fetchAllConversations(
  onProgress?: (done: number, total: number) => void
): Promise<ConversationBundle[]> {
  const sessions = normalizeSessions((await chatApi.getSessions()) as any);
  const bundles: ConversationBundle[] = [];
  const batchSize = 5;

  for (let start = 0; start < sessions.length; start += batchSize) {
    const batch = sessions.slice(start, start + batchSize);
    const loaded = await Promise.all(
      batch.map(async session => {
        try {
          const response = (await chatApi.getMessages(session.id)) as any;
          return { session, messages: Array.isArray(response?.messages) ? response.messages : [] };
        } catch {
          return { session, messages: [] as any[] };
        }
      })
    );
    bundles.push(...loaded);
    onProgress?.(Math.min(start + batchSize, sessions.length), sessions.length);
  }

  return bundles;
}

export default function Settings({
  user,
  onLogout,
}: {
  user: User;
  onLogout?: () => void | Promise<void>;
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const active: SettingsSection = isSection(tabParam) ? tabParam : 'general';
  const setActive = (id: SettingsSection) => setSearchParams({ tab: id }, { replace: true });
  const activeMeta = ALL_SECTIONS.find(item => item.id === active) ?? ALL_SECTIONS[0];

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; tone: 'ok' | 'error' } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    setToast({ message, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  // ── Theme + display preferences ──────────────────────────────────────────
  const [theme, setTheme] = useState<ThemeChoice>(getStoredThemeChoice);
  const [prefs, setPrefs] = useState<DisplayPrefs>(loadPrefs);

  const changeTheme = (choice: ThemeChoice) => {
    setTheme(choice);
    applyThemeChoice(choice);
  };

  useEffect(() => {
    if (theme !== 'system') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => document.documentElement.classList.toggle('dark', query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [theme]);

  const updatePrefs = (patch: Partial<DisplayPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  };

  const resetAppearance = () => {
    changeTheme('system');
    const next: DisplayPrefs = { fontSize: 'default', reduceMotion: false };
    setPrefs(next);
    savePrefs(next);
    showToast('Appearance reset to defaults');
  };

  // ── Language ─────────────────────────────────────────────────────────────
  const [appLanguage, setAppLanguage] = useState(() => {
    try {
      const saved = localStorage.getItem(APP_LANGUAGE_KEY);
      // English is Twinkle AI's default UI language. Only an explicit saved
      // language choice overrides it.
      if (!saved || saved === 'auto') return 'en';
      return APP_LANGUAGES.some(item => item.code === saved) ? saved : 'en';
    } catch {
      return 'en';
    }
  });
  const selectedLanguage =
    APP_LANGUAGES.find(item => item.code === appLanguage) ?? APP_LANGUAGES[0];

  const changeAppLanguage = (code: string) => {
    const next = APP_LANGUAGES.find(item => item.code === code) ?? APP_LANGUAGES[0];
    setAppLanguage(next.code);
    try {
      localStorage.setItem(APP_LANGUAGE_KEY, next.code);
    } catch { /* best effort */ }
    window.dispatchEvent(new CustomEvent('twinkle-language-change', { detail: next.code }));
    showToast(`Language set to ${next.label}`);
  };

  useEffect(() => {
    try {
      document.documentElement.lang =
        selectedLanguage.code === 'auto'
          ? (navigator.language || 'en').split('-')[0]
          : selectedLanguage.code;
    } catch { /* ignore */ }
  }, [selectedLanguage.code]);

  const liveTalkColor = getSavedLiveTalkColor();

  // ── Voice ────────────────────────────────────────────────────────────────
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(() => {
    try {
      const saved = localStorage.getItem('twinkle_live_voice');
      const migrated = localStorage.getItem('twinkle_live_voice_default_v2');
      if (!migrated) {
        if (!saved || saved === 'Kore') localStorage.setItem('twinkle_live_voice', 'Charon');
        localStorage.setItem('twinkle_live_voice_default_v2', '1');
        return saved === 'Kore' || !saved ? 'Charon' : saved;
      }
      return VOICES.some(voice => voice.name === saved) ? saved || 'Charon' : 'Charon';
    } catch {
      return 'Charon';
    }
  });

  const activeVoice = VOICES.find(voice => voice.name === selectedVoice) ?? VOICES[0];

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
    } catch { /* ignore storage failures */ }
    window.dispatchEvent(new CustomEvent('twinkle-voice-change', { detail: voice }));
    void previewVoice(voice);
  };

  const stepVoice = (offset: number) => {
    const index = VOICES.findIndex(voice => voice.name === activeVoice.name);
    saveVoice(VOICES[(index + offset + VOICES.length) % VOICES.length].name);
  };

  // ── Live metrics (loaded only for the sections that need them) ───────────
  const [metrics, setMetrics] = useState<LiveMetrics>(EMPTY_METRICS);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState('');
  const needsMetrics = active === 'usage' || active === 'analytics' || active === 'storage';

  const refreshMetrics = useCallback(async () => {
    setLoadingMetrics(true);
    setMetricsError('');

    try {
      const bundles = await fetchAllConversations();
      const sessions = bundles.map(bundle => bundle.session);
      const now = new Date();
      const windowStart = startOfDay(now);
      windowStart.setDate(windowStart.getDate() - 6);

      let messageCount = 0;
      let userMessages = 0;
      let assistantMessages = 0;
      let todayMessages = 0;
      let weekMessages = 0;
      let messageBytes = 0;
      const dailyMessages = [0, 0, 0, 0, 0, 0, 0];
      const activity: SessionActivity[] = [];

      bundles.forEach(({ session, messages }) => {
        let last: Date | null = null;

        messages.forEach((message: any) => {
          messageCount += 1;
          if (message?.role === 'user') userMessages += 1;
          else assistantMessages += 1;

          const timestamp = message?.timestamp ? new Date(message.timestamp) : null;
          if (timestamp && !Number.isNaN(timestamp.getTime())) {
            if (!last || timestamp > last) last = timestamp;
            if (isSameDay(timestamp, now)) todayMessages += 1;
            if (isWithinDays(timestamp, 7)) {
              weekMessages += 1;
              const index = Math.round(
                (startOfDay(timestamp).getTime() - windowStart.getTime()) / 86_400_000
              );
              if (index >= 0 && index < 7) dailyMessages[index] += 1;
            }
          }

          messageBytes += new Blob([JSON.stringify(message ?? {})]).size;
        });

        activity.push({
          id: session.id,
          name: session.sessionName,
          publicId: session.publicId,
          count: messages.length,
          last,
        });
      });

      setMetrics({
        sessions,
        messageCount,
        userMessages,
        assistantMessages,
        todayMessages,
        weekMessages,
        todaySessions: sessions.filter(session => {
          const date = getSessionDate(session);
          return date !== null && isSameDay(date, now);
        }).length,
        weekSessions: sessions.filter(session => {
          const date = getSessionDate(session);
          return date !== null && isWithinDays(date, 7);
        }).length,
        conversationBytes: sessions.reduce(
          (total, session) => total + new Blob([JSON.stringify(session ?? {})]).size,
          0
        ),
        messageBytes,
        dailyMessages,
        activity,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Settings metrics refresh failed:', error);
      setMetricsError('Live account data could not be loaded. Try refreshing.');
    } finally {
      setLoadingMetrics(false);
    }
  }, []);

  useEffect(() => {
    if (!needsMetrics) return;
    void refreshMetrics();

    const interval = window.setInterval(() => void refreshMetrics(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshMetrics();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [needsMetrics, refreshMetrics]);

  const browserBytes = useMemo(() => readStoredBytes(), [metrics.lastUpdated, active]);
  const totalStorageBytes = metrics.conversationBytes + metrics.messageBytes + browserBytes;
  const averageMessages =
    metrics.sessions.length > 0 ? metrics.messageCount / metrics.sessions.length : 0;
  const firstLoad = loadingMetrics && !metrics.lastUpdated;

  const dailyLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = startOfDay(new Date());
        day.setDate(day.getDate() - (6 - index));
        return day;
      }),
    [metrics.lastUpdated]
  );

  const dailySessions = useMemo(
    () =>
      dailyLabels.map(
        day =>
          metrics.sessions.filter(session => {
            const date = getSessionDate(session);
            return date !== null && isSameDay(date, day);
          }).length
      ),
    [dailyLabels, metrics.sessions]
  );

  const maxDaily = Math.max(1, ...metrics.dailyMessages);
  const busiestIndex = metrics.dailyMessages.indexOf(Math.max(...metrics.dailyMessages));
  const topConversations = useMemo(
    () => [...metrics.activity].sort((a, b) => b.count - a.count).slice(0, 5),
    [metrics.activity]
  );
  const recentSessions = useMemo(
    () =>
      [...metrics.sessions]
        .filter(session => getSessionDate(session))
        .sort((a, b) => (getSessionDate(b)?.getTime() ?? 0) - (getSessionDate(a)?.getTime() ?? 0))
        .slice(0, 5),
    [metrics.sessions]
  );

  // ── Data controls ────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState<'json' | 'markdown' | null>(null);
  const [exportProgress, setExportProgress] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'browser' | 'signout' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const exportChats = async (format: 'json' | 'markdown') => {
    if (exporting) return;
    setExporting(format);
    setExportProgress('Preparing…');
    try {
      const bundles = await fetchAllConversations((done, total) =>
        setExportProgress(`Collected ${done} of ${total} chats…`)
      );
      if (bundles.length === 0) {
        showToast('You have no chats to export yet', 'error');
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      if (format === 'json') {
        const payload = {
          app: 'Twinkle AI',
          exportedAt: new Date().toISOString(),
          account: { email: user.email, username: user.username },
          conversations: bundles.map(({ session, messages }) => ({
            id: session.id,
            title: session.sessionName,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messages: messages.map((message: any) => ({
              role: message?.role,
              content: message?.content,
              timestamp: message?.timestamp,
            })),
          })),
        };
        downloadBlob(JSON.stringify(payload, null, 2), `twinkle-chats-${stamp}.json`, 'application/json');
      } else {
        const text = bundles
          .map(({ session, messages }) => {
            const body = messages
              .map((message: any) => {
                const who = message?.role === 'user' ? 'You' : 'Twinkle';
                const when = message?.timestamp ? ` · ${new Date(message.timestamp).toLocaleString()}` : '';
                return `**${who}**${when}\n\n${message?.content ?? ''}`;
              })
              .join('\n\n---\n\n');
            return `# ${session.sessionName}\n\n${body}`;
          })
          .join('\n\n\n');
        downloadBlob(text, `twinkle-chats-${stamp}.md`, 'text/markdown');
      }
      showToast(`Exported ${bundles.length} chat${bundles.length === 1 ? '' : 's'}`);
    } catch (error) {
      console.error('Chat export failed:', error);
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setExporting(null);
      setExportProgress('');
    }
  };

  const deleteAllChats = async () => {
    setDeleting(true);
    try {
      await chatApi.clearSessions();
      try {
        localStorage.removeItem('scout_current_session_id');
      } catch { /* ignore */ }
      setMetrics({ ...EMPTY_METRICS, lastUpdated: new Date() });
      showToast('All chats deleted');
    } catch (error) {
      console.error('Delete all chats failed:', error);
      showToast('Could not delete chats. Please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const clearBrowserData = () => {
    try {
      APP_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
      showToast('Browser data cleared on this device');
    } catch {
      showToast('Browser storage is not available', 'error');
    }
    setMetrics(current => ({ ...current, lastUpdated: new Date() }));
  };

  const signOut = async () => {
    try {
      if (onLogout) await onLogout();
      else {
        await authApi.logout();
        navigate('/login');
      }
    } catch (error) {
      console.error('Sign out failed:', error);
      showToast('Sign out failed. Please try again.', 'error');
    }
  };

  const modKey = isMac() ? '⌘' : 'Ctrl';
  const accountInitial = (user.username || user.name || user.email || '?').trim().charAt(0).toUpperCase();
  const providerLabel =
    user.authProvider === 'GOOGLE' ? 'Google' : user.authProvider === 'APPLE' ? 'Apple' : 'Email & password';
  const memberSince = user.createdAt ? new Date(user.createdAt) : null;
  const memberSinceLabel =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? memberSince.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : 'Not available';

  const RefreshButton = (
    <Btn onClick={() => void refreshMetrics()} disabled={loadingMetrics} label="Refresh live data">
      <RefreshCw className={`h-3.5 w-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
      Refresh
    </Btn>
  );

  const updatedLabel = (
    <p className="text-xs text-zinc-400">
      {metrics.lastUpdated ? `Updated ${formatRelativeTime(metrics.lastUpdated)}` : 'Loading live data…'}
    </p>
  );

  const errorBanner = metricsError && (
    <div
      role="alert"
      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300"
    >
      {metricsError}
    </div>
  );

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-50/60 dark:bg-zinc-950">
      <div className="flex min-h-[100dvh] w-full">
        {/* Navigation */}
        <aside className="sticky top-0 hidden h-[100dvh] w-[292px] shrink-0 overflow-y-auto border-r border-zinc-200 bg-white px-4 py-6 dark:border-zinc-800 dark:bg-zinc-950 md:block">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="mb-6 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to chat
          </button>

          <nav aria-label="Settings sections" className="space-y-6">
            {SECTION_GROUPS.map(group => (
              <div key={group.heading}>
                <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
                  {group.heading}
                </p>
                <div className="space-y-1">
                  {group.items.map(({ label, id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActive(id)}
                      aria-current={active === id ? 'page' : undefined}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                        active === id
                          ? 'bg-zinc-100 font-semibold text-zinc-900 dark:bg-zinc-900 dark:text-white'
                          : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900/60'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-5 pb-16 pt-5 sm:px-10 sm:pt-10">
          <div className="mx-auto w-full max-w-[900px]">
            {/* Mobile header + section tabs */}
            <div className="md:hidden">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-500"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to chat
              </button>
              <div className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
                {ALL_SECTIONS.map(({ label, id }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActive(id)}
                    aria-current={active === id ? 'page' : undefined}
                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                      active === id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8">
              <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                {activeMeta.label}
              </h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{activeMeta.blurb}</p>
            </div>

            <motion.div
              key={active}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {/* GENERAL */}
              {active === 'general' && (
                <div className="space-y-4">
                  <Card className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        className="h-14 w-14 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-sky-500 text-lg font-semibold text-white">
                        {accountInitial}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                        {user.name || user.username}
                      </p>
                      <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
                      <span className="mt-2 inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                        Signed in with {providerLabel}
                      </span>
                    </div>
                    <Btn onClick={() => navigate('/profile')} label="Open profile">
                      <UserRound className="h-4 w-4" />
                      Edit profile
                      <ChevronRight className="h-3 w-3" />
                    </Btn>
                  </Card>

                  <Card>
                    <Row
                      title="Language"
                      desc="Choose the interface language and preferred language for Live Talk responses."
                    >
                      <label className="relative flex min-w-[200px] items-center">
                        <Globe2 className="pointer-events-none absolute left-3 h-4 w-4 text-zinc-400" />
                        <select
                          value={appLanguage}
                          onChange={event => changeAppLanguage(event.target.value)}
                          className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-10 text-sm font-semibold text-zinc-800 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                          aria-label="Interface language"
                        >
                          {APP_LANGUAGES.map(language => (
                            <option key={language.code} value={language.code}>
                              {language.label}
                              {language.code !== 'auto' ? ` · ${language.native}` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-zinc-400" strokeWidth={1.8} aria-hidden="true" />
                      </label>
                    </Row>

                    <Row title="Theme" desc={`Currently ${theme === 'system' ? 'following your device' : theme}.`}>
                      <Segmented<ThemeChoice>
                        label="Theme"
                        value={theme}
                        onChange={changeTheme}
                        options={[
                          { value: 'light', label: 'Light', icon: Sun },
                          { value: 'dark', label: 'Dark', icon: Moon },
                          { value: 'system', label: 'System', icon: Monitor },
                        ]}
                      />
                    </Row>

                    <Row title="Live Talk Model Color" desc="Choose the color of the Live Talk model.">
                      <Btn
                        onClick={() => navigate('/live-talk-color', { state: { from: '/settings' } })}
                        label="Change Live Talk model color"
                      >
                        <span
                          className="h-3 w-3 rounded-full ring-1 ring-black/10 dark:ring-white/10"
                          style={{ background: liveTalkColor.swatch }}
                        />
                        {liveTalkColor.name}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Btn>
                    </Row>

                    <Row title="Voice" desc={`Live Talk uses ${activeVoice.name} · ${activeVoice.description}.`}>
                      <Btn onClick={() => setVoicePickerOpen(true)} label="Change Live Talk voice">
                        {activeVoice.name}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Btn>
                    </Row>
                  </Card>
                </div>
              )}

              {/* APPEARANCE */}
              {active === 'appearance' && (
                <div className="space-y-4">
                  <Card>
                    <Row title="Theme" desc="Match your device automatically, or pick one." stack>
                      <div className="grid grid-cols-3 gap-3">
                        {(
                          [
                            { value: 'light', label: 'Light', icon: Sun, bg: 'bg-white', bar: 'bg-zinc-200', line: 'bg-zinc-300' },
                            { value: 'dark', label: 'Dark', icon: Moon, bg: 'bg-zinc-900', bar: 'bg-zinc-700', line: 'bg-zinc-600' },
                            { value: 'system', label: 'System', icon: Monitor, bg: 'bg-gradient-to-r from-white to-zinc-900', bar: 'bg-zinc-400', line: 'bg-zinc-500' },
                          ] as const
                        ).map(option => {
                          const selected = theme === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => changeTheme(option.value)}
                              aria-pressed={selected}
                              className={`rounded-2xl border p-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                                selected
                                  ? 'border-violet-500 ring-2 ring-violet-500/25'
                                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700'
                              }`}
                            >
                              <div className={`h-16 rounded-xl border border-zinc-200/70 p-2 dark:border-zinc-700 ${option.bg}`}>
                                <div className={`h-2 w-1/2 rounded-full ${option.bar}`} />
                                <div className={`mt-2 h-2 w-3/4 rounded-full ${option.line}`} />
                                <div className={`mt-1.5 h-2 w-2/5 rounded-full ${option.line}`} />
                              </div>
                              <span className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                <option.icon className="h-3.5 w-3.5" />
                                {option.label}
                                {selected && <Check className="ml-auto h-3.5 w-3.5 text-violet-500" />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </Row>

                    <Row title="Text size" desc="Scales text across the whole app on this device.">
                      <Segmented<FontSizePref>
                        label="Text size"
                        value={prefs.fontSize}
                        onChange={fontSize => updatePrefs({ fontSize })}
                        options={[
                          { value: 'small', label: 'Small' },
                          { value: 'default', label: 'Default' },
                          { value: 'large', label: 'Large' },
                        ]}
                      />
                    </Row>

                    <Row title="Reduce motion" desc="Turns off most animations and transitions for a calmer interface.">
                      <Switch
                        label="Reduce motion"
                        checked={prefs.reduceMotion}
                        onChange={reduceMotion => updatePrefs({ reduceMotion })}
                      />
                    </Row>

                    <Row title="Reset appearance" desc="Return theme, text size and motion to their defaults.">
                      <Btn onClick={resetAppearance}>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Reset
                      </Btn>
                    </Row>
                  </Card>
                </div>
              )}

              {/* VOICE */}
              {active === 'voice' && (
                <div className="w-full">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center justify-center gap-4 sm:gap-10">
                      <button
                        type="button"
                        onClick={() => stepVoice(-1)}
                        disabled={Boolean(previewingVoice)}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
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
                        <h2 className="mt-7 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                          {activeVoice.name}
                        </h2>
                        <p className="mt-1 text-base text-zinc-500 dark:text-zinc-400">{activeVoice.description}</p>

                        <div className="mt-5 flex items-center gap-2">
                          {VOICES.slice(0, 9).map(voice => (
                            <button
                              key={voice.name}
                              type="button"
                              onClick={() => saveVoice(voice.name)}
                              disabled={Boolean(previewingVoice)}
                              className={`h-2.5 w-2.5 rounded-full transition disabled:opacity-60 ${voice.name === activeVoice.name ? 'bg-black dark:bg-white' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                              aria-label={`Select ${voice.name}`}
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => stepVoice(1)}
                        disabled={Boolean(previewingVoice)}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                        aria-label="Next voice"
                      >
                        <ChevronRight className="h-6 w-6" />
                      </button>
                    </div>

                    <div className="mt-6 flex gap-2">
                      <Btn
                        variant="primary"
                        onClick={() => void previewVoice(activeVoice.name)}
                        disabled={Boolean(previewingVoice)}
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        {previewingVoice ? 'Playing…' : 'Play sample'}
                      </Btn>
                      <Btn onClick={() => setVoicePickerOpen(true)}>
                        Browse all voices
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Btn>
                    </div>

                    {voiceError && (
                      <div
                        role="alert"
                        className="mt-4 w-full max-w-[760px] rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-center text-xs leading-5 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300"
                      >
                        {voiceError}
                      </div>
                    )}

                    <Card className="mt-8 w-full max-w-[860px]">
                      <Row title="Model" desc="Live Talk uses Gemini's native audio model.">
                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Gemini 3.8 Live</span>
                      </Row>
                      <Row
                        title="Language"
                        desc="Live Talk follows your selected language when one is chosen; Auto-detect follows your speech."
                      >
                        <Btn onClick={() => setActive('general')}>
                          {selectedLanguage.label}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Btn>
                      </Row>
                      <Row title="Model color" desc="The color of the Live Talk orb.">
                        <Btn onClick={() => navigate('/live-talk-color', { state: { from: '/settings?tab=voice' } })}>
                          <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: liveTalkColor.swatch }} />
                          {liveTalkColor.name}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Btn>
                      </Row>
                    </Card>

                    <p className="mt-6 max-w-[760px] text-center text-xs leading-5 text-zinc-400 dark:text-zinc-500">
                      30 Gemini native voices are available. Selecting a voice plays a short personalized greeting automatically.
                    </p>
                  </div>
                </div>
              )}

              {/* SHORTCUTS */}
              {active === 'shortcuts' && (
                <Card>
                  {[
                    { title: 'Search chats', desc: 'Open the chat search from anywhere.', keys: [modKey, 'K'] },
                    { title: 'New chat', desc: 'Start a fresh conversation.', keys: [modKey, 'Shift', 'O'] },
                    { title: 'Toggle sidebar', desc: 'Collapse or expand the chat list.', keys: [modKey, 'Shift', 'S'] },
                    { title: 'Send message', desc: 'Send what you typed in the composer.', keys: ['Enter'] },
                    { title: 'New line', desc: 'Add a line break without sending.', keys: ['Shift', 'Enter'] },
                    { title: 'Close dialog', desc: 'Dismiss pop-ups such as upload and confirmations.', keys: ['Esc'] },
                  ].map(item => (
                    <Row key={item.title} title={item.title} desc={item.desc}>
                      <div className="flex items-center gap-1.5">
                        {item.keys.map((key, index) => (
                          <span key={key} className="flex items-center gap-1.5">
                            {index > 0 && <span className="text-xs text-zinc-300 dark:text-zinc-600">+</span>}
                            <Kbd>{key}</Kbd>
                          </span>
                        ))}
                      </div>
                    </Row>
                  ))}
                </Card>
              )}

              {/* USAGE */}
              {active === 'usage' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    {updatedLabel}
                    {RefreshButton}
                  </div>
                  {errorBanner}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatCard
                      label="Total chats"
                      loading={firstLoad}
                      value={String(metrics.sessions.length)}
                      detail={`${metrics.todaySessions} today · ${metrics.weekSessions} in 7 days`}
                    />
                    <StatCard
                      label="Total messages"
                      loading={firstLoad}
                      value={String(metrics.messageCount)}
                      detail={`${metrics.userMessages} user · ${metrics.assistantMessages} assistant`}
                    />
                    <StatCard
                      label="Messages today"
                      loading={firstLoad}
                      value={String(metrics.todayMessages)}
                      detail={`${metrics.weekMessages} in the last 7 days`}
                    />
                    <StatCard
                      label="Average per chat"
                      loading={firstLoad}
                      value={metrics.sessions.length ? averageMessages.toFixed(1) : '0'}
                      detail="Based on loaded conversation history"
                    />
                  </div>
                </div>
              )}

              {/* ANALYTICS */}
              {active === 'analytics' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    {updatedLabel}
                    {RefreshButton}
                  </div>
                  {errorBanner}

                  <Card className="py-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-white">Messages per day</h3>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Calculated from your live message history.
                        </p>
                      </div>
                      <BarChart3 className="h-5 w-5 text-zinc-400" />
                    </div>

                    <div className="mt-6 flex h-40 items-end gap-2 sm:gap-4" role="img" aria-label="Messages per day for the last 7 days">
                      {dailyLabels.map((day, index) => {
                        const count = metrics.dailyMessages[index];
                        return (
                          <div key={day.toISOString()} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                            <span className="text-[11px] font-semibold text-zinc-500">{count}</span>
                            <div
                              title={`${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${count} messages, ${dailySessions[index]} new chats`}
                              className={`w-full max-w-[44px] rounded-t-lg transition-all ${
                                count > 0
                                  ? 'bg-gradient-to-t from-violet-500 to-fuchsia-400'
                                  : 'bg-zinc-100 dark:bg-zinc-900'
                              }`}
                              style={{ height: `${Math.max(4, (count / maxDaily) * 100)}%` }}
                            />
                            <span className="text-[10px] font-semibold text-zinc-400">
                              {day.toLocaleDateString(undefined, { weekday: 'short' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard label="User messages" loading={firstLoad} value={String(metrics.userMessages)} />
                    <StatCard label="AI messages" loading={firstLoad} value={String(metrics.assistantMessages)} />
                    <StatCard label="7-day chats" loading={firstLoad} value={String(metrics.weekSessions)} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                      label="Most active day"
                      loading={firstLoad}
                      value={metrics.weekMessages > 0 ? dailyLabels[busiestIndex].toLocaleDateString(undefined, { weekday: 'long' }) : '—'}
                      detail={metrics.weekMessages > 0 ? `${metrics.dailyMessages[busiestIndex]} messages` : 'No activity yet'}
                    />
                    <StatCard
                      label="Daily average"
                      loading={firstLoad}
                      value={(metrics.weekMessages / 7).toFixed(1)}
                      detail="Messages per day, last 7 days"
                    />
                    <StatCard
                      label="Longest chat"
                      loading={firstLoad}
                      value={String(topConversations[0]?.count ?? 0)}
                      detail="Messages in one conversation"
                    />
                  </div>

                  <Card className="py-6">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Top conversations</h3>
                    <div className="mt-4 space-y-1">
                      {topConversations.length === 0 || topConversations[0].count === 0 ? (
                        <p className="text-sm text-zinc-500">No conversations yet.</p>
                      ) : (
                        topConversations.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={!item.publicId}
                            onClick={() => item.publicId && navigate(`/c/${item.publicId}`)}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition enabled:hover:bg-zinc-50 dark:enabled:hover:bg-zinc-900"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                              <FileText className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">{item.name}</p>
                              <p className="text-[10px] text-zinc-400">
                                {item.last ? `Last message ${item.last.toLocaleString()}` : 'No dated messages'}
                              </p>
                            </div>
                            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                              {item.count} msgs
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </Card>

                  <Card className="py-6">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">Recent activity</h3>
                    <div className="mt-4 space-y-1">
                      {recentSessions.length === 0 ? (
                        <p className="text-sm text-zinc-500">No dated sessions are available yet.</p>
                      ) : (
                        recentSessions.map(session => (
                          <div key={session.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                              <Database className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">{session.sessionName}</p>
                              <p className="text-[10px] text-zinc-400">{getSessionDate(session)?.toLocaleString()}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                </div>
              )}

              {/* STORAGE */}
              {active === 'storage' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    {updatedLabel}
                    {RefreshButton}
                  </div>
                  {errorBanner}

                  <Card className="py-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-400">
                          Estimated conversation storage
                        </p>
                        <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                          {formatBytes(totalStorageBytes)}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Live estimate from your loaded account data and browser preferences.
                        </p>
                      </div>
                      <HardDrive className="h-6 w-6 text-zinc-400" />
                    </div>

                    <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900" role="img" aria-label="Storage breakdown">
                      {totalStorageBytes > 0 && (
                        <>
                          <div className="h-full bg-violet-500 transition-all" style={{ width: `${(metrics.messageBytes / totalStorageBytes) * 100}%` }} />
                          <div className="h-full bg-fuchsia-400 transition-all" style={{ width: `${(metrics.conversationBytes / totalStorageBytes) * 100}%` }} />
                          <div className="h-full bg-sky-400 transition-all" style={{ width: `${(browserBytes / totalStorageBytes) * 100}%` }} />
                        </>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-500" />Messages</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-fuchsia-400" />Sessions</span>
                      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-400" />Browser data</span>
                    </div>
                  </Card>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard label="Sessions" loading={firstLoad} value={formatBytes(metrics.conversationBytes)} detail={`${metrics.sessions.length} chats`} />
                    <StatCard label="Messages" loading={firstLoad} value={formatBytes(metrics.messageBytes)} detail={`${metrics.messageCount} messages`} />
                    <StatCard label="Browser data" value={formatBytes(browserBytes)} detail="local + session storage" />
                  </div>

                  <Card>
                    <Row title="Manage your data" desc="Export a copy of your chats, delete them, or clear data stored on this device.">
                      <Btn onClick={() => setActive('data')}>
                        Data controls
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Btn>
                    </Row>
                    <Row title="Automatic refresh" desc="Metrics refresh every minute while this page is open.">
                      <Btn onClick={() => void refreshMetrics()} disabled={loadingMetrics}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
                        Refresh now
                      </Btn>
                    </Row>
                  </Card>
                </div>
              )}

              {/* DATA CONTROLS */}
              {active === 'data' && (
                <div className="space-y-4">
                  <Card>
                    <Row
                      title="Export your chats"
                      desc={exporting ? exportProgress : 'Download every conversation as a file you keep.'}
                    >
                      <div className="flex flex-wrap gap-2">
                        <Btn onClick={() => void exportChats('json')} disabled={Boolean(exporting)}>
                          {exporting === 'json' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <FileJson className="h-3.5 w-3.5" />}
                          JSON
                        </Btn>
                        <Btn onClick={() => void exportChats('markdown')} disabled={Boolean(exporting)}>
                          {exporting === 'markdown' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          Markdown
                        </Btn>
                      </div>
                    </Row>

                    <Row
                      title="Clear browser data"
                      desc="Resets pinned chats, sidebar layout and the last-opened chat on this device. Your chats stay safe."
                    >
                      <Btn onClick={() => setConfirm('browser')}>
                        <HardDrive className="h-3.5 w-3.5" />
                        Clear
                      </Btn>
                    </Row>

                    <Row title="Sign out" desc="Sign out of Twinkle on this device.">
                      <Btn onClick={() => setConfirm('signout')}>
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                      </Btn>
                    </Row>
                  </Card>

                  <div className="rounded-3xl border border-red-200 bg-red-50/40 px-6 dark:border-red-900/40 dark:bg-red-950/10">
                    <Row
                      title="Delete all chats"
                      desc="Permanently removes every conversation and its messages from your account. This cannot be undone."
                    >
                      <Btn variant="danger" onClick={() => setConfirm('delete')} disabled={deleting}>
                        {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        Delete all
                      </Btn>
                    </Row>
                  </div>
                </div>
              )}

              {/* ABOUT */}
              {active === 'about' && (
                <div className="space-y-4">
                  <Card>
                    <Row title="Twinkle AI" desc="Multi-model AI chat with Live Talk voice conversations.">
                      <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                        v{APP_VERSION}
                      </span>
                    </Row>
                    <Row title="Signed in as" desc={user.email}>
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{providerLabel}</span>
                    </Row>
                    <Row title="Member since" desc="The date your account was created.">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{memberSinceLabel}</span>
                    </Row>
                    <Row title="Keyboard shortcuts" desc="See every shortcut in one place.">
                      <Btn onClick={() => setActive('shortcuts')}>
                        <Command className="h-3.5 w-3.5" />
                        View shortcuts
                      </Btn>
                    </Row>
                  </Card>
                </div>
              )}
            </motion.div>
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

      <ConfirmationModal
        isOpen={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void deleteAllChats()}
        title="Delete all chats?"
        message="This permanently deletes every conversation and message in your account. This action cannot be undone."
        confirmText="Delete all"
      />
      <ConfirmationModal
        isOpen={confirm === 'browser'}
        onClose={() => setConfirm(null)}
        onConfirm={clearBrowserData}
        title="Clear browser data?"
        message="Pinned chats, sidebar layout and the last-opened chat will be reset on this device. Your chats and account are not affected."
        confirmText="Clear data"
        isDestructive={false}
      />
      <ConfirmationModal
        isOpen={confirm === 'signout'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void signOut()}
        title="Sign out?"
        message="You will need to sign in again to continue chatting."
        confirmText="Sign out"
        isDestructive={false}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className={`fixed bottom-6 left-1/2 z-[2147483600] flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-xl ${
              toast.tone === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
            }`}
          >
            {toast.tone === 'error' ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
