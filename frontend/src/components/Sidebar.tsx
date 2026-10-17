import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Session, User } from '../types';
import {
  LogOut, Trash2, X, Search, Plus, MoreVertical, PinOff, Loader2,
  MessageCircle, Pencil, Upload, Eye, EyeOff,
  Settings2, UserCircle2, ChevronDown, ChevronRight, SlidersHorizontal, ArrowUpDown, Check,
  Globe, Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import UserAvatar from './UserAvatar';
import { chatApi } from '../lib/api';
import SearchBar from './SearchBar';
import LanguageModal from './LanguageModal';
import { useLanguage, type AppLanguage } from '../lib/i18n';
import { onShortcut, takePendingShortcut, type ShortcutAction } from '../lib/shortcuts';
import { APP_LANGUAGES } from '../pages/Settings';

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
const UNREAD_KEY = 'Twinkle_unread_sessions';
const SIDEBAR_SEEN_KEY = 'Twinkle_sidebar_seen';
const PINNED_CHANGED_EVENT = 'twinkle:pinned-sessions-changed';
const UNREAD_CHANGED_EVENT = 'twinkle:unread-sessions-changed';

const loadIdList = (key: string): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
};
const loadPinnedIds = (): number[] => loadIdList(PINNED_KEY);
const loadUnreadIds = (): number[] => loadIdList(UNREAD_KEY);

const savePinnedIds = (ids: number[]) => {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(PINNED_CHANGED_EVENT));
};
const saveUnreadIds = (ids: number[]) => {
  try { localStorage.setItem(UNREAD_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
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

// Highest z-index in the app. Tooltips and floating menus are portalled to
// <body> with this value so no scroll container or stacking context can hide them.
const TOP_LAYER = 2147483647;

// Shared surface for every floating menu (chat options, sort, account).
const MENU_SURFACE =
  'rounded-xl border border-zinc-300/70 bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)]';

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
      className={`object-contain dark:invert ${className}`}
    />
  );
}


// ─── Sidebar toggle icon (panel with a left rail) ─────────────────────────────
function SidebarToggleIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="20" height="17" viewBox="0 0 24 20" fill="none" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="20" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 2.5V17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ─── Tip ──────────────────────────────────────────────────────────────────────
// Tooltip rendered through a portal on <body> with position:fixed. Because it
// lives outside the sidebar, the scrolling chat list can never clip it and no
// sibling (e.g. the "Recents" header) can paint over it.
type TipSide = 'top' | 'bottom' | 'right';

function Tip({
  label,
  shortcut,
  side = 'top',
  children,
  className = '',
}: {
  label: string;
  shortcut?: string;
  side?: TipSide;
  children: ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number; placement: TipSide } | null>(null);

  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    if (side === 'right') {
      setPos({ x: r.right + 8, y: r.top + r.height / 2, placement: 'right' });
      return;
    }
    const x = Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90);
    const preferTop = side === 'top';
    const placeBelow = preferTop ? r.top < 56 : r.bottom <= window.innerHeight - 56;
    setPos({
      x,
      y: placeBelow ? r.bottom + 8 : r.top - 8,
      placement: placeBelow ? 'bottom' : 'top',
    });
  };
  const hide = () => setPos(null);

  const transform =
    pos?.placement === 'right' ? 'translateY(-50%)'
    : pos?.placement === 'bottom' ? 'translateX(-50%)'
    : 'translate(-50%, -100%)';

  return (
    <span
      className={`inline-flex ${className}`}
      onMouseEnter={event => show(event.currentTarget)}
      onMouseLeave={hide}
      onMouseDown={hide}
      onFocus={event => {
        if ((event.target as HTMLElement).matches?.(':focus-visible')) show(event.currentTarget);
      }}
      onBlur={hide}
    >
      {children}
      {pos && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed flex items-center gap-2 whitespace-nowrap rounded-full bg-[#111111] px-3.5 py-2 text-[14px] font-bold text-white shadow-[0_12px_32px_rgba(0,0,0,0.18)] [font-family:inherit]"
          style={{ left: pos.x, top: pos.y, transform, zIndex: TOP_LAYER }}
        >
          <span>{label}</span>
          {shortcut && (
            <kbd className="rounded-full bg-zinc-600 px-2.5 py-0.5 text-[13px] font-bold leading-5 text-white shadow-inner [font-family:inherit]">
              {shortcut}
            </kbd>
          )}
        </div>,
        document.body
      )}
    </span>
  );
}

