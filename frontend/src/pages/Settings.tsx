import {
  useCallback,
  useEffect,
  useMemo,
  useRef, 
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom'; 
import { createPortal } from 'react-dom';
import SearchBar from '../components/SearchBar';
import MemorySettings from '../components/MemorySettings';
import { toast } from '../lib/toast';
import { useLanguage, type AppLanguage } from '../lib/i18n';
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Database,
  Download,
  FileJson,
  FileText,
  HardDrive,
  Info,
  Keyboard,
  LogOut,
  Mic,
  Monitor,
  Moon,
  RefreshCw,
  Search as SearchIcon,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import { createZip, readZip } from '../lib/zip';
import { parseServerDate } from '../lib/time';
import { markdownToPrintHtml } from '../lib/printHtml';
import type { User, Session } from '../types';
import {
  authApi,
  chatApi,
  prefetchGeminiVoice,
  previewGeminiVoice,
  startLiveTokenKeepWarm,
  stopGeminiVoicePreview,
} from '../lib/api';
import {
  loadPrefs,
  savePrefs,
  type DisplayPrefs,
  type FontSizePref,
  type LineSpacingPref,
  type FontFamilyPref,
  DEFAULT_PREFS,
} from '../lib/preferences';
import ConfirmationModal from '../components/ConfirmationModal';
import VoiceGrid from '../components/VoiceGrid';
import { VOICES, getVoiceGreeting } from '../lib/voices';
import { shortcutGroups } from '../lib/shortcuts';

type SettingsSection =
  | 'general'
  | 'voice'
  | 'usage'
  | 'analytics'
  | 'storage'
  | 'data'
  | 'shortcuts'
  | 'about';

type ThemeChoice = 'light' | 'dark' | 'system';

const APP_VERSION = '1.0';

export const APP_LANGUAGES = [
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

const APP_STORAGE_KEYS = [
  'scout_current_session_id',
  'Twinkle_pinned_sessions',
  'Twinkle_sidebar_seen',
  'Twinkle_sidebar_width',
];

export type NavId = SettingsSection | 'account';

type NavItem = { label: string; id: NavId; icon: typeof SlidersHorizontal };

// Same structure as Claude's settings dialog: one list of sections with a
// search box above it. "Account" opens the profile page.
const NAV_GROUPS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: 'Settings',
    items: [
      { label: 'General', id: 'general', icon: SettingsIcon },
      { label: 'Account', id: 'account', icon: UserRound },
      { label: 'Voice', id: 'voice', icon: Mic },
      { label: 'Data controls', id: 'data', icon: ShieldCheck },
      { label: 'Shortcuts', id: 'shortcuts', icon: Keyboard },
      { label: 'About', id: 'about', icon: Info },
    ],
  },
  {
    heading: 'Insights',
    items: [
      { label: 'Usage', id: 'usage', icon: BarChart3 },
      { label: 'Analytics', id: 'analytics', icon: BarChart3 },
      { label: 'Storage', id: 'storage', icon: HardDrive },
    ],
  },
];

const ALL_SECTIONS = NAV_GROUPS.flatMap(group => group.items).filter(
  (item): item is NavItem & { id: SettingsSection } => item.id !== 'account'
);
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

