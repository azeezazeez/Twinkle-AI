import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Session, User } from '../types';
import {
  LogOut, Trash2, X, Search, SquarePen,
  MoreHorizontal, PinOff, Loader2, 
  MessageCircle, Pencil, Upload, 
  Settings2, UserCircle2, ChevronRight, ChevronDown, PanelLeft, ArrowUpDown, ListFilter, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import UserAvatar from './UserAvatar'; 
import { chatApi } from '../lib/api';
import StormLogo from './StormLogo'; 
import SearchBar from './SearchBar';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  user: User;
  sessions: Session[];
  currentSessionId: number | null;
  respondingSessionId?: number | null;
  typingSessionId?: number | null;
  onTypingDone?: () => void;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
  onRenameSession: (id: number, name: string) => void;
  onShareSession: (id: number) => void;
  onClearAll: () => void;
  onLogout: () => void;
  onClose?: () => void;
  onProfile?: () => void;
  onSettings?: () => void;
  onDesktopStateChange?: (expanded: boolean) => void;
  onDesktopWidthChange?: (width: number) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PINNED_KEY = 'Twinkle_pinned_sessions';
const SIDEBAR_SEEN_KEY = 'Twinkle_sidebar_seen';
const PINNED_CHANGED_EVENT = 'twinkle:pinned-sessions-changed';

const loadPinnedIds = (): number[] => {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); } catch { return []; }
};
const savePinnedIds = (ids: number[]) => {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event(PINNED_CHANGED_EVENT));
};

const getGroupLabel = (session: Session): string => {
  const raw = (session as any).createdAt || (session as any).created_at;
  if (!raw) return 'Recent';
  const date = new Date(raw);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// ─── Shared Twinkle logo ─────────────────────────────────────────────────────
// ─── Exact sidebar Pin icon ───────────────────────────────────────────────────
// This is the actual supplied reference image, cropped and made transparent.
// It is intentionally used everywhere a Pin icon appears in this sidebar.
const EXACT_PIN_ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACIAAAAiCAYAAAA6RwvCAAABr0lEQVR42u2YwY2DMBBFzWqvaQGJs4vI2ekgacCHFJAGzIEC0oBphEPShiPRyN8T1kDA9tisNodFmgsSw2Pmzx8nFQDxCdeX+JDre89kfd9jHEfxfD5FXdfidruJpmmqpIcB7BLGGBwOh1lIKWGMQcrzu0BYa2cv11qzYYohnHP+pUop0PtSymSYYhCllAdZg0yF2U0XwzBgq2IpMNkQwzB4CK01Yu2LwWSDUDGmaonCOOdQBEIThloSE/ayKixfWIa1FrniphMGYN1ZT6cTHo/HpgnWdS3u97s4Ho8V133HcfQ5ghbf972HuFwu4nw+vyXLAXi9Xrherx7kLe+ydJMrLktXEnTC1vSxqpFJiKk7gruDkn1kS0yl0yWlDE5YcIHlVoXmSM0TLScXhuohVoUoiHMOuTBTO7itDfaYC0OrwXHcqMVzYSgIV1fBw3PTNBV1wK7rRNu2v3Ps5xhRrDIlFUmGsNZG20THdheQJcQkvJhmQsdGNsgWxJaAtdYwxsxcNMcIWRBbMDRyVwMbYgmutfa/ZUoW5dv6zzGjPWL2dUqpP4EAIKr/vyU+FeQH03wjLoHU8JAAAAAASUVORK5CYII=';

function SidebarPinIcon({ className = '' }: { className?: string }) {
  return (
    <img
      src={EXACT_PIN_ICON_DATA_URI}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`object-contain ${className}`}
    />
  );
}

// ─── IconTooltip ──────────────────────────────────────────────────────────────
function IconTooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative z-0 group/tip flex items-center justify-center w-full hover:z-[2147483647] focus-within:z-[2147483647]">
      {children}
      <div className="absolute left-full ml-2.5 flex items-center gap-2 px-3.5 py-2 bg-[#111111] text-white text-[14px] font-bold [font-family:inherit] rounded-full whitespace-nowrap pointer-events-none z-[2147483647] shadow-[0_12px_32px_rgba(0,0,0,0.18)] opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <span>{label}</span>
        {shortcut && (
          <kbd className="rounded-full bg-zinc-600 px-2.5 py-0.5 text-[13px] font-bold leading-5 text-white shadow-inner [font-family:inherit]">
            {shortcut}
          </kbd>
        )}
      </div>
    </div>
  );
}

type CollapsedPopupAnchor = {
  top: number;
  right: number;
};