// ─── Menu primitives (shared by every dropdown) ───────────────────────────────
function MenuItem({
  icon,
  label,
  shortcut,
  danger = false,
  onClick,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] leading-none transition-colors focus-visible:outline-none ${
        danger
          ? 'text-[#B53333] hover:bg-[#B53333]/10 focus-visible:bg-[#B53333]/10 dark:text-[#F2877E] dark:hover:bg-[#F2877E]/10'
          : 'text-zinc-800 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800'
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {shortcut && (
        <span className="ml-2 shrink-0 text-[12px] font-normal text-zinc-400 dark:text-zinc-500">{shortcut}</span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div role="separator" className="mx-3 my-1 h-px bg-zinc-200 dark:bg-zinc-700/70" />;
}

// ─── ChatContextMenu (the "⋮" dropdown on a chat row) ─────────────────────────
// Portalled to <body> so the scrolling chat list never clips it. Supports the
// P / U / R / D keyboard shortcuts shown on the right of each item.
type MenuAnchor = { top: number; bottom: number; right: number };

function ChatContextMenu({
  anchor,
  isPinned,
  isUnread,
  onPin,
  onToggleUnread,
  onRename,
  onShare,
  onDelete,
  onClose,
}: {
  anchor: MenuAnchor;
  isPinned: boolean;
  isUnread: boolean;
  onPin: () => void;
  onToggleUnread: () => void;
  onRename: () => void;
  onShare: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const margin = 8;
    const left = Math.min(Math.max(anchor.right + 6 - width, margin), window.innerWidth - width - margin);
    const fitsBelow = anchor.bottom + 4 + height + margin <= window.innerHeight;
    const top = fitsBelow ? anchor.bottom + 4 : Math.max(margin, anchor.top - 4 - height);
    setPos({ top, left, origin: fitsBelow ? 'top right' : 'bottom right' });
  }, [anchor]);

  // Keep the latest handlers without re-subscribing the listeners on every render.
  const actionsRef = useRef({ onPin, onToggleUnread, onRename, onDelete, onClose });
  actionsRef.current = { onPin, onToggleUnread, onRename, onDelete, onClose };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (ref.current?.contains(target as Node)) return;
      // The "⋮" button toggles the menu itself.
      if (target?.closest?.('[data-chat-menu-trigger]')) return;
      actionsRef.current.onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        actionsRef.current.onClose();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      const actions = actionsRef.current;
      if (key === 'p') { event.preventDefault(); actions.onPin(); }
      else if (key === 'u') { event.preventDefault(); actions.onToggleUnread(); }
      else if (key === 'r') { event.preventDefault(); actions.onRename(); }
      else if (key === 'd') { event.preventDefault(); actions.onDelete(); }
    };
    const dismiss = () => actionsRef.current.onClose();

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, []);

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label="Chat options"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className={`fixed w-48 ${MENU_SURFACE}`}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        transformOrigin: pos?.origin ?? 'top right',
        visibility: pos ? 'visible' : 'hidden',
        zIndex: TOP_LAYER,
      }}
      onClick={event => event.stopPropagation()}
    >
      <MenuItem
        icon={isPinned ? <PinOff className="h-4 w-4" strokeWidth={1.7} /> : <SidebarPinIcon className="h-4 w-4" />}
        label={isPinned ? 'Unpin' : 'Pin'}
        shortcut="P"
        onClick={onPin}
      />
      <MenuItem
        icon={isUnread ? <Eye className="h-4 w-4" strokeWidth={1.7} /> : <EyeOff className="h-4 w-4" strokeWidth={1.7} />}
        label={isUnread ? 'Mark as read' : 'Mark as unread'}
        shortcut="U"
        onClick={onToggleUnread}
      />
      <MenuItem icon={<Pencil className="h-4 w-4" strokeWidth={1.7} />} label="Rename" shortcut="R" onClick={onRename} />
      <MenuItem icon={<Upload className="h-4 w-4" strokeWidth={1.7} />} label="Share" onClick={onShare} />
      <MenuDivider />
      <MenuItem
        icon={<Trash2 className="h-4 w-4" strokeWidth={1.7} />}
        label="Delete"
        shortcut="D"
        danger
        onClick={onDelete}
      />
    </motion.div>,
    document.body
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