const downloadBlob = (content: string | Blob, filename: string, type: string) => {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Turns a chat title into a safe, readable file name.
const safeFileName = (title: string, fallback: string) => {
  const cleaned = (title || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return cleaned || fallback;
};

const isMac = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

const buttonBase =
  'inline-flex h-8 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:cursor-not-allowed disabled:opacity-50';

export function Btn({
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
      'border border-zinc-300/70 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-white/15 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/5',
    primary:
      'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200',
    danger:
      'border border-[#e8b4b4] bg-transparent text-[#b3261e] hover:bg-[#fdf1f0] dark:border-[#7f1d1d] dark:text-[#f2b8b5] dark:hover:bg-[#2a0f12]',
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

const INDIAN_LANGUAGE_CODES = new Set(['hi', 'te', 'ta', 'kn', 'ml', 'bn', 'mr', 'gu', 'pa', 'ur']);

function LanguageSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number }>({
    left: 0,
    width: 300,
    maxHeight: 360,
  });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = APP_LANGUAGES.find(item => item.code === value) ?? APP_LANGUAGES[0];

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = APP_LANGUAGES.filter(
      item =>
        !q ||
        item.label.toLowerCase().includes(q) ||
        item.native.toLowerCase().includes(q) ||
        item.code.toLowerCase() === q,
    );
    return [
      { title: 'Automatic', items: matches.filter(item => item.code === 'auto') },
      { title: 'Indian languages', items: matches.filter(item => INDIAN_LANGUAGE_CODES.has(item.code)) },
      {
        title: 'World languages',
        items: matches.filter(item => item.code !== 'auto' && !INDIAN_LANGUAGE_CODES.has(item.code)),
      },
    ].filter(group => group.items.length > 0);
  }, [query]);

  const flat = useMemo(() => groups.flatMap(group => group.items), [groups]);

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(Math.max(rect.width, 300), window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
      setPos({ top: rect.bottom + 8, left, width, maxHeight: Math.max(220, Math.min(420, spaceBelow - 8)) });
    } else {
      setPos({ bottom: window.innerHeight - rect.top + 8, left, width, maxHeight: Math.max(220, Math.min(420, spaceAbove - 8)) });
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    setActive(Math.max(0, flat.findIndex(item => item.code === value)));
    const t = window.setTimeout(() => searchRef.current?.focus(), 30);

    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (code: string) => {
    onChange(code);
    close();
    buttonRef.current?.focus();
  };

  const onSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(i => Math.min(flat.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (flat[active]) choose(flat[active].code);
    }
  };

  let runningIndex = -1;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Interface language"
        className="group inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-[14px] text-zinc-900 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-100 dark:hover:bg-white/5"
      >
        <span data-no-translate>{selected.native}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.8}
          aria-hidden="true"
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label="Choose language"
            style={{
              position: 'fixed',
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 1000,
            }}
            className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-black/10 dark:border-white/10 dark:bg-[#30302E] dark:shadow-black/60"
          >
            <div className="border-b border-zinc-100 p-2.5 dark:border-white/10">
              <SearchBar
                ref={searchRef}
                value={query}
                onChange={setQuery}
                onKeyDown={onSearchKey}
                placeholder="Search languages"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              {flat.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-zinc-500">No language found</p>
              )}

              {groups.map(group => (
                <div key={group.title} className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-xs text-zinc-500">
                    {group.title}
                  </p>
                  {group.items.map(item => {
                    runningIndex += 1;
                    const index = runningIndex;
                    const isSelected = item.code === value;
                    const isActive = index === active;
                    return (
                      <button
                        key={item.code}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        data-index={index}
                        data-no-translate
                        onMouseEnter={() => setActive(index)}
                        onClick={() => choose(item.code)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                          isActive ? 'bg-zinc-100 dark:bg-white/10' : ''
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-zinc-900 dark:text-zinc-100">
                            {item.native}
                          </span>
                          {item.native !== item.label && (
                            <span className="block truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                              {item.label}
                            </span>
                          )}
                        </span>
                        {item.code !== 'auto' && (
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                            {item.code}
                          </span>
                        )}
                        {isSelected && <Check className="h-4 w-4 shrink-0 text-zinc-900 dark:text-zinc-100" strokeWidth={2.4} />}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Bordered panel used for charts and grouped stats.
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-transparent ${className}`}>
      {children}
    </div>
  );
}

// A titled group of rows, e.g. "Appearance" or "Voice" in Claude's dialog.
export function Section({
  title,
  action,
  children,
  first = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section className={first ? '' : 'mt-10'}>
      {title && (
        <div className="flex min-h-[36px] items-center justify-between gap-3">
          <h2 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h2>
          {action && <div className="mr-11 flex shrink-0 items-center md:mr-12">{action}</div>}
        </div>
      )}
      <div className={title ? 'mt-3' : ''}>{children}</div>
    </section>
  );
}

export function Row({
  title,
  desc,
  children,
  stack = false,
}: {
  title: string;
  desc?: ReactNode;
  children?: ReactNode;
  stack?: boolean;
}) {
  return (
    <div
      className={`border-b border-zinc-200/70 py-4 last:border-0 dark:border-white/10 ${
        stack ? 'flex flex-col gap-4' : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[14px] text-zinc-900 dark:text-zinc-50">{title}</p>
        {desc && <p className="mt-0.5 text-sm leading-5 text-zinc-500 dark:text-zinc-400">{desc}</p>}
      </div>
      {children !== undefined && <div className="shrink-0">{children}</div>}
    </div>
  );
}

export function Switch({
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
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
        checked
          ? 'border-[#2C84DB] bg-[#2C84DB]'
          : 'border-zinc-300 bg-zinc-200 dark:border-white/15 dark:bg-white/10'
      }`}
    >
      <span
        className={`absolute left-0.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[20px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// Segmented control. An option with an empty label renders as icon-only
// (like Claude's theme switcher) and uses `title` as its accessible name.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: typeof Sun; title?: string }>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex gap-0.5 rounded-xl bg-zinc-100 p-[3px] dark:bg-white/5"
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
            aria-label={option.title || option.label}
            title={option.title || option.label}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-[9px] border text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
              option.label ? 'px-3.5' : 'w-9'
            } ${
              selected
                ? 'border-zinc-200 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/15 dark:text-white'
                : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
            }`}
          >
            {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />}
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
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-transparent">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/10" />
      ) : (
        <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">{value}</p>
      )}
      {detail && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{detail}</p>}
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[26px] items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 dark:border-white/15 dark:bg-white/5 dark:text-zinc-200">
      {children}
    </kbd>
  );
}

/**
 * The shared frame for Settings and Profile: a dimmed backdrop with a centred
 * panel, a left list of sections with a search box, and a close button.
 * Mirrors Claude's settings dialog.
 */
export function SettingsShell({ activeId, children }: { activeId: NavId; children: ReactNode }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const go = (id: NavId) => {
    if (id === activeId) return;
    if (id === 'account') navigate('/profile');
    else navigate(`/settings?tab=${id}`, { replace: activeId !== 'account' });
  };

  const q = query.trim().toLowerCase();
  const groups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => !q || item.label.toLowerCase().includes(q)),
  })).filter(group => group.items.length > 0);
  const flatItems = NAV_GROUPS.flatMap(group => group.items);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white md:bg-black/45 md:p-5 dark:bg-[#262624] md:dark:bg-black/60">
      <div className="relative flex h-full w-full overflow-hidden bg-white dark:bg-[#30302E] md:h-[calc(100dvh-40px)] md:max-h-[780px] md:max-w-[1040px] md:rounded-2xl md:border md:border-zinc-200/60 md:shadow-2xl dark:md:border-white/10">
        <aside className="hidden w-[232px] shrink-0 flex-col overflow-y-auto border-r border-zinc-200/70 bg-zinc-50/60 px-3.5 py-4 dark:border-white/10 dark:bg-black/10 md:flex">
          <label className="flex h-9 items-center gap-2.5 rounded-lg border border-zinc-300/70 bg-white px-3 focus-within:border-zinc-400 dark:border-white/15 dark:bg-transparent dark:focus-within:border-white/30">
            <SearchIcon className="h-[17px] w-[17px] shrink-0 text-zinc-500" strokeWidth={1.7} />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search settings"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100"
            />
          </label>

          <nav aria-label="Settings sections" className="mt-5">
            {groups.map(group => (
              <div key={group.heading} className="mb-5">
                <p className="px-3 pb-1.5 text-[13px] text-zinc-500 dark:text-zinc-400">{group.heading}</p>
                <div className="space-y-0.5">
                  {group.items.map(({ label, id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => go(id)}
                      aria-current={activeId === id ? 'page' : undefined}
                      className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
                        activeId === id
                          ? 'bg-zinc-200/60 font-medium text-zinc-900 dark:bg-white/10 dark:text-white'
                          : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5'
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {groups.length === 0 && <p className="px-3 text-sm text-zinc-500">No matches</p>}
          </nav>
        </aside>

        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="Close settings"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:bg-white/10 max-md:right-3 max-md:top-3 max-md:z-20 max-md:rounded-full max-md:border max-md:border-zinc-200 max-md:bg-zinc-100 max-md:shadow-sm max-md:hover:bg-zinc-200 dark:max-md:border-white/10 dark:max-md:bg-white/10 dark:max-md:text-zinc-100 dark:max-md:hover:bg-white/20"
        >
          <X className="h-5 w-5 max-md:h-[18px] max-md:w-[18px]" strokeWidth={1.7} />
        </button>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* Phone layout: section chips replace the left list */}
          <div className="flex gap-2 overflow-x-auto px-4 pb-1 pt-16 [scrollbar-width:none] md:hidden">
            {flatItems.map(({ label, id }) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={activeId === id ? 'page' : undefined}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  activeId === id
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'border border-zinc-300/70 text-zinc-700 dark:border-white/15 dark:text-zinc-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="px-5 pb-10 pt-5 md:px-8 md:pt-4">{children}</div>
        </main>
      </div>
    </div>
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
  const active: SettingsSection = isSection(tabParam) ? tabParam : 'general'; // old ?tab=appearance links fall back to General
  const setActive = (id: SettingsSection) => setSearchParams({ tab: id }, { replace: true });

  // ── Toast (global notification system) ───────────────────────────────────
  const showToast = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    if (tone === 'error') toast.error(message);
    else toast.success(message);
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
    const next: DisplayPrefs = { ...DEFAULT_PREFS };
    setPrefs(next);
    savePrefs(next);
    showToast('Appearance reset to defaults');
  };

  // ── Language ─────────────────────────────────────────────────────────────
  // The language lives in the global LanguageProvider, so changing it here
  // re-translates the whole website (sidebar, chat, login, every page).
  const { language: appLanguage, setLanguage: setGlobalLanguage } = useLanguage();
  const selectedLanguage =
    APP_LANGUAGES.find(item => item.code === appLanguage) ?? APP_LANGUAGES[0];

  const changeAppLanguage = (code: string) => {
    const next = APP_LANGUAGES.find(item => item.code === code) ?? APP_LANGUAGES[0];
    setGlobalLanguage(next.code as AppLanguage);
    showToast(`Language set to ${next.label}`);
  };

  // ── Voice ────────────────────────────────────────────────────────────────
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

  const previewSeq = useRef(0);
  const previewTimer = useRef<number | null>(null);
  const greetingText = useMemo(
    () => getVoiceGreeting(selectedVoice, user.username?.trim() || user.name?.trim()),
    [selectedVoice, user.username, user.name]
  );

  const clearPreviewTimer = () => {
    if (previewTimer.current) {
      window.clearTimeout(previewTimer.current);
      previewTimer.current = null;
    }
  };

  // Plays a sample. Never blocks the UI: a newer request simply replaces the
  // older one, and only the newest request is allowed to update the state.
  const previewVoice = useCallback(
    async (voice: string) => {
      const seq = ++previewSeq.current;
      setVoiceError('');
      setPreviewingVoice(voice);
      try {
        await previewGeminiVoice(
          voice,
          getVoiceGreeting(voice, user.username?.trim() || user.name?.trim()),
          appLanguage
        );
      } catch (error) {
        if (seq !== previewSeq.current) return;
        const message = error instanceof Error ? error.message : 'Gemini voice preview failed.';
        console.error('Gemini voice preview failed:', error);
        setVoiceError(message);
      } finally {
        if (seq === previewSeq.current) setPreviewingVoice(null);
      }
    },
    [user.username, user.name, appLanguage]
  );

  // Selecting changes the name immediately and saves it. The sample starts
  // after a short pause so quickly browsing with the arrows does not fire a
  // request for every voice that scrolls past.
  const saveVoice = (voice: string, delay = 0) => {
    setSelectedVoice(voice);
    try {
      localStorage.setItem('twinkle_live_voice', voice);
    } catch { /* ignore storage failures */ }
    window.dispatchEvent(new CustomEvent('twinkle-voice-change', { detail: voice }));

    clearPreviewTimer();
    stopGeminiVoicePreview();
    setPreviewingVoice(null);
    setVoiceError('');
    previewTimer.current = window.setTimeout(() => {
      previewTimer.current = null;
      void previewVoice(voice);
    }, delay);
  };

  // While a voice screen is open: keep the Live token warm and download the
  // current voice's sample in the background so "Play sample" is instant.
  const voiceUiActive = active === 'voice';
  useEffect(() => {
    if (!voiceUiActive) return;
    const stopKeepWarm = startLiveTokenKeepWarm();
    const prefetchTimer = window.setTimeout(
      () => prefetchGeminiVoice(selectedVoice, greetingText, appLanguage),
      250
    );
    return () => {
      stopKeepWarm();
      window.clearTimeout(prefetchTimer);
      clearPreviewTimer();
      stopGeminiVoicePreview();
      previewSeq.current += 1;
      setPreviewingVoice(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceUiActive]);

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
  const [exporting, setExporting] = useState<'json' | 'markdown' | 'pdf' | null>(null);
  const [exportProgress, setExportProgress] = useState('');
  const [confirm, setConfirm] = useState<'delete' | 'browser' | 'signout' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Imports chats from Twinkle export files (.json, or the .zip of .json files).
  const importChats = async (fileList: FileList | null) => {
    const picked = Array.from(fileList || []);
    if (importing || picked.length === 0) return;
    setImporting(true);
    try {
      const texts: string[] = [];
      for (const file of picked) {
        if (/\.zip$/i.test(file.name)) {
          (await readZip(file)).filter(entry => /\.json$/i.test(entry.name)).forEach(entry => texts.push(entry.content));
        } else {
          texts.push(await file.text());
        }
      }

      const chats: Array<{ title: string; messages: any[] }> = [];
      for (const text of texts) {
        try {
          const data = JSON.parse(text);
          const list = Array.isArray(data?.conversations) ? data.conversations : [data];
          for (const item of list) {
            if (Array.isArray(item?.messages)) chats.push({ title: String(item.title || 'Imported chat'), messages: item.messages });
          }
        } catch { /* skip files that are not valid JSON */ }
      }
      if (chats.length === 0) {
        showToast('No importable chats found. Choose files exported from Twinkle (JSON).', 'error');
        return;
      }

      let imported = 0;
      for (const chat of chats) {
        try {
          const result = await chatApi.importChat({
            title: chat.title,
            messages: chat.messages.map((message: any) => ({
              role: String(message?.role || ''),
              content: String(message?.content ?? ''),
              timestamp: message?.timestamp ? String(message.timestamp) : undefined,
            })),
          }) as any;
          if (result?.success !== false) imported++;
        } catch { /* continue with the next chat */ }
      }
      if (imported === 0) showToast('Import failed. Please try again.', 'error');
      else showToast(`Imported ${imported} chat${imported === 1 ? '' : 's'}. Reload the page to see them.`);
    } catch (error) {
      console.error('Chat import failed:', error);
      showToast('Import failed. Please try again.', 'error');
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const exportChats = async (format: 'json' | 'markdown' | 'pdf') => {
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

      if (format === 'pdf') {
        // Opens a clean, printable page; choose "Save as PDF" in the print dialog.
        const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const body = bundles.map(({ session, messages }) => `
          <section>
            <h1>${escapeHtml(session.sessionName || 'Untitled chat')}</h1>
            ${messages.map((message: any) => {
              const when = parseServerDate(message?.timestamp);
              return `<div class="m ${message?.role === 'user' ? 'u' : 'a'}"><b>${message?.role === 'user' ? 'You' : 'Twinkle'}</b>${when ? ` <i>${escapeHtml(when.toLocaleString())}</i>` : ''}<div class="c">${markdownToPrintHtml(String(message?.content ?? ''))}</div></div>`;
            }).join('')}
          </section>`).join('');
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          showToast('Allow pop-ups to export as PDF', 'error');
          return;
        }
        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Twinkle chats ${stamp}</title>
          <style>body{font:14px/1.6 system-ui,sans-serif;margin:32px;color:#1f1e1d}section{page-break-after:always}h1{font-size:22px;border-bottom:1px solid #ddd;padding-bottom:8px}
          .m{margin:14px 0}.m i{color:#777;font-style:normal;font-size:12px}.c p{margin:4px 0}.c h3{font-size:15px;margin:10px 0 4px}.c ul{margin:4px 0 4px 20px;padding:0}.c img{max-width:100%;max-height:520px;height:auto;display:block;margin:8px 0;border-radius:8px;page-break-inside:avoid}
          .c code{background:#f0eee6;padding:1px 4px;border-radius:4px;font:12px ui-monospace,monospace}.c pre.code{background:#f0eee6;padding:10px 12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;page-break-inside:avoid}.c pre.code code{background:none;padding:0}
          .u .c{background:#f0eee6;padding:6px 12px;border-radius:10px}.c a{color:#c6613f}@page{margin:14mm}</style></head><body>${body}</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        window.setTimeout(() => printWindow.print(), 400);
        showToast(`Prepared ${bundles.length} chat${bundles.length === 1 ? '' : 's'} for PDF`);
        return;
      }

      const extension = format === 'json' ? 'json' : 'md';
      const mime = format === 'json' ? 'application/json' : 'text/markdown';
      const usedNames = new Set<string>();

      // One file per chat, named after the chat title.
      const files = bundles.map(({ session, messages }, index) => {
        const base = safeFileName(session.sessionName, `Chat ${index + 1}`);
        let name = `${base}.${extension}`;
        let counter = 2;
        while (usedNames.has(name.toLowerCase())) name = `${base} (${counter++}).${extension}`;
        usedNames.add(name.toLowerCase());

        let content: string;
        if (format === 'json') {
          content = JSON.stringify({
            app: 'Twinkle AI',
            exportedAt: new Date().toISOString(),
            account: { email: user.email, username: user.username },
            id: session.id,
            title: session.sessionName,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messages: messages.map((message: any) => ({
              role: message?.role,
              content: message?.content,
              timestamp: message?.timestamp,
            })),
          }, null, 2);
        } else {
          const body = messages
            .map((message: any) => {
              const who = message?.role === 'user' ? 'You' : 'Twinkle';
              const when = parseServerDate(message?.timestamp);
              return `**${who}**${when ? ` · ${when.toLocaleString()}` : ''}\n\n${message?.content ?? ''}`;
            })
            .join('\n\n---\n\n');
          content = `# ${session.sessionName}\n\n${body}\n`;
        }
        return { name, content };
      });

      if (files.length === 1) {
        downloadBlob(files[0].content, files[0].name, mime);
      } else {
        downloadBlob(createZip(files), `Twinkle chats ${stamp}.zip`, 'application/zip');
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
    <p className="text-sm text-zinc-500 dark:text-zinc-400">
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

  const dangerZone = 'rounded-xl border border-[#ecc5c3] bg-[#fdf6f5] px-5 dark:border-[#7f1d1d] dark:bg-[#2a0f12]';

  return (
    <SettingsShell activeId={active}>
      <motion.div
        key={active}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
      >
        {/* GENERAL */}
        {active === 'general' && (
          <>
            <Section title="Appearance" first>
              <Row title="Theme" desc={`Currently ${theme === 'system' ? 'following your device' : theme}.`}>
                <Segmented<ThemeChoice>
                  label="Theme"
                  value={theme}
                  onChange={changeTheme}
                  options={[
                    { value: 'system', label: '', icon: Monitor, title: 'Match system' },
                    { value: 'light', label: '', icon: Sun, title: 'Light' },
                    { value: 'dark', label: '', icon: Moon, title: 'Dark' },
                  ]}
                />
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
              <Row title="Line spacing" desc="Space between lines in chat messages.">
                <Segmented<LineSpacingPref>
                  label="Line spacing"
                  value={prefs.lineSpacing}
                  onChange={lineSpacing => updatePrefs({ lineSpacing })}
                  options={[
                    { value: 'compact', label: 'Compact' },
                    { value: 'default', label: 'Default' },
                    { value: 'relaxed', label: 'Relaxed' },
                  ]}
                />
              </Row>
              <Row title="Font" desc="Typeface used across the app.">
                <Segmented<FontFamilyPref>
                  label="Font"
                  value={prefs.fontFamily}
                  onChange={fontFamily => updatePrefs({ fontFamily })}
                  options={[
                    { value: 'default', label: 'Default' },
                    { value: 'serif', label: 'Serif' },
                    { value: 'mono', label: 'Mono' },
                  ]}
                />
              </Row>
              <Row title="Read aloud speed" desc="How fast answers are read aloud.">
                <Segmented<string>
                  label="Read aloud speed"
                  value={String(prefs.readAloudSpeed)}
                  onChange={next => updatePrefs({ readAloudSpeed: Number(next) })}
                  options={[
                    { value: '0.75', label: '0.75×' },
                    { value: '1', label: '1×' },
                    { value: '1.25', label: '1.25×' },
                    { value: '1.5', label: '1.5×' },
                  ]}
                />
              </Row>
              <Row title="Motion" desc="Reduce animation in streaming responses and other interface elements.">
                <Segmented<'system' | 'reduced'>
                  label="Motion"
                  value={prefs.reduceMotion ? 'reduced' : 'system'}
                  onChange={next => updatePrefs({ reduceMotion: next === 'reduced' })}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'reduced', label: 'Reduced' },
                  ]}
                />
              </Row>
              <Row title="Reset appearance" desc="Return theme, text size, spacing, font and motion to their defaults.">
                <Btn onClick={resetAppearance}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
                </Btn>
              </Row>
            </Section>

            <Section title="Language">
              <Row
                title="Language"
                desc="Choose the interface language and preferred language for Live Talk responses."
              >
                <LanguageSelect value={appLanguage} onChange={changeAppLanguage} />
              </Row>
            </Section>

            <Section title="Voice">
              <Row title="Voice" desc="Choose the Gemini voice used by Live Talk.">
                <button
                  type="button"
                  onClick={() => setActive('voice')}
                  className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-[14px] text-zinc-900 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-100 dark:hover:bg-white/5"
                >
                  {activeVoice.name}
                  <ChevronRight className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
                </button>
              </Row>
            </Section>
          </>
        )}

        {/* VOICE */}
        {active === 'voice' && (
          <Section title="Voice" first>
            <p className="-mt-1 mb-4 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
              Pick the voice Twinkle uses in Live Talk. Choosing a voice saves it and plays a short greeting.
            </p>

            <VoiceGrid
              selected={selectedVoice}
              previewing={previewingVoice}
              error={voiceError}
              onPick={voice => saveVoice(voice)}
              onPlay={voice => {
                clearPreviewTimer();
                void previewVoice(voice);
              }}
            />

            <div className="mt-8">
              <Row title="Model" desc="Live Talk uses Gemini's native audio model.">
                <span className="text-[14px] text-zinc-800 dark:text-zinc-200">Gemini 3.8 Live</span>
              </Row>
              <Row
                title="Language"
                desc="Live Talk follows your selected language; Auto-detect follows your speech."
              >
                <Btn onClick={() => setActive('general')}>
                  {selectedLanguage.label}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Btn>
              </Row>
            </div>
          </Section>
        )}

        {active === 'shortcuts' && (
          <Section title="Shortcuts" first>
            {shortcutGroups(modKey).map((group, groupIndex) => (
              <div key={group.heading} className={groupIndex === 0 ? '' : 'mt-7'}>
                <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">{group.heading}</p>
                <div className="mt-1">
                  {group.items.map(item => (
                    <Row key={item.title} title={item.title} desc={item.desc}>
                      <div className="flex items-center gap-1.5">
                        {item.keys.map((key, index) => (
                          <span key={`${key}-${index}`} className="flex items-center gap-1.5">
                            {index > 0 && <span className="text-xs text-zinc-300 dark:text-zinc-600">+</span>}
                            <Kbd>{key}</Kbd>
                          </span>
                        ))}
                      </div>
                    </Row>
                  ))}
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* USAGE */}
        {active === 'usage' && (
          <Section title="Usage" action={RefreshButton} first>
            <div className="space-y-3">
              {updatedLabel}
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
          </Section>
        )}

        {/* ANALYTICS */}
        {active === 'analytics' && (
          <Section title="Analytics" action={RefreshButton} first>
            <div className="space-y-3">
              {updatedLabel}
              {errorBanner}

              <Panel>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-[14px] font-medium text-zinc-900 dark:text-white">Messages per day</h3>
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                      Calculated from your live message history.
                    </p>
                  </div>
                  <BarChart3 className="h-5 w-5 text-zinc-400" strokeWidth={1.6} />
                </div>

                <div className="mt-6 flex h-40 items-end gap-2 sm:gap-4" role="img" aria-label="Messages per day for the last 7 days">
                  {dailyLabels.map((day, index) => {
                    const count = metrics.dailyMessages[index];
                    return (
                      <div key={day.toISOString()} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                        <span className="text-xs text-zinc-500">{count}</span>
                        <div
                          title={`${day.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}: ${count} messages, ${dailySessions[index]} new chats`}
                          className={`w-full max-w-[44px] rounded-t-md transition-all ${
                            count > 0 ? 'bg-[#C6613F]' : 'bg-zinc-100 dark:bg-white/10'
                          }`}
                          style={{ height: `${Math.max(4, (count / maxDaily) * 100)}%` }}
                        />
                        <span className="text-xs text-zinc-500">
                          {day.toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>

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

              <Panel>
                <h3 className="text-[14px] font-medium text-zinc-900 dark:text-white">Top conversations</h3>
                <div className="mt-3 space-y-0.5">
                  {topConversations.length === 0 || topConversations[0].count === 0 ? (
                    <p className="text-sm text-zinc-500">No conversations yet.</p>
                  ) : (
                    topConversations.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!item.publicId}
                        onClick={() => item.publicId && navigate(`/chat/${item.publicId}`)}
                        className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition enabled:hover:bg-zinc-50 dark:enabled:hover:bg-white/5"
                      >
                        <FileText className="h-[18px] w-[18px] shrink-0 text-zinc-500" strokeWidth={1.6} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{item.name}</p>
                          <p className="text-xs text-zinc-500">
                            {item.last ? `Last message ${item.last.toLocaleString()}` : 'No dated messages'}
                          </p>
                        </div>
                        <span className="text-sm text-zinc-500 dark:text-zinc-400">{item.count} msgs</span>
                      </button>
                    ))
                  )}
                </div>
              </Panel>

              <Panel>
                <h3 className="text-[14px] font-medium text-zinc-900 dark:text-white">Recent activity</h3>
                <div className="mt-3 space-y-0.5">
                  {recentSessions.length === 0 ? (
                    <p className="text-sm text-zinc-500">No dated sessions are available yet.</p>
                  ) : (
                    recentSessions.map(session => (
                      <div key={session.id} className="flex items-center gap-3 rounded-lg px-2.5 py-2">
                        <Database className="h-[18px] w-[18px] shrink-0 text-zinc-500" strokeWidth={1.6} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{session.sessionName}</p>
                          <p className="text-xs text-zinc-500">{getSessionDate(session)?.toLocaleString()}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Panel>
            </div>
          </Section>
        )}

        {/* STORAGE */}
        {active === 'storage' && (
          <Section title="Storage" action={RefreshButton} first>
            <div className="space-y-3">
              {updatedLabel}
              {errorBanner}

              <Panel>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Estimated conversation storage</p>
                    <p className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white">
                      {formatBytes(totalStorageBytes)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Live estimate from your loaded account data and browser preferences.
                    </p>
                  </div>
                  <HardDrive className="h-6 w-6 text-zinc-400" strokeWidth={1.5} />
                </div>

                <div className="mt-6 flex h-2.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10" role="img" aria-label="Storage breakdown">
                  {totalStorageBytes > 0 && (
                    <>
                      <div className="h-full bg-[#C6613F] transition-all" style={{ width: `${(metrics.messageBytes / totalStorageBytes) * 100}%` }} />
                      <div className="h-full bg-[#E3A68F] transition-all" style={{ width: `${(metrics.conversationBytes / totalStorageBytes) * 100}%` }} />
                      <div className="h-full bg-[#A8A396] transition-all" style={{ width: `${(browserBytes / totalStorageBytes) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#C6613F]" />Messages</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#E3A68F]" />Sessions</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#A8A396]" />Browser data</span>
                </div>
              </Panel>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard label="Sessions" loading={firstLoad} value={formatBytes(metrics.conversationBytes)} detail={`${metrics.sessions.length} chats`} />
                <StatCard label="Messages" loading={firstLoad} value={formatBytes(metrics.messageBytes)} detail={`${metrics.messageCount} messages`} />
                <StatCard label="Browser data" value={formatBytes(browserBytes)} detail="local + session storage" />
              </div>

              <div>
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
              </div>
            </div>
          </Section>
        )}

        {/* DATA CONTROLS */}
        {active === 'data' && (
          <>
            <Section title="Data controls" first>
              <Row
                title="Export your chats"
                desc={exporting ? exportProgress : 'Download each conversation as its own file, named after the chat.'}
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
                  <Btn onClick={() => void exportChats('pdf')} disabled={Boolean(exporting)}>
                    {exporting === 'pdf' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    PDF
                  </Btn>
                </div>
              </Row>

              <Row
                title="Import chats"
                desc="Add chats from a Twinkle export (JSON file, or the zip of JSON files). They are added as new chats."
              >
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,.zip,application/json,application/zip"
                  multiple
                  className="hidden"
                  onChange={event => void importChats(event.target.files)}
                />
                <Btn onClick={() => importInputRef.current?.click()} disabled={importing}>
                  {importing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {importing ? 'Importing…' : 'Import'}
                </Btn>
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
            </Section>

            <div className={`mt-8 ${dangerZone}`}>
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
            <MemorySettings />
          </>
        )}

        {/* ABOUT */}
        {active === 'about' && (
          <Section title="About" first>
            <Row title="Twinkle AI" desc="Multi-model AI chat with Live Talk voice conversations.">
              <span className="text-[14px] text-zinc-800 dark:text-zinc-200">v{APP_VERSION}</span>
            </Row>
            <Row title="Signed in as" desc={user.email}>
              <span className="text-[14px] text-zinc-800 dark:text-zinc-200">{providerLabel}</span>
            </Row>
            <Row title="Member since" desc="The date your account was created.">
              <span className="text-[14px] text-zinc-800 dark:text-zinc-200">{memberSinceLabel}</span>
            </Row>
            <Row title="Keyboard shortcuts" desc="See every shortcut in one place.">
              <Btn onClick={() => setActive('shortcuts')}>
                <Command className="h-3.5 w-3.5" />
                View shortcuts
              </Btn>
            </Row>
          </Section>
        )}
      </motion.div>


      <ConfirmationModal
        isOpen={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        onConfirm={() => void deleteAllChats()}
        title="Delete all chats?"
        message="This permanently deletes every conversation and message in your account. This can’t be undone."
        confirmText="Delete"
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

    </SettingsShell>
  );
}