// ─── Collapsed-sidebar Recents popup ──────────────────────────────────────────
function CollapsedRecentsPopup({
  sessions,
  currentSessionId,
  respondingSessionId,
  onSelectSession,
  onClose,
  anchor,
}: {
  sessions: Session[];
  currentSessionId: number | null;
  respondingSessionId?: number | null;
  onSelectSession: (id: number) => void;
  onClose: () => void;
  anchor: CollapsedPopupAnchor | null;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const recentSessions = [...sessions]
    .sort((a, b) => {
      const aTime = new Date((a as any).updatedAt || (a as any).updated_at || (a as any).createdAt || 0).getTime();
      const bTime = new Date((b as any).updatedAt || (b as any).updated_at || (b as any).createdAt || 0).getTime();
      return bTime - aTime;
    })
    .slice(0, 8);

  if (!anchor) return null;

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.97, x: -4 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.97, x: -4 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className="fixed z-[2147483647] w-[370px] max-w-[calc(100vw-118px)] overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[0_12px_35px_rgba(0,0,0,0.12)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_12px_35px_rgba(0,0,0,0.35)]"
      style={{ left: anchor.right + 12, top: anchor.top }}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="px-7 pb-2 pt-6">
        <h3 className="text-[15px] font-medium tracking-tight text-zinc-500 dark:text-zinc-400">
          Recents
        </h3>
      </div>

      <div className="max-h-[360px] overflow-y-auto px-3 pb-3">
        {recentSessions.length === 0 ? (
          <div className="px-4 py-6 text-[14px] text-zinc-400 dark:text-zinc-500">
            No recent chats
          </div>
        ) : (
          recentSessions.map(session => {
            const id = Number(session.id);
            const title = String((session as any).sessionName || (session as any).name || 'New Chat');
            const isActive = id === currentSessionId;

            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelectSession(id);
                  onClose();
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-[15px] transition-colors ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/80'
                }`}
              >
                {respondingSessionId === id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" aria-label="Chat responding" />}
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </button>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

// ─── Collapsed-sidebar Pinned popup ───────────────────────────────────────────
function CollapsedPinnedPopup({
  sessions,
  currentSessionId,
  pinnedIds,
  onSelectSession,
  onClose,
  anchor,
}: {
  sessions: Session[];
  currentSessionId: number | null;
  pinnedIds: number[];
  onSelectSession: (id: number) => void;
  onClose: () => void;
  anchor: CollapsedPopupAnchor | null;
}) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!popupRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const pinnedSessions = [...sessions]
    .filter(session => pinnedIds.includes(Number(session.id)))
    .sort((a, b) => {
      const aTime = new Date(
        (a as any).updatedAt || (a as any).updated_at || (a as any).createdAt || 0
      ).getTime();
      const bTime = new Date(
        (b as any).updatedAt || (b as any).updated_at || (b as any).createdAt || 0
      ).getTime();
      return bTime - aTime;
    })
    .slice(0, 12);

  if (!anchor) return null;

  return (
    <motion.div
      ref={popupRef}
      initial={{ opacity: 0, scale: 0.97, x: -4 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.97, x: -4 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className="fixed z-[2147483647] w-[370px] max-w-[calc(100vw-118px)] overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[0_12px_35px_rgba(0,0,0,0.12)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_12px_35px_rgba(0,0,0,0.35)]"
      style={{ left: anchor.right + 12, top: anchor.top }}
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="px-7 pb-2 pt-6">
        <h3 className="text-[15px] font-medium tracking-tight text-zinc-500 dark:text-zinc-400">
          Pinned
        </h3>
      </div>

      <div className="max-h-[360px] overflow-y-auto px-3 pb-3">
        {pinnedSessions.length === 0 ? (
          <div className="px-4 py-6 text-[14px] text-zinc-400 dark:text-zinc-500">
            No pinned chats
          </div>
        ) : (
          pinnedSessions.map(session => {
            const id = Number(session.id);
            const title = String(
              (session as any).sessionName || (session as any).name || 'New Chat'
            );
            const isActive = id === currentSessionId;

            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onSelectSession(id);
                  onClose();
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[15px] transition-colors ${
                  isActive
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/80'
                }`}
              >
                <SidebarPinIcon className="h-[18px] w-[18px] shrink-0 text-zinc-400" />
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </button>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

// ─── TypewriterText ───────────────────────────────────────────────────────────
// Types a chat name in letter by letter. The real, full name always lives in the
// sessions data; this only controls how much of it is shown, so a name can never
// get stuck on a partial value (e.g. just "F").
function TypewriterText({ text, onDone }: { text: string; onDone?: () => void }) {
  const chars = useMemo<string[]>(() => {
    try {
      const Seg = (Intl as any).Segmenter;
      if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (part: any) => part.segment as string);
    } catch { /* fall through */ }
    return Array.from(text);
  }, [text]);
  const [count, setCount] = useState(Math.min(1, chars.length));
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const started = Date.now();
    const duration = Math.min(1800, Math.max(500, chars.length * 45));
    setCount(Math.min(1, chars.length));
    const timer = window.setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / duration);
      setCount(Math.max(1, Math.ceil(chars.length * progress)));
      if (progress >= 1) {
        window.clearInterval(timer);
        onDoneRef.current?.();
      }
    }, 40);
    return () => window.clearInterval(timer);
  }, [chars]);

  return <>{chars.slice(0, count).join('')}</>;
}

// ─── SessionList ──────────────────────────────────────────────────────────────
interface SessionListProps {
  user: User;
  sessions: Session[];
  currentSessionId: number | null;
  respondingSessionId?: number | null;
  typingSessionId?: number | null;
  onTypingDone?: () => void;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
  onRenameSession: (id: number, name: string) => void;
  onShareSession: (id: number) => void;
  onClearAll: () => void;
  onLogout: () => void;
  onClose: () => void;
  onProfile?: () => void;
  onSettings?: () => void;
}