// ─── SidebarHeader ────────────────────────────────────────────────────────────
// Panel toggle on the left, wordmark next to it. The toggle sits at exactly the
// same spot as the floating "open sidebar" button shown when the sidebar is closed.
function SidebarHeader({ onToggle, label }: { onToggle: () => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-[18px]">
      <Tip label={label} shortcut="Ctrl+Shift+S" side="right">
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          <SidebarToggleIcon />
        </button>
      </Tip>
      <h2 className="font-serif text-[22px] font-medium leading-none tracking-[-0.01em] text-zinc-900 dark:text-zinc-50">
        Twinkle
      </h2>
    </div>
  );
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
  onOpenSearch: () => void;
}

const NAV_ROW =
  'group/nav flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] text-zinc-800 transition-colors hover:bg-zinc-200/60 focus-visible:bg-zinc-200/60 focus-visible:outline-none dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800';

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
  onOpenSearch,
}: SessionListProps) {
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  const [menu, setMenu] = useState<{ id: number; anchor: MenuAnchor } | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);
  const [unreadIds, setUnreadIds] = useState<number[]>(loadUnreadIds);
  // Keep date sorting as the default, with an explicit menu for sort mode.
  const [sortMode, setSortMode] = useState<'date' | 'alphabetical'>('date');
  const [dateSortOrder, setDateSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  // The mobile drawer and the desktop sidebar each mount a SessionList, so keep
  // pinned / unread state in sync between them (and across browser tabs).
  useEffect(() => {
    const syncPinned = () => setPinnedIds(loadPinnedIds());
    const syncUnread = () => setUnreadIds(loadUnreadIds());
    const onStorage = (event: StorageEvent) => {
      if (event.key === PINNED_KEY) syncPinned();
      if (event.key === UNREAD_KEY) syncUnread();
    };
    window.addEventListener(PINNED_CHANGED_EVENT, syncPinned);
    window.addEventListener(UNREAD_CHANGED_EVENT, syncUnread);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PINNED_CHANGED_EVENT, syncPinned);
      window.removeEventListener(UNREAD_CHANGED_EVENT, syncUnread);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (!optionsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) setOptionsOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOptionsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [optionsOpen]);

  useEffect(() => {
    if (renamingId !== null) {
      const timer = window.setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 50);
      return () => window.clearTimeout(timer);
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

  const menuSession = menu ? displaySessions.find(s => s.id === menu.id) ?? null : null;

  const togglePin = (id: number) => {
    const next = pinnedIds.includes(id) ? pinnedIds.filter(p => p !== id) : [...pinnedIds, id];
    setPinnedIds(next);
    savePinnedIds(next);
    setMenu(null);
  };

  const setUnread = (id: number, unread: boolean) => {
    if (unread === unreadIds.includes(id)) return;
    const next = unread ? [...unreadIds, id] : unreadIds.filter(u => u !== id);
    setUnreadIds(next);
    saveUnreadIds(next);
  };

  const startRename = (session: Session) => {
    setRenamingId(session.id);
    setRenameValue(session.sessionName);
    setMenu(null);
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
    // Close the menu (and the mobile drawer) right away. The parent shows the
    // confirmation dialog and removes the chat once the user confirms, so no
    // spinner is started here.
    setMenu(null);
    onClose();
    onDeleteSession(id);
    const nextPinned = pinnedIds.filter(p => p !== id);
    setPinnedIds(nextPinned);
    savePinnedIds(nextPinned);
    if (unreadIds.includes(id)) {
      const nextUnread = unreadIds.filter(u => u !== id);
      setUnreadIds(nextUnread);
      saveUnreadIds(nextUnread);
    }
  };

  const handleShare = (id: number) => {
    setMenu(null);
    onClose();
    onShareSession(id);
  };

  // Select the session FIRST (synchronously), then close the drawer. Closing
  // first raced against the mobile drawer unmounting this list.
  const handleSelectSession = (id: number) => {
    if (renamingId !== null) return;
    setUnread(id, false);
    onSelectSession(id);
    onClose();
  };

  return (
    <>
      {/* Navigation */}
      <nav className="shrink-0 px-2 pt-2" aria-label="Primary">
        <button
          type="button"
          onClick={() => { onNewSession(); onClose(); }}
          aria-label="New chat"
          className={NAV_ROW}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100" aria-hidden="true">
            <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
          <span className="flex-1">New chat</span>
        </button>

        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search chats"
          className={NAV_ROW}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
            <Search className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </span>
          <span className="flex-1">Search</span>
          <span className="text-[12px] text-zinc-400 opacity-0 transition-opacity group-hover/nav:opacity-100 dark:text-zinc-500">Ctrl+K</span>
        </button>
      </nav>

      {/* Recents header */}
      <div className="group/recents flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-4">
        <button
          type="button"
          onClick={() => setRecentsCollapsed(collapsed => !collapsed)}
          aria-label={recentsCollapsed ? 'Expand Recents' : 'Collapse Recents'}
          aria-expanded={!recentsCollapsed}
          className="-ml-1 flex items-center gap-1 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-zinc-200/60 dark:hover:bg-zinc-800"
        >
          <span className="text-[13px] font-normal text-zinc-500 dark:text-zinc-400">Recents</span>
          <ChevronDown
            className={`h-3 w-3 text-zinc-400 opacity-0 transition-all group-hover/recents:opacity-100 ${recentsCollapsed ? '-rotate-90 opacity-100' : ''}`}
          />
        </button>

        {sessions.length > 0 && (
          <div ref={optionsRef} className="relative">
            <Tip label="Sort & manage" side="top">
              <button
                type="button"
                onClick={() => setOptionsOpen(open => !open)}
                aria-label="Sort and manage chats"
                aria-haspopup="menu"
                aria-expanded={optionsOpen}
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-zinc-200/60 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${
                  optionsOpen ? 'bg-zinc-200/60 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={1.7} />
              </button>
            </Tip>

            <AnimatePresence>
              {optionsOpen && (
                <motion.div
                  role="menu"
                  aria-label="Sort and manage chats"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className={`absolute right-0 top-full z-50 mt-1 w-56 origin-top-right ${MENU_SURFACE}`}
                >
                  <div className="px-2.5 pb-1 pt-1.5 text-[12px] text-zinc-500 dark:text-zinc-400">Sort by</div>
                  <MenuItem
                    icon={sortMode === 'date' ? <Check className="h-4 w-4" strokeWidth={2} /> : null}
                    label="Date"
                    onClick={() => { setSortMode('date'); setOptionsOpen(false); }}
                  />
                  <MenuItem
                    icon={sortMode === 'alphabetical' ? <Check className="h-4 w-4" strokeWidth={2} /> : null}
                    label="Alphabetical (A–Z)"
                    onClick={() => { setSortMode('alphabetical'); setOptionsOpen(false); }}
                  />
                  {sortMode === 'date' && (
                    <MenuItem
                      icon={<ArrowUpDown className="h-4 w-4" strokeWidth={1.7} />}
                      label={dateSortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                      onClick={() => { setDateSortOrder(current => current === 'newest' ? 'oldest' : 'newest'); setOptionsOpen(false); }}
                    />
                  )}
                  <MenuDivider />
                  <MenuItem
                    icon={<Trash2 className="h-4 w-4" strokeWidth={1.7} />}
                    label="Clear all chats"
                    danger
                    onClick={() => { setOptionsOpen(false); onClose(); onClearAll(); }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Chat list */}
      {!recentsCollapsed && (
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          {sortedSessions.length === 0 ? (
            <div className="mx-1 mt-2 rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center dark:border-zinc-700">
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">No chats yet</p>
              <p className="mt-0.5 text-[12px] text-zinc-400 dark:text-zinc-500">Start a new conversation</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.label} className="mb-1">
                <div className="px-2.5 pb-1 pt-3 text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                  {group.label}
                </div>

                <div className="space-y-px">
                  {group.items.map(session => {
                    const isActive = currentSessionId === session.id;
                    const isPinned = pinnedIds.includes(session.id);
                    const isUnread = unreadIds.includes(session.id);
                    const isMenuOpen = menu?.id === session.id;
                    const isRenaming = renamingId === session.id;
                    const isResponding = respondingSessionId === session.id;

                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`group/item flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 transition-colors ${
                          isActive || isMenuOpen
                            ? 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                            : 'text-zinc-700 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100'
                        }`}
                        onClick={() => handleSelectSession(session.id)}
                      >
                        {isPinned && (
                          <SidebarPinIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        )}
                        {isUnread && !isRenaming && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-800 dark:bg-zinc-100" aria-label="Unread" />
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
                            className="min-w-0 flex-1 rounded-md border border-zinc-400 bg-white px-2 py-0.5 text-[13px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:bg-zinc-900 dark:text-zinc-200"
                          />
                        ) : (
                          <span
                            data-twinkle-user-content
                            className={`min-w-0 flex-1 truncate text-[14px] leading-snug ${isUnread ? 'font-medium' : 'font-normal'}`}
                          >
                            {typingSessionId === session.id
                              ? <TypewriterText text={session.sessionName} onDone={onTypingDone} />
                              : session.sessionName}
                          </span>
                        )}

                        {!isRenaming && isResponding && (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-500" aria-label="Chat responding" />
                        )}

                        {!isRenaming && (
                          <div
                            className={`shrink-0 items-center gap-0.5 group-focus-within/item:flex group-hover/item:flex [@media(hover:none)]:flex ${
                              isMenuOpen ? 'flex' : 'hidden'
                            }`}
                          >
                            <button
                              type="button"
                              data-chat-menu-trigger
                              onClick={e => {
                                e.stopPropagation();
                                if (isMenuOpen) {
                                  setMenu(null);
                                  return;
                                }
                                const rect = e.currentTarget.getBoundingClientRect();
                                setMenu({ id: session.id, anchor: { top: rect.top, bottom: rect.bottom, right: rect.right } });
                              }}
                              aria-label="Chat options"
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                                isMenuOpen
                                  ? 'bg-zinc-300/60 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100'
                                  : 'text-zinc-500 hover:bg-zinc-300/50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700/70 dark:hover:text-zinc-100'
                              }`}
                            >
                              <MoreVertical className="h-4 w-4" strokeWidth={1.8} />
                            </button>

                            {/* Portalled tooltip: always paints above the Recents header and the list */}
                            <Tip label={isPinned ? 'Unpin chat' : 'Pin chat'} side="top">
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  togglePin(session.id);
                                }}
                                aria-label={isPinned ? 'Unpin chat' : 'Pin chat'}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-300/50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700/70 dark:hover:text-zinc-100"
                              >
                                {isPinned ? (
                                  <PinOff className="h-4 w-4" strokeWidth={1.8} />
                                ) : (
                                  <SidebarPinIcon className="h-4 w-4" />
                                )}
                              </button>
                            </Tip>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Keep the account section anchored at the bottom when Recents is collapsed. */}
      {recentsCollapsed && <div className="min-h-0 flex-1" aria-hidden="true" />}

      {/* Chat options dropdown (single instance, portalled) */}
      <AnimatePresence>
        {menu && menuSession && (
          <ChatContextMenu
            key={menu.id}
            anchor={menu.anchor}
            isPinned={pinnedIds.includes(menuSession.id)}
            isUnread={unreadIds.includes(menuSession.id)}
            onPin={() => togglePin(menuSession.id)}
            onToggleUnread={() => {
              setUnread(menuSession.id, !unreadIds.includes(menuSession.id));
              setMenu(null);
            }}
            onRename={() => startRename(menuSession)}
            onShare={() => handleShare(menuSession.id)}
            onDelete={() => handleDelete(menuSession.id)}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>

      {/* Footer */}
      <div className="mt-auto shrink-0 border-t border-zinc-200/80 p-2 dark:border-zinc-800">
        <AccountMenu
          user={user}
          onSettings={onSettings}
          onLogout={onLogout}
        />
      </div>
    </>
  );
}


// ─── AccountMenu ─────────────────────────────────────────────────────────────
// Footer account row. Clicking it opens a popup that spans the sidebar width:
// email on top, then Settings, Language (opens a dialog), Learn more (opens a
// page) and Log out.
function AccountMenu({
  user,
  onSettings,
  onLogout,
}: {
  user: User;
  onSettings?: () => void;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentLanguage = APP_LANGUAGES.find(item => item.code === language) ?? APP_LANGUAGES[0];

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) closeMenu();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, closeMenu]);

  const goSettings = () => {
    closeMenu();
    if (onSettings) onSettings();
    else navigate('/settings');
  };

  const openLanguage = () => {
    closeMenu();
    setLanguageOpen(true);
  };

  const chooseLanguage = (code: string) => {
    setLanguage(code as AppLanguage);
    setLanguageOpen(false);
  };

  const closeLanguage = useCallback(() => setLanguageOpen(false), []);

  const learnMore = () => {
    closeMenu();
    navigate('/learn-more');
  };

  const logout = () => {
    closeMenu();
    onLogout();
  };

  return (
    <div ref={menuRef} className="relative w-full">
      <button
        type="button"
        onClick={() => (open ? closeMenu() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open account menu"
        className={`flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left transition-colors hover:bg-zinc-200/60 dark:hover:bg-zinc-800/70 ${
          open ? 'bg-zinc-200/60 dark:bg-zinc-800/70' : ''
        }`}
      >
        <UserAvatar
          name={user.username}
          avatarUrl={user.avatarUrl}
          className="h-7 w-7 shrink-0 text-[11px] font-semibold shadow-none"
        />
        <span className="min-w-0 flex-1 truncate text-[14px] font-normal text-zinc-800 dark:text-zinc-100">
          {user.username}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.8}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            role="menu"
            aria-label="Account"
            className={`absolute bottom-[calc(100%+8px)] left-0 right-0 z-[60] max-h-[calc(100dvh-96px)] origin-bottom overflow-y-auto overscroll-contain ${MENU_SURFACE}`}
          >
            <div className="truncate px-3 pb-1.5 pt-2 text-[13px] font-medium leading-tight text-zinc-500 dark:text-zinc-400">
              {user.email || user.name || user.username}
            </div>

            <MenuItem
              icon={<Settings2 className="h-4 w-4" strokeWidth={1.7} />}
              label="Settings"
              shortcut="Ctrl+Shift+,"
              onClick={goSettings}
            />
            <MenuItem
              icon={<Globe className="h-4 w-4" strokeWidth={1.7} />}
              label="Language"
              onClick={openLanguage}
              trailing={
                <span className="ml-2 flex shrink-0 items-center gap-1 text-[12px] text-zinc-400 dark:text-zinc-500">
                  <span data-no-translate className="max-w-[72px] truncate">{currentLanguage.native}</span>
                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />
                </span>
              }
            />

            <MenuDivider />

            <MenuItem
              icon={<Info className="h-4 w-4" strokeWidth={1.7} />}
              label="Learn more"
              onClick={learnMore}
              trailing={<ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />}
            />

            <MenuDivider />

            <MenuItem
              icon={<LogOut className="h-4 w-4" strokeWidth={1.7} />}
              label="Log out"
              onClick={logout}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <LanguageModal
        isOpen={languageOpen}
        value={language}
        onSelect={chooseLanguage}
        onClose={closeLanguage}
      />
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
  // Start closed on every fresh load so the chat interface is shown
  // immediately. The user can open it with the panel icon in the top-left.
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
  const resizingRef = useRef(false);

  useEffect(() => {
    onDesktopWidthChange?.(desktopWidth);
  }, [desktopWidth, onDesktopWidthChange]);

  // ── Hover peek ────────────────────────────────────────────────────────────
  // While the sidebar is collapsed, hovering the toggle icon slides it out over
  // the page; moving the mouse away slides it back. Clicking the icon pins it.
  const [peek, setPeek] = useState(false);
  const peekTimerRef = useRef<number | null>(null);

  const cancelPeekClose = useCallback(() => {
    if (peekTimerRef.current != null) {
      window.clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
  }, []);

  const openPeek = useCallback(() => {
    cancelPeekClose();
    setPeek(true);
  }, [cancelPeekClose]);

  const schedulePeekClose = useCallback(() => {
    cancelPeekClose();
    peekTimerRef.current = window.setTimeout(() => {
      peekTimerRef.current = null;
      // Keep it open while a menu or dialog started from the sidebar is open.
      if (document.querySelector('[role="menu"], [role="dialog"]')) return;
      setPeek(false);
    }, 220);
  }, [cancelPeekClose]);

  useEffect(() => cancelPeekClose, [cancelPeekClose]);

  useEffect(() => {
    if (!peek) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-desktop-sidebar], [role="menu"], [role="dialog"]')) return;
      setPeek(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="menu"], [role="dialog"]')) setPeek(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [peek]);

  // ── Browser zoom ──────────────────────────────────────────────────────────
  // At 200% zoom (or more) the sidebar collapses by itself. When the zoom drops
  // back below 200% it re-opens, at the same width it had, but only if it was
  // open before the zoom collapsed it. Opening/closing it by hand cancels this.
  const collapsedRef = useRef(desktopCollapsed);
  collapsedRef.current = desktopCollapsed;
  const autoCollapsedRef = useRef(false);

  useEffect(() => {
    // outerWidth does not change with browser zoom but innerWidth (CSS px) does,
    // so their ratio is the zoom level (1 = 100%, 2 = 200%).
    const zoomLevel = () =>
      window.innerWidth > 0 && window.outerWidth > 0
        ? window.outerWidth / window.innerWidth
        : window.devicePixelRatio || 1;

    const syncWithZoom = () => {
      const zoomedIn = zoomLevel() >= 1.95;
      if (zoomedIn && !collapsedRef.current) {
        autoCollapsedRef.current = true;
        setDesktopCollapsed(true);
        setPeek(false);
        onDesktopStateChange?.(false);
      } else if (!zoomedIn && autoCollapsedRef.current) {
        autoCollapsedRef.current = false;
        if (collapsedRef.current) {
          setDesktopCollapsed(false);
          onDesktopStateChange?.(true);
        }
      }
    };

    window.addEventListener('resize', syncWithZoom);
    syncWithZoom();
    return () => window.removeEventListener('resize', syncWithZoom);
  }, [onDesktopStateChange]);

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
      try { localStorage.setItem('Twinkle_sidebar_width', String(Math.round(nextWidth))); } catch { /* storage unavailable */ }
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
    autoCollapsedRef.current = false;
    cancelPeekClose();
    setPeek(false);
    setDesktopCollapsed(false);
    onDesktopStateChange?.(true);
    try { localStorage.setItem(SIDEBAR_SEEN_KEY, '1'); } catch { /* storage unavailable */ }
  }, [onDesktopStateChange, cancelPeekClose]);

  const collapseDesktop = useCallback(() => {
    autoCollapsedRef.current = false;
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

  // Opening search keeps the sidebar as it is on desktop; only the mobile
  // drawer closes so the dialog is not covered.
  const openSearch = useCallback(() => {
    setSearchModalOpen(true);
    onMobileClose?.();
  }, [onMobileClose]);

  // Shortcuts are detected once for the whole app (GlobalShortcuts in App.tsx)
  // and broadcast here, so they also work when pressed from Settings/Profile.
  const shortcutActions = useRef({ toggleDesktop, openSearch });
  shortcutActions.current = { toggleDesktop, openSearch };

  useEffect(() => {
    const run = (action: ShortcutAction) => {
      if (action === 'search') shortcutActions.current.openSearch();
      else if (action === 'toggle-sidebar') shortcutActions.current.toggleDesktop();
    };
    const pending = takePendingShortcut();
    if (pending) run(pending);
    return onShortcut(run);
  }, []);

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
    onOpenSearch: openSearch,
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
          className={`twinkle-sidebar absolute inset-y-0 left-0 z-[9999] flex h-[100dvh] w-[min(18rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col overflow-hidden border-r border-zinc-200 bg-white shadow-none transition-transform duration-300 ease-out dark:border-zinc-800 dark:bg-zinc-950 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={e => e.stopPropagation()}
        >
          <SidebarHeader onToggle={onMobileClose} label="Close sidebar" />
          <SessionList
            {...listProps}
            onClose={onMobileClose}
          />
        </aside>
      </div>

      {/* ═══════════════════════════════════════════════════
          DESKTOP — CLOSED  (lg+ only)
          The sidebar is removed completely. Only a small panel icon stays in
          the top-left corner to bring it back.
      ═══════════════════════════════════════════════════ */}
      {desktopCollapsed && !peek && (
        <motion.div
          className="fixed left-3 top-[18px] z-[9990] hidden lg:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.15 }}
        >
          <Tip label="Open sidebar" shortcut="Ctrl+Shift+S" side="right">
            <button
              type="button"
              onClick={expandDesktop}
              onPointerEnter={event => { if (event.pointerType === 'mouse') openPeek(); }}
              onPointerLeave={event => { if (event.pointerType === 'mouse') schedulePeekClose(); }}
              aria-label="Open sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <SidebarToggleIcon />
            </button>
          </Tip>
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════════
          DESKTOP — OPEN  (lg+ only)
      ═══════════════════════════════════════════════════ */}
      <AnimatePresence initial={false}>
        {(!desktopCollapsed || peek) && (
          <motion.aside
            key="desktop-sidebar"
            data-desktop-sidebar
            onPointerEnter={event => { if (event.pointerType === 'mouse') cancelPeekClose(); }}
            onPointerLeave={event => { if (peek && event.pointerType === 'mouse') schedulePeekClose(); }}
            initial={{ x: -desktopWidth }}
            animate={{ x: 0 }}
            exit={{ x: -desktopWidth }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={`twinkle-sidebar fixed inset-y-0 left-0 z-[9990] hidden h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex ${
              desktopCollapsed ? 'shadow-[8px_0_30px_rgba(0,0,0,0.12)] dark:shadow-[8px_0_30px_rgba(0,0,0,0.5)]' : 'shadow-none'
            }`}
            style={{ width: `${desktopWidth}px` }}
            onClick={e => e.stopPropagation()}
          >
            <SidebarHeader
              onToggle={desktopCollapsed ? expandDesktop : collapseDesktop}
              label={desktopCollapsed ? 'Pin sidebar open' : 'Close sidebar'}
            />

            {/* Desktop: keep the sidebar open after selecting a chat, starting a
                new chat, renaming, etc. It only closes via the toggle button. */}
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
              className="group/resize absolute right-[-3px] top-0 h-full w-[6px] cursor-col-resize touch-none"
            >
              <div className="mx-auto h-full w-px bg-transparent transition-colors group-hover/resize:bg-zinc-300 dark:group-hover/resize:bg-zinc-700" />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