function SessionList({
  user,
  sessions,
  currentSessionId,
  respondingSessionId,
  typingSessionId,
  onTypingDone,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onShareSession,
  onClearAll,
  onLogout,
  onClose,
  onProfile,
  onSettings,
}: SessionListProps) {
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [deletingIds, setDeletingIds] = useState<number[]>([]);
  const [deletingAll, setDeletingAll] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('down');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDeletingIds(previous => previous.filter(id => sessions.some(session => Number(session.id) === id)));
    if (sessions.length === 0) setDeletingAll(false);
  }, [sessions]);

  useEffect(() => {
    if (deletingIds.length === 0 && !deletingAll) return;
    const timeout = window.setTimeout(() => {
      setDeletingIds([]);
      setDeletingAll(false);
    }, 30000);
    return () => window.clearTimeout(timeout);
  }, [deletingIds, deletingAll]);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);
  // Keep date sorting as the default, with an explicit menu for sort mode.
  const [sortMode, setSortMode] = useState<'date' | 'alphabetical'>('date');
  const [dateSortOrder, setDateSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [newChatTooltipPosition, setNewChatTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [headerTooltip, setHeaderTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const showHeaderTooltip = (label: string, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    setHeaderTooltip({ label, top: Math.max(8, rect.top - 42), left: rect.left + rect.width / 2 });
  };

  useEffect(() => {
    if (menuOpenId === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpenId]);

  useEffect(() => {
    if (renamingId !== null) {
      setTimeout(() => renameInputRef.current?.focus(), 50);
    }
  }, [renamingId]);

  const displaySessions: Session[] = sessions
    .map((s: any) => ({
      ...s,
      id: Number(s.id ?? s.sessionId ?? s.session_id),
      sessionName: String(s.sessionName ?? s.name ?? s.title ?? 'New Chat'),
    }))
    .filter((s: any) => Number.isFinite(s.id));

  const getSessionTimestamp = (session: Session) => {
    const value = (session as any).updatedAt
      || (session as any).updated_at
      || (session as any).createdAt
      || (session as any).created_at;
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const sortedByDate = [...displaySessions].sort((a, b) => {
    const difference = getSessionTimestamp(a) - getSessionTimestamp(b);
    return dateSortOrder === 'oldest' ? difference : -difference;
  });
  const sortAlphabetically = (a: Session, b: Session) =>
    a.sessionName.localeCompare(b.sessionName, undefined, { sensitivity: 'base', numeric: true });
  const pinnedSessions = (sortMode === 'alphabetical'
    ? [...displaySessions].filter(s => pinnedIds.includes(s.id)).sort(sortAlphabetically)
    : sortedByDate.filter(s => pinnedIds.includes(s.id)));
  const unpinnedSessions = (sortMode === 'alphabetical'
    ? [...displaySessions].filter(s => !pinnedIds.includes(s.id)).sort(sortAlphabetically)
    : sortedByDate.filter(s => !pinnedIds.includes(s.id)));
  const sortedSessions = [...pinnedSessions, ...unpinnedSessions];

  const grouped: { label: string; items: Session[] }[] = [];
  if (pinnedSessions.length) grouped.push({ label: 'Pinned', items: pinnedSessions });
  if (sortMode === 'alphabetical') {
    if (unpinnedSessions.length) grouped.push({ label: 'Alphabetical order', items: unpinnedSessions });
  } else {
    unpinnedSessions.forEach(session => {
      const label = getGroupLabel(session);
      const last = grouped[grouped.length - 1];
      if (last && last.label === label) last.items.push(session);
      else grouped.push({ label, items: [session] });
    });
  }

  const togglePin = useCallback((id: number) => {
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      savePinnedIds(next);
      return next;
    });
    setMenuOpenId(null);
  }, []);

  const startRename = (session: Session) => {
    setRenamingId(session.id);
    setRenameValue(session.sessionName);
    setMenuOpenId(null);
  };

  const commitRename = () => {
    if (renamingId !== null && renameValue.trim()) {
      onRenameSession(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const handleDelete = (id: number) => {
    // Close the context menu and mobile drawer immediately after Delete is clicked.
    // The parent callback can then handle the delete confirmation / actual deletion.
    // Do NOT start a spinner here: this only opens the confirmation popup.
    // Cancelling it used to leave the row spinning forever. The parent removes
    // the chat optimistically as soon as the user confirms.
    setMenuOpenId(null);
    onClose();
    onDeleteSession(id);
    setPinnedIds(prev => {
      const next = prev.filter(p => p !== id);
      savePinnedIds(next);
      return next;
    });
  };

  const handleShare = (id: number) => {
    setMenuOpenId(null);
    onClose();
    onShareSession(id);
  };

  // FIX: Select the session FIRST (synchronously), then close the drawer.
  // The previous order (close -> setTimeout -> select) raced against the
  // mobile drawer's remount-on-close (Sidebar used to swap a `key` on
  // mobileOpen), which could unmount SessionList before the deferred
  // onSelectSession ever fired -- so taps on mobile sometimes silently
  // failed to switch sessions. Selecting first removes the race entirely.
  const handleSelectSession = (id: number) => {
    if (renamingId !== null) return;

    onSelectSession(id);
    onClose();
  };

  return (
    <>
      {/* Top controls */}
      <div className="px-3 py-2 pb-1 shrink-0">
        <button
          type="button"
          onClick={() => { onNewSession(); onClose(); }}
          aria-label="New chat"
          className="group/newchat w-full h-8 px-2 bg-transparent text-zinc-900 dark:text-zinc-100 rounded-lg flex items-center gap-2.5 text-left hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors active:bg-zinc-200/60 dark:active:bg-zinc-800"
        >
          <span className="twinkle-newchat-box shrink-0 flex h-5 w-5 items-center justify-center rounded-md" aria-hidden="true">
            <SquarePen className="twinkle-newchat-icon w-[18px] h-[18px] text-zinc-900 dark:text-zinc-100" strokeWidth={1.7} />
          </span>
          <span className="text-[14px] font-normal tracking-normal">New chat</span>
        </button>

      </div>

      {/* Session list */}
      <div className="group/recents relative z-40 flex items-center justify-between gap-2 px-3 pb-1 shrink-0">
        <button
          type="button"
          onClick={() => setRecentsCollapsed(collapsed => !collapsed)}
          aria-label={recentsCollapsed ? 'Expand Recents' : 'Collapse Recents'}
          aria-expanded={!recentsCollapsed}
          title={recentsCollapsed ? 'Expand Recents' : 'Collapse Recents'}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 tracking-normal">Recents</span>
          <ChevronDown className={`h-3 w-3 text-zinc-400 transition-transform ${recentsCollapsed ? '-rotate-90' : 'rotate-0'}`} />
        </button>
        {sessions.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5">
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setHeaderTooltip(null);
                  setSortMenuOpen(open => !open);
                }}
                onMouseEnter={(e) => { if (!sortMenuOpen) showHeaderTooltip('Sort chats', e.currentTarget); }}
                onMouseLeave={() => setHeaderTooltip(null)}
                aria-label="Sort chats"
                aria-haspopup="menu"
                aria-expanded={sortMenuOpen}
                className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${sortMenuOpen ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200' : 'text-zinc-400'}`}
              >
                <ListFilter className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
              {sortMenuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close sort menu"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setSortMenuOpen(false)}
                  />
                  <div role="menu" aria-label="Sort chats by" className="absolute right-0 top-7 z-50 w-48 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Sort by</div>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortMode === 'alphabetical'}
                      onClick={(e) => { e.stopPropagation(); setSortMode('alphabetical'); setSortMenuOpen(false); }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <span>Alphabetical order (A–Z)</span>
                      {sortMode === 'alphabetical' && <Check className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={sortMode === 'date'}
                      onClick={(e) => { e.stopPropagation(); setSortMode('date'); setSortMenuOpen(false); }}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <span>Order by Date</span>
                      {sortMode === 'date' && <Check className="h-3.5 w-3.5" />}
                    </button>
                    {sortMode === 'date' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDateSortOrder(current => current === 'newest' ? 'oldest' : 'newest'); setSortMenuOpen(false); }}
                        className="mt-1 flex w-full items-center justify-between rounded-lg border-t border-zinc-100 px-2.5 pt-2 pb-1.5 text-left text-[11px] text-zinc-500 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                      >
                        <span>{dateSortOrder === 'newest' ? 'Newest first' : 'Oldest first'}</span>
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewSession();
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setNewChatTooltipPosition({ top: Math.max(8, rect.top - 42), left: rect.left - 68 });
                }}
                onMouseLeave={() => setNewChatTooltipPosition(null)}
                title="New chat"
                aria-label="New chat"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
              {newChatTooltipPosition && typeof document !== 'undefined' && createPortal(
                <div
                  className="pointer-events-none fixed rounded-full bg-[#111111] px-3.5 py-2 text-[14px] font-bold [font-family:inherit] text-white whitespace-nowrap shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
                  style={{ top: newChatTooltipPosition.top, left: newChatTooltipPosition.left, zIndex: 2147483647 }}
                >
                  New chat
                </div>,
                document.body
              )}
            </div>
            {headerTooltip && typeof document !== 'undefined' && createPortal(
              <div
                className="pointer-events-none fixed -translate-x-1/2 rounded-full bg-[#111111] px-3.5 py-2 text-[14px] font-bold [font-family:inherit] text-white whitespace-nowrap shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
                style={{ top: headerTooltip.top, left: headerTooltip.left, zIndex: 2147483647 }}
              >
                {headerTooltip.label}
              </div>,
              document.body
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHeaderTooltip(null);
                onClose();
                onClearAll();
              }}
              onMouseEnter={(e) => showHeaderTooltip('Clear all', e.currentTarget)}
              onMouseLeave={() => setHeaderTooltip(null)}
              aria-label="Clear all chats"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              {deletingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.8} />
              ) : (
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
              )}
            </button>
          </div>
        )}
      </div>
      {!recentsCollapsed && <div
        className="relative z-30 flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-4"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        {sortedSessions.length === 0 ? (
          <div className="mx-2 py-8 text-center bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider leading-relaxed">
              {'No chats yet'}
              <br />
              <span className="opacity-60 font-medium">
                {'Start a new conversation'}
              </span>
            </p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label} className="mb-2">
              <div className="flex items-center justify-between px-2 pt-3 pb-1">
                <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 tracking-normal">
                  {group.label}
                </span>
              </div>

              <div className="space-y-px">
                {group.items.map(session => {
                  const isActive = currentSessionId === session.id;
                  const isPinned = pinnedIds.includes(session.id);
                  const isMenuOpen = menuOpenId === session.id;
                  const isRenaming = renamingId === session.id;
                  const isResponding = respondingSessionId === session.id;

                  return (
                    <div
                      key={session.id}
                      className="relative"
                      ref={isMenuOpen ? menuRef : undefined}
                    >
                      <motion.div
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`group/item flex h-8 items-center gap-2 px-2 rounded-lg cursor-pointer transition-colors ${
                          isActive
                            ? 'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70 hover:text-zinc-900 dark:hover:text-zinc-100'
                        }`}
                        onClick={() => handleSelectSession(session.id)}
                      >
                        {deletingIds.includes(session.id) ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-zinc-500" aria-label="Deleting chat" />
                        ) : (
                          isPinned ? (
                            <SidebarPinIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" />
                          ) : null
                        )}

                        {isRenaming ? (
                          <input
                            ref={renameInputRef}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') cancelRename();
                              e.stopPropagation();
                            }}
                            onBlur={commitRename}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 min-w-0 bg-white dark:bg-zinc-900 border border-zinc-400 rounded-lg px-2 py-0.5 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                          />
                        ) : (
                          <span data-twinkle-user-content className="flex-1 min-w-0 truncate text-[14px] font-normal leading-snug">
                            {typingSessionId === session.id
                              ? <TypewriterText text={session.sessionName} onDone={onTypingDone} />
                              : session.sessionName}
                          </span>
                        )}

                        {!isRenaming && (
                          <div className="shrink-0 flex items-center gap-1">
                            <div
                              className={`flex items-center gap-0.5 transition-opacity ${
                                isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'
                              }`}
                            >
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                if (isMenuOpen) {
                                  setMenuOpenId(null);
                                  return;
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                const estimatedMenuHeight = 250;
                                setMenuPlacement(
                                  rect.bottom + estimatedMenuHeight > window.innerHeight
                                    ? 'up'
                                    : 'down'
                                );
                                setMenuOpenId(session.id);
                              }}
                              aria-label="Chat options"
                              className={`p-1.5 rounded-lg transition-colors ${
                                isMenuOpen
                                  ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
                                  : 'text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 hover:text-zinc-700 dark:hover:text-zinc-200'
                              }`}
                            >
                              <MoreHorizontal className="w-[16px] h-[16px]" strokeWidth={1.8} />
                            </button>
                            <div className="relative group/pin-tooltip flex items-center justify-center">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  togglePin(session.id);
                                }}
                                aria-label={isPinned ? 'Unpin chat' : 'Pin chat'}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 transition-colors"
                              >
                                {isPinned ? (
                                  <PinOff className="w-[17px] h-[17px]" strokeWidth={1.8} />
                                ) : (
                                  <SidebarPinIcon className="w-[18px] h-[18px]" />
                                )}
                              </button>
                              <div className="absolute right-0 bottom-full mb-2 flex items-center px-3.5 py-2 bg-[#111111] text-white text-[14px] font-bold rounded-full whitespace-nowrap pointer-events-none z-[2147483647] shadow-[0_12px_32px_rgba(0,0,0,0.18)] opacity-0 group-hover/pin-tooltip:opacity-100 transition-opacity duration-150">
                                <span>{isPinned ? 'Unpin chat' : 'Pin chat'}</span>
                              </div>
                            </div>
                            </div>
                            {isResponding && (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-500" aria-label="Chat responding" />
                            )}
                          </div>
                        )}
                      </motion.div>

                      {/* Context menu */}
                      <AnimatePresence>
                        {isMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.92, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.92, y: -4 }}
                            transition={{ duration: 0.12 }}
                            className={`absolute right-0 z-[200] w-[232px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-[18px] shadow-[0_14px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_14px_40px_rgba(0,0,0,0.4)] p-1.5 overflow-hidden ${menuPlacement === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => startRename(session)}
                              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[14px] font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Pencil className="w-[20px] h-[20px] text-zinc-800 dark:text-zinc-200" strokeWidth={1.8} />
                              <span>Rename</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => togglePin(session.id)}
                              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[14px] font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {isPinned ? (
                                <PinOff className="w-[20px] h-[20px] text-zinc-800 dark:text-zinc-200" strokeWidth={1.8} />
                              ) : (
                                <SidebarPinIcon className="w-[20px] h-[20px] text-zinc-800 dark:text-zinc-200" />
                              )}
                              <span>{isPinned ? 'Unpin' : 'Pin'}</span>
                            </button>

                            <div className="mx-3 my-1 border-t border-zinc-200 dark:border-zinc-700" />

                            <button
                              type="button"
                              onClick={() => handleShare(session.id)}
                              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[14px] font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Upload className="w-[20px] h-[20px] text-zinc-800 dark:text-zinc-200" strokeWidth={1.8} />
                              <span>Share</span>
                            </button>

                            <div className="mx-3 my-1 border-t border-zinc-200 dark:border-zinc-700" />

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(session.id);
                              }}
                              className="w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-[14px] font-medium text-red-500 dark:text-red-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {deletingIds.includes(session.id) ? (
                                <Loader2 className="h-[20px] w-[20px] animate-spin" strokeWidth={1.8} />
                              ) : (
                                <Trash2 className="w-[20px] h-[20px]" strokeWidth={1.8} />
                              )}
                              <span>{deletingIds.includes(session.id) ? 'Deleting…' : 'Delete'}</span>
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>}

      {/* Keep the account/profile section anchored at the bottom when Recents is collapsed. */}
      {recentsCollapsed && <div className="flex-1 min-h-0" aria-hidden="true" />}

      {/* Footer */}
      <div className="mt-auto shrink-0 border-t border-zinc-200/80 p-2 dark:border-zinc-800">
        <AccountMenu
          user={user}
          onProfile={onProfile}
          onSettings={onSettings}
          onLogout={onLogout}
        />
      </div>
    </>
  );
}


// ─── AccountMenu ─────────────────────────────────────────────────────────────
// ChatGPT-style account popover. Upgrade, Personalization and Billing are
// intentionally omitted per the requested settings/account design.
function AccountMenu({
  user,
  onProfile,
  onSettings,
  onLogout,
  compact = false,
}: {
  user: User;
  onProfile?: () => void;
  onSettings?: () => void;
  onLogout: () => void;
  compact?: boolean;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const goProfile = () => {
    setOpen(false);
    if (onProfile) onProfile();
    else navigate('/profile');
  };

  const goSettings = () => {
    setOpen(false);
    if (onSettings) onSettings();
    else navigate('/settings');
  };

  const logout = () => {
    setOpen(false);
    onLogout();
  };

  return (
    <div
      ref={menuRef}
      className={`relative ${compact ? 'flex justify-center' : 'w-full'}`}
    >
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open account menu"
        className={
          compact
            ? "flex h-8 w-8 items-center justify-center rounded-full outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-700"
            : "flex h-9 w-full items-center gap-2 rounded-lg px-1.5 text-left transition-colors hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70"
        }
      >
        <UserAvatar
          name={user.username}
          avatarUrl={user.avatarUrl}
          className={
            compact
              ? "h-6 w-6 text-[9px] shadow-none"
              : "h-6 w-6 shrink-0 text-[10px] font-semibold shadow-none"
          }
        />

        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-200">
                {user.username}
              </span>
            </span>
            <ChevronRight
              className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${
                open ? '-rotate-90' : ''
              }`}
            />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.96,
              y: 8,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 8,
            }}
            transition={{
              duration: 0.14,
              ease: 'easeOut',
            }}
            role="menu"
            className={
              compact
                ? "twinkle-account-menu absolute bottom-0 left-full z-[10000] ml-3 w-[264px] origin-bottom-left overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.16)] dark:border-zinc-700/80 dark:bg-zinc-900"
                : "twinkle-account-menu absolute bottom-[calc(100%+8px)] left-0 z-[10000] w-full min-w-[248px] origin-bottom-left overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.16)] dark:border-zinc-700/80 dark:bg-zinc-900"
            }
          >
            {/* Account header */}
            <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-2">
              <UserAvatar
                name={user.username}
                avatarUrl={user.avatarUrl}
                className="h-9 w-9 shrink-0 text-[13px] font-semibold shadow-none ring-1 ring-black/5 dark:ring-white/10"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium leading-5 text-zinc-900 dark:text-zinc-50">
                  {user.name || user.username}
                </p>
                {user.email && (
                  <p className="truncate text-[12px] leading-4 text-zinc-500 dark:text-zinc-400">
                    {user.email}
                  </p>
                )}
              </div>
            </div>

            <div className="mx-1 border-t border-zinc-200/80 dark:border-zinc-700/70" />

            <div className="mt-1.5 flex flex-col gap-0.5">
              <button
                type="button"
                role="menuitem"
                onClick={goProfile}
                className="group/item flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] font-normal text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
              >
                <UserCircle2 className="h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover/item:text-zinc-800 dark:text-zinc-400 dark:group-hover/item:text-zinc-100" strokeWidth={1.8} />
                <span className="flex-1">Profile</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-hover/item:translate-x-0.5" />
              </button>

              <button
                type="button"
                role="menuitem"
                onClick={goSettings}
                className="group/item flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] font-normal text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
              >
                <Settings2 className="h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover/item:text-zinc-800 dark:text-zinc-400 dark:group-hover/item:text-zinc-100" strokeWidth={1.8} />
                <span className="flex-1">Settings</span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform group-hover/item:translate-x-0.5" />
              </button>
            </div>

            <div className="mx-1 my-1.5 border-t border-zinc-200/80 dark:border-zinc-700/70" />

            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="group/item flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] font-normal text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
            >
              <LogOut className="h-4 w-4 shrink-0 text-zinc-500 transition-colors group-hover/item:text-zinc-800 dark:text-zinc-400 dark:group-hover/item:text-zinc-100" strokeWidth={1.8} />
              <span className="flex-1">Log out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ─── ChatSearchModal ───────────────────────────────────────────────────────────
function ChatSearchModal({
  open,
  sessions,
  onClose,
  onSelectSession,
}: {
  open: boolean;
  sessions: Session[];
  onClose: () => void;
  onSelectSession: (id: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults(sessions);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open, sessions]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const requestId = ++requestRef.current;

    if (!q) {
      setLoading(false);
      setResults(sessions);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await chatApi.searchSessions(q);
        if (requestId !== requestRef.current) return;
        const raw = Array.isArray((response as any)?.sessions)
          ? (response as any).sessions
          : [];
        const normalized = raw
          .map((item: any) => ({
            ...item,
            id: Number(item.id ?? item.sessionId ?? item.session_id),
            sessionName: String(item.sessionName ?? item.name ?? item.title ?? 'New Chat'),
          }))
          .filter((item: any) => Number.isFinite(item.id));
        setResults(normalized);
      } catch {
        if (requestId !== requestRef.current) return;
        const lower = q.toLowerCase();
        setResults(
          sessions.filter(session =>
            String(session.sessionName ?? '').toLowerCase().includes(lower)
          )
        );
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, 220);

    return () => window.clearTimeout(timer);
  }, [open, query, sessions]);

  if (!open) return null;

  const recentChats = [...results]
    .sort((a: any, b: any) => {
      const aDate = new Date((a as any).updatedAt ?? (a as any).updated_at ?? (a as any).createdAt ?? (a as any).created_at ?? 0).getTime();
      const bDate = new Date((b as any).updatedAt ?? (b as any).updated_at ?? (b as any).createdAt ?? (b as any).created_at ?? 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 20);

  return (
    <div className="fixed inset-0 z-[10000] flex items-start justify-center bg-black/20 px-4 pt-[12vh] backdrop-blur-[2px] sm:px-6">
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Search chats"
        initial={{ opacity: 0, scale: 0.985, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.985, y: -6 }}
        className="relative z-10 flex h-[min(620px,76vh)] w-full max-w-[720px] flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.16)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
      >
        <div className="flex shrink-0 items-center gap-3 px-5 pb-1 pt-5 sm:px-7">
          <SearchBar
            ref={inputRef}
            value={query}
            onChange={setQuery}
            placeholder="Search..."
            type="search"
            size="lg"
            className="flex-1"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-[20px] w-[20px]" strokeWidth={1.8} />
          </button>
        </div>

        <div className="shrink-0 px-7 pb-3 pt-6 text-[17px] font-medium text-zinc-500 dark:text-zinc-400">
          {query.trim() ? 'Search results' : 'Recent chats'}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-7 sm:px-7">
          {loading ? (
            <div className="flex items-center gap-3 px-3 py-5 text-[15px] text-zinc-500">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200" />
              Searching chats...
            </div>
          ) : recentChats.length === 0 ? (
            <div className="px-3 py-5 text-[15px] text-zinc-500 dark:text-zinc-400">
              {query.trim() ? 'No matching chats' : 'No recent chats'}
            </div>
          ) : (
            <div className="space-y-1">
              {recentChats.map(session => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => {
                    onSelectSession(session.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-5 rounded-xl px-3 py-3 text-left transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <MessageCircle className="h-[22px] w-[22px] shrink-0 text-zinc-800 dark:text-zinc-200" strokeWidth={1.8} />
                  <span data-twinkle-user-content className="min-w-0 flex-1 truncate text-[17px] font-normal text-zinc-900 dark:text-zinc-100">
                    {session.sessionName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Sidebar export ──────────────────────────────────────────────────────
export default function Sidebar({
  user,
  sessions,
  currentSessionId,
  respondingSessionId,
  typingSessionId,
  onTypingDone,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onShareSession,
  onClearAll,
  onLogout,
  onProfile,
  onSettings,
  onDesktopStateChange,
  onDesktopWidthChange,
  onClose = () => {},
  mobileOpen = false,
  onMobileClose = () => {},
}: Props) {
  // Start collapsed on every fresh load so the chat interface is shown
  // immediately. The user can expand it with the sidebar icon.
  const [desktopCollapsed, setDesktopCollapsed] = useState(true);
  const [desktopWidth, setDesktopWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('Twinkle_sidebar_width');
      const stored = raw === null ? NaN : Number(raw);
      return Number.isFinite(stored) ? Math.min(440, Math.max(260, stored)) : 288;
    } catch {
      return 288;
    }
  });
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [recentsPopupOpen, setRecentsPopupOpen] = useState(false);
  const [pinnedPopupOpen, setPinnedPopupOpen] = useState(false);
  const [recentsAnchor, setRecentsAnchor] = useState<CollapsedPopupAnchor | null>(null);
  const [pinnedAnchor, setPinnedAnchor] = useState<CollapsedPopupAnchor | null>(null);
  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);
  const resizingRef = useRef(false);

  useEffect(() => {
    const syncPinned = () => setPinnedIds(loadPinnedIds());

    window.addEventListener(PINNED_CHANGED_EVENT, syncPinned);
    window.addEventListener('storage', syncPinned);

    return () => {
      window.removeEventListener(PINNED_CHANGED_EVENT, syncPinned);
      window.removeEventListener('storage', syncPinned);
    };
  }, []);

  useEffect(() => {
    onDesktopWidthChange?.(desktopWidth);
  }, [desktopWidth, onDesktopWidthChange]);


  useEffect(() => {
    const previousWidth = { current: window.innerWidth };

    const handleResize = () => {
      const currentWidth = window.innerWidth;

      if (currentWidth <= 1200 && !desktopCollapsed) {
        setDesktopCollapsed(true);
        setRecentsPopupOpen(false);
        setPinnedPopupOpen(false);
        setRecentsAnchor(null);
        setPinnedAnchor(null);
        onDesktopStateChange?.(false);
      }

      previousWidth.current = currentWidth;
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [desktopCollapsed, onDesktopStateChange]);


  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingRef.current = true;
    const startX = event.clientX;
    const startWidth = desktopWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!resizingRef.current) return;
      const nextWidth = Math.min(520, Math.max(260, startWidth + (moveEvent.clientX - startX)));
      setDesktopWidth(nextWidth);
      localStorage.setItem('Twinkle_sidebar_width', String(Math.round(nextWidth)));
    };

    const handlePointerUp = () => {
      resizingRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [desktopWidth]);
  useEffect(() => { onDesktopStateChange?.(false); }, [onDesktopStateChange]);

  const expandDesktop = useCallback(() => {
    setRecentsPopupOpen(false);
    setPinnedPopupOpen(false);
    setRecentsAnchor(null);
    setPinnedAnchor(null);
    setDesktopCollapsed(false);
    onDesktopStateChange?.(true);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
  }, [onDesktopStateChange]);

  const collapseDesktop = useCallback(() => {
    setRecentsPopupOpen(false);
    setPinnedPopupOpen(false);
    setRecentsAnchor(null);
    setPinnedAnchor(null);
    setDesktopCollapsed(true);
    onDesktopStateChange?.(false);
    onClose();
  }, [onClose, onDesktopStateChange]);

  const toggleDesktop = useCallback(() => {
    if (desktopCollapsed) expandDesktop();
    else collapseDesktop();
  }, [desktopCollapsed, expandDesktop, collapseDesktop]);

  const handleProfile = useCallback(() => {
    if (onProfile) {
      onProfile();
      return;
    }
    window.location.assign('/profile');
  }, [onProfile]);

  const handleSettings = useCallback(() => {
    if (onSettings) {
      onSettings();
      return;
    }
    window.location.assign('/settings');
  }, [onSettings]);

  const openSearch = useCallback(() => {
    setSearchModalOpen(true);
    setRecentsPopupOpen(false);
    setPinnedPopupOpen(false);
    setDesktopCollapsed(true);
    onDesktopStateChange?.(false);
    onMobileClose?.();
    onClose();
  }, [onClose, onDesktopStateChange, onMobileClose]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        toggleDesktop();
        return;
      }

      if (modifier && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [toggleDesktop, openSearch]);

  const listProps = {
    user,
    sessions,
    currentSessionId,
    respondingSessionId,
    typingSessionId,
    onTypingDone,
    onSelectSession,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    onShareSession,
    onClearAll,
    onLogout,
      onProfile: handleProfile,
    onSettings: handleSettings,
  };

  return (
    <>
      <AnimatePresence>
        {searchModalOpen && (
          <ChatSearchModal
            open={searchModalOpen}
            sessions={sessions}
            onClose={() => setSearchModalOpen(false)}
            onSelectSession={id => {
              onSelectSession(id);
              onClose();
            }}
          />
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════
          MOBILE / TABLET DRAWER
          Keep the drawer mounted so the session list is never lost when
          opening/closing it. The drawer is hidden from pointer interaction
          while closed, but its SessionList remains synchronized with the
          parent `sessions` prop.
      ═══════════════════════════════════════════════════ */}
      <div
        className={`lg:hidden fixed inset-0 z-[9998] transition-opacity duration-200 ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onMobileClose}
        />

        <aside
          className={`twinkle-sidebar absolute inset-y-0 left-0 z-[9999] w-[min(18rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-[100dvh] overflow-hidden shadow-none transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-7 h-7 bg-transparent rounded-lg flex items-center justify-center p-1 shrink-0">
                <StormLogo className="w-full h-full text-zinc-900 dark:text-white" />
              </div>
              <h2 className="font-serif text-[22px] font-medium leading-none tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">Twinkle</h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <motion.button
                type="button"
                onClick={openSearch}
                aria-label="Search chats"
                title="Search chats"
                className="group/search flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-none"
              >
                <Search className="twinkle-search-icon h-[17px] w-[17px]" strokeWidth={1.8} />
              </motion.button>

              <div className="relative group/close">
                <motion.button
                  type="button"
                  onClick={onMobileClose}
                  aria-label="Close sidebar"
                  title="Close sidebar"
                  className="flex h-9 w-9 items-center justify-center rounded-none
                    bg-transparent border-0 shadow-none
                    text-zinc-500 dark:text-zinc-400
                    hover:text-zinc-700 dark:hover:text-zinc-200
                    transition-colors duration-200"
                >
                  <svg
                    width="23"
                    height="20"
                    viewBox="0 0 24 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect
                      x="2"
                      y="2"
                      width="20"
                      height="16"
                      rx="4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                    <path
                      d="M8.5 2.5V17.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </motion.button>
                <div className="pointer-events-none absolute right-0 top-full mt-2 z-[300] whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-bold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/close:opacity-100">
                  Close Sidebar
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <SessionList
              {...listProps}
              onClose={onMobileClose}
            />
          </div>
        </aside>
      </div>

      {/* ═══════════════════════════════════════════════════
          DESKTOP COLLAPSED ICON RAIL  (lg+ only)
      ═══════════════════════════════════════════════════ */}
      {desktopCollapsed && (
        <aside className="twinkle-sidebar group/collapsed hidden lg:flex fixed inset-y-0 left-0 z-[2147483645] w-[52px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col items-center pt-4 pb-4 shadow-none">
          {/* Brand stays visible. Only the sidebar toggle replaces it while hovering. */}
          <IconTooltip label="Toggle sidebar" shortcut="Ctrl+Shift+S">
            <div className="relative flex h-10 w-10 items-center justify-center">
              <button
                type="button"
                onClick={toggleDesktop}
                aria-label="Open sidebar"
                className="group/sidebar-toggle relative flex h-8 w-8 items-center justify-center rounded-lg text-zinc-900 dark:text-white"
              >
              <StormLogo className="h-[24px] w-[24px] text-zinc-900 dark:text-white transition-opacity duration-500 group-hover/collapsed:opacity-0" />
              <svg
                width="23"
                height="21"
                viewBox="0 0 24 20"
                fill="none"
                aria-hidden="true"
                className="pointer-events-none absolute opacity-0 text-zinc-900 transition-opacity duration-500 group-hover/collapsed:opacity-100 dark:text-white"
              >
                <rect x="2" y="2" width="20" height="16" rx="4" stroke="currentColor" strokeWidth="2" />
                <path d="M8.5 2.5V17.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </IconTooltip>

          {/* Reference-style icon rail: identical button and icon sizing. */}
          <div className="mt-4 flex w-full flex-col items-center gap-0.5">
            <IconTooltip label="New Chat" shortcut="Ctrl+Shift+O">
              <button
                onClick={onNewSession}
                aria-label="New Chat"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <SquarePen className="h-[17px] w-[17px]" strokeWidth={1.8} />
              </button>
            </IconTooltip>

            <IconTooltip label="Search" shortcut="Ctrl+K">
              <button
                onClick={openSearch}
                aria-label="Search"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Search className="h-[17px] w-[17px]" strokeWidth={1.9} />
              </button>
            </IconTooltip>

            <div className="relative group/pinned flex w-full items-center justify-center">
              <button
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPinnedAnchor({ top: rect.top, right: rect.right });
                  setPinnedPopupOpen(current => !current);
                  setRecentsPopupOpen(false);
                                setRecentsAnchor(null);
                              }}
                aria-label="Pinned"
                aria-expanded={pinnedPopupOpen}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 transition-none ${pinnedPopupOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              >
                <SidebarPinIcon className="h-[17px] w-[17px]" />
              </button>
              <div className="absolute left-full ml-2.5 flex items-center px-3.5 py-2 bg-[#111111] text-white text-[14px] font-bold rounded-full whitespace-nowrap pointer-events-none z-[300] shadow-[0_12px_32px_rgba(0,0,0,0.18)] opacity-0 group-hover/pinned:opacity-100 transition-opacity duration-150">
                <span>Pinned</span>
              </div>
            </div>

            <IconTooltip label="Recents">
              <button
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setRecentsAnchor({ top: rect.top, right: rect.right });
                  setRecentsPopupOpen(current => !current);
                  setPinnedPopupOpen(false);
                                setPinnedAnchor(null);
                              }}
                aria-label="Recents"
                aria-expanded={recentsPopupOpen}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 transition-none ${recentsPopupOpen ? 'bg-zinc-100 dark:bg-zinc-800' : ''}`}
              >
                <MessageCircle className="h-[17px] w-[17px]" strokeWidth={1.8} />
              </button>
            </IconTooltip>


          </div>

          <div className="flex-1" />

          <AnimatePresence>
            {pinnedPopupOpen && (
              <CollapsedPinnedPopup
                sessions={sessions}
                currentSessionId={currentSessionId}
                pinnedIds={pinnedIds}
                onSelectSession={onSelectSession}
                onClose={() => { setPinnedPopupOpen(false); setPinnedAnchor(null); }}
                anchor={pinnedAnchor}
              />
            )}
            {recentsPopupOpen && (
              <CollapsedRecentsPopup
                sessions={sessions}
                currentSessionId={currentSessionId}
                respondingSessionId={respondingSessionId}
                onSelectSession={onSelectSession}
                onClose={() => { setRecentsPopupOpen(false); setRecentsAnchor(null); }}
                anchor={recentsAnchor}
              />
            )}
          </AnimatePresence>

          <AccountMenu
            user={user}
            onProfile={onProfile}
            onSettings={onSettings}
            onLogout={onLogout}
            compact
          />
        </aside>
      )}

      {/* ═══════════════════════════════════════════════════
          DESKTOP EXPANDED FULL SIDEBAR  (lg+ only)
      ═══════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {!desktopCollapsed && (
          <>
            <aside
              className="twinkle-sidebar hidden lg:flex fixed inset-y-0 left-0 z-[2147483647] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col h-full shadow-none"
              style={{ width: `${desktopWidth}px` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-7 h-7 bg-transparent rounded-lg flex items-center justify-center p-1 shrink-0">
                    <StormLogo className="w-full h-full text-zinc-900 dark:text-white" />
                  </div>
                  <h2 className="font-serif text-[22px] font-medium leading-none tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">Twinkle</h2>
                </div>

                <div className="flex items-center gap-0.5 shrink-0">
                  <IconTooltip label="Search" shortcut="Ctrl+K">
                    <motion.button
                      type="button"
                      onClick={openSearch}
                      aria-label="Search chats"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
                    >
                      <Search className="twinkle-search-icon h-[17px] w-[17px]" strokeWidth={1.8} />
                    </motion.button>
                  </IconTooltip>

                  <IconTooltip label="Toggle sidebar" shortcut="Ctrl+Shift+S">
                    <motion.button
                      type="button"
                      onClick={collapseDesktop}
                      aria-label="Close sidebar"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-none bg-transparent border-0 shadow-none text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors duration-200"
                    >
                      <svg width="23" height="20" viewBox="0 0 24 20" fill="none" aria-hidden="true">
                        <rect x="2" y="2" width="20" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
                        <path d="M8.5 2.5V17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                    </motion.button>
                  </IconTooltip>
                </div>
              </div>

              {/* Desktop: keep the sidebar open after selecting a chat, starting a
                  new chat, renaming, etc. It only collapses via the toggle button. */}
              <SessionList
                {...listProps}
                onClose={() => {}}
              />

              {/* Drag handle: adjust desktop sidebar width */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                title="Drag to resize sidebar"
                onPointerDown={handleResizeStart}
                className="absolute right-[-3px] top-0 h-full w-[6px] cursor-col-resize touch-none group/resize"
              >
                <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover/resize:bg-zinc-300 dark:group-hover/resize:bg-zinc-700" />
              </div>
            </aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
