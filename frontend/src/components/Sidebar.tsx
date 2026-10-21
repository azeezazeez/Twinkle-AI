import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Session, User } from '../types'; 
import {
  LogOut, Trash2, X, Search, Plus, MoreVertical, PinOff,
  Pencil, Upload, Eye, EyeOff,
  Settings as SettingsGear, ChevronDown, ChevronRight, SlidersHorizontal, Check,
  Globe, Info, FolderInput, ArrowUpRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import UserAvatar from './UserAvatar';
import SearchPalette from './SearchPalette';
import BottomSheet, { RenameSheet, SheetItem, SheetDivider } from './BottomSheet';
import { haptic, useIsMobile, useBackClose, useFocusTrap } from '../lib/mobileUi';
import LanguageModal from './LanguageModal';
import { useLanguage, type AppLanguage } from '../lib/i18n';
import { parseServerDate, serverTime } from '../lib/time';
import { onShortcut, takePendingShortcut, isMac, type ShortcutAction } from '../lib/shortcuts';

const TOGGLE_SIDEBAR_KEYS = isMac() ? '⌘.' : 'Ctrl+B';
const NEW_CHAT_KEYS = isMac() ? '⇧⌘O' : 'Ctrl+Shift+O';

// Small page-with-folded-corner icon shown at the end of a chat row once the
// reply is complete (same look as Claude's sidebar).
function ChatReadyIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M14.5 2.75H7.25A2.5 2.5 0 0 0 4.75 5.25v13.5a2.5 2.5 0 0 0 2.5 2.5h9.5a2.5 2.5 0 0 0 2.5-2.5V7.25z" />
      <path d="M14.5 2.75V6a1.25 1.25 0 0 0 1.25 1.25H19" />
    </svg>
  );
}

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
  /** Search dialog, Tab: start a new chat with this text ready to send. */
  onComposeChat?: (text: string) => void;
  onDeleteSession: (id: number) => void;
  onRenameSession: (id: number, name: string) => void;
  onShareSession: (id: number) => void;
  onLogout: () => void;
  onClose?: () => void;
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

// ─── Group / sort preferences ─────────────────────────────────────────────────
type GroupBy = 'date' | 'unread' | 'state' | 'custom' | 'none';
type SortBy = 'name' | 'created' | 'activity';

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'unread', label: 'Unread' },
  { value: 'state', label: 'State' },
  { value: 'custom', label: 'Custom groups' },
  { value: 'none', label: 'None' },
];
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'created', label: 'Date created' },
  { value: 'activity', label: 'Last activity' },
];
const GROUP_VALUES = GROUP_OPTIONS.map(o => o.value);
const SORT_VALUES = SORT_OPTIONS.map(o => o.value);

const GROUP_BY_KEY = 'Twinkle_group_by';
const SORT_BY_KEY = 'Twinkle_sort_by';
const CUSTOM_GROUPS_KEY = 'Twinkle_custom_groups';
const LIST_PREFS_EVENT = 'twinkle:list-prefs-changed';

// A saved choice that stays in sync between the desktop sidebar, the mobile
// drawer and other browser tabs.
function useListPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (value: T) => void] {
  const read = (): T => {
    try {
      const stored = localStorage.getItem(key);
      return allowed.includes(stored as T) ? (stored as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const [value, setValue] = useState<T>(read);
  useEffect(() => {
    const sync = () => setValue(read());
    window.addEventListener(LIST_PREFS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(LIST_PREFS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const update = (next: T) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(LIST_PREFS_EVENT));
  };
  return [value, update];
}

// Custom groups live in the browser: group names plus which chat is in which group.
interface CustomGroupsState { groups: string[]; assignments: Record<string, string> }

const loadCustomGroups = (): CustomGroupsState => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_GROUPS_KEY) || '{}');
    const groups: string[] = Array.isArray(parsed?.groups) ? parsed.groups.filter((g: unknown) => typeof g === 'string') : [];
    const assignments: Record<string, string> = {};
    if (parsed?.assignments && typeof parsed.assignments === 'object') {
      Object.entries(parsed.assignments).forEach(([id, name]) => {
        if (typeof name === 'string' && groups.includes(name)) assignments[id] = name;
      });
    }
    return { groups, assignments };
  } catch {
    return { groups: [], assignments: {} };
  }
};

const saveCustomGroups = (state: CustomGroupsState) => {
  try { localStorage.setItem(CUSTOM_GROUPS_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(LIST_PREFS_EVENT));
};

const getGroupLabel = (session: Session, field: 'createdAt' | 'updatedAt' = 'createdAt'): string => {
  const raw = field === 'updatedAt'
    ? ((session as any).updatedAt || (session as any).updated_at || (session as any).createdAt || (session as any).created_at)
    : ((session as any).createdAt || (session as any).created_at);
  if (!raw) return 'Recent';
  const date = parseServerDate(raw);
  if (!date) return 'Recent';
  const now = new Date();
  const diffDays = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This Week';
  if (diffDays < 30) return 'This Month';
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

// Highest z-index in the app. Tooltips and floating menus are portalled to
// <body> with this value so no scroll container or stacking context can hide them.
const TOP_LAYER = 2147483647;

// Ask the chat page to load a conversation into memory before it is clicked,
// so opening it from the sidebar feels instant.
const prefetchSession = (id: number) => {
  if (typeof window === 'undefined' || id < 0) return;
  window.dispatchEvent(new CustomEvent('twinkle-prefetch-session', { detail: id }));
};

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
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <rect x="2.5" y="2.5" width="15" height="15" rx="0.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
          className="twinkle-tip is-visible whitespace-nowrap"
          style={{ left: pos.x, top: pos.y, transform, zIndex: TOP_LAYER }}
        >
          <span>{label}</span>
          {shortcut && (
            <kbd className="twinkle-tip-kbd">
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
  roomy = false,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  onClick: () => void;
  trailing?: ReactNode;
  roomy?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex ${roomy ? 'h-9 text-[14.5px]' : 'h-9 text-[14px]'} w-full items-center gap-3 rounded-lg px-3 text-left leading-5 transition-colors focus-visible:outline-none ${
        danger
          ? 'text-[#B53333] hover:bg-[#B53333]/10 focus-visible:bg-[#B53333]/10 dark:text-[#F2877E] dark:hover:bg-[#F2877E]/10'
          : 'text-zinc-800 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800'
      }`}
    >
      <span className={`flex shrink-0 items-center justify-center ${roomy ? 'h-5 w-5' : 'h-4 w-4'}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {shortcut && (
        <span className="ml-2 shrink-0 text-[12px] font-normal text-zinc-400 dark:text-zinc-500">{shortcut}</span>
      )}
    </button>
  );
}

function MenuDivider({ roomy = false }: { roomy?: boolean }) {
  return <div role="separator" className={`mx-2 ${roomy ? 'my-1' : 'my-1'} h-px bg-zinc-200 dark:bg-zinc-700/70`} />;
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
  customGroups,
  currentGroup = null,
  onMoveToGroup,
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
  customGroups?: string[];
  currentGroup?: string | null;
  onMoveToGroup?: (name: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [flipGroups, setFlipGroups] = useState(false);

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
    setFlipGroups(left + width + 4 + 192 > window.innerWidth - margin);
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
      {customGroups && onMoveToGroup && (
        <div className="relative">
          <MenuItem
            icon={<FolderInput className="h-4 w-4" strokeWidth={1.7} />}
            label="Move to group"
            trailing={<ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />}
            onClick={() => setGroupsOpen(open => !open)}
          />
          {groupsOpen && (
            <div
              role="menu"
              aria-label="Move to group"
              className={`absolute -top-1.5 w-48 ${flipGroups ? 'right-full mr-1' : 'left-full ml-1'} ${MENU_SURFACE}`}
            >
              {customGroups.length === 0 ? (
                <div className="px-3 py-2 text-[13px] leading-snug text-zinc-500 dark:text-zinc-400">
                  No groups yet. Use “New group” in the chat list.
                </div>
              ) : (
                customGroups.map(name => (
                  <MenuItem
                    key={name}
                    icon={currentGroup === name ? <Check className="h-4 w-4" strokeWidth={2} /> : null}
                    label={name}
                    onClick={() => onMoveToGroup(name)}
                  />
                ))
              )}
              {currentGroup && (
                <>
                  <MenuDivider />
                  <MenuItem icon={<X className="h-4 w-4" strokeWidth={1.8} />} label="Remove from group" onClick={() => onMoveToGroup(null)} />
                </>
              )}
            </div>
          )}
        </div>
      )}
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


// ─── ListOptionsMenu (Group by / Sort by with flyout submenus) ─────────────────
// Portalled to <body> so the sidebar never clips the flyout.
function ListOptionsMenu({
  anchorEl,
  groupBy,
  sortBy,
  onGroupBy,
  onSortBy,
  onDismiss,
}: {
  anchorEl: HTMLElement;
  groupBy: GroupBy;
  sortBy: SortBy;
  onGroupBy: (value: GroupBy) => void;
  onSortBy: (value: SortBy) => void;
  onDismiss: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);
  const groupRowRef = useRef<HTMLButtonElement>(null);
  const sortRowRef = useRef<HTMLButtonElement>(null);
  const [sub, setSub] = useState<'group' | 'sort' | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [subPos, setSubPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const width = panelRef.current?.offsetWidth ?? 240;
    const margin = 8;
    setPos({
      top: rect.bottom + 6,
      left: Math.min(Math.max(rect.right - width, margin), window.innerWidth - width - margin),
    });
  }, [anchorEl]);

  useLayoutEffect(() => {
    if (!sub || !pos || !panelRef.current || !subRef.current) { setSubPos(null); return; }
    const row = (sub === 'group' ? groupRowRef : sortRowRef).current;
    if (!row) return;
    const panel = panelRef.current.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const width = subRef.current.offsetWidth;
    const height = subRef.current.offsetHeight;
    const margin = 8;
    let left = panel.right + 4;
    if (left + width > window.innerWidth - margin) left = panel.left - width - 4;
    left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);
    const top = Math.min(Math.max(rowRect.top - 6, margin), Math.max(margin, window.innerHeight - height - margin));
    setSubPos({ top, left });
  }, [sub, pos]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || subRef.current?.contains(target) || anchorEl.contains(target)) return;
      onDismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onDismiss(); }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onDismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onDismiss);
    };
  }, [anchorEl, onDismiss]);

  const groupLabel = GROUP_OPTIONS.find(o => o.value === groupBy)?.label ?? '';
  const sortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label ?? '';

  const rowClass = (active: boolean) =>
    `flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] leading-5 text-zinc-800 transition-colors focus-visible:outline-none dark:text-zinc-100 ${
      active ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800'
    }`;

  const optionClass =
    'flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[14px] leading-5 text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800';

  const renderOption = (value: string, label: string, selected: boolean, apply: () => void) => (
    <button
      key={value}
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={() => { apply(); onDismiss(); }}
      className={optionClass}
    >
      <span className="truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-[#2F6FDE] dark:text-[#6BA2F5]" strokeWidth={2} />}
    </button>
  );

  return createPortal(
    <>
      <motion.div
        ref={panelRef}
        role="menu"
        aria-label="Sort and manage chats"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.12, ease: 'easeOut' }}
        className={`fixed w-60 ${MENU_SURFACE}`}
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          transformOrigin: 'top right',
          visibility: pos ? 'visible' : 'hidden',
          zIndex: TOP_LAYER,
        }}
      >
        {([
          { key: 'group' as const, label: 'Group by', value: groupLabel, ref: groupRowRef },
          { key: 'sort' as const, label: 'Sort by', value: sortLabel, ref: sortRowRef },
        ]).map(row => (
          <button
            key={row.key}
            ref={row.ref}
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={sub === row.key}
            onMouseEnter={() => setSub(row.key)}
            onClick={() => setSub(current => (current === row.key ? null : row.key))}
            className={rowClass(sub === row.key)}
          >
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            <span className="max-w-[96px] shrink-0 truncate text-[13px] font-normal text-zinc-400 dark:text-zinc-500">{row.value}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />
          </button>
        ))}
      </motion.div>

      {sub && (
        <motion.div
          key={sub}
          ref={subRef}
          role="menu"
          aria-label={sub === 'group' ? 'Group by' : 'Sort by'}
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className={`fixed w-52 ${MENU_SURFACE}`}
          style={{
            top: subPos?.top ?? -9999,
            left: subPos?.left ?? -9999,
            transformOrigin: 'top left',
            visibility: subPos ? 'visible' : 'hidden',
            zIndex: TOP_LAYER,
          }}
        >
          {sub === 'group' ? (
            <>
              {GROUP_OPTIONS.filter(o => o.value !== 'none').map(o =>
                renderOption(o.value, o.label, groupBy === o.value, () => onGroupBy(o.value)))}
              <MenuDivider />
              {renderOption('none', 'None', groupBy === 'none', () => onGroupBy('none'))}
            </>
          ) : (
            SORT_OPTIONS.map(o => renderOption(o.value, o.label, sortBy === o.value, () => onSortBy(o.value)))
          )}
        </motion.div>
      )}
    </>,
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
function SidebarHeader({ onToggle, label, mobile = false }: { onToggle: () => void; label: string; mobile?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 pb-1 pt-[18px]">
      <Tip label={label} shortcut={TOGGLE_SIDEBAR_KEYS} side="right">
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
        >
          {mobile ? <X className="h-[20px] w-[20px]" strokeWidth={1.8} aria-hidden="true" /> : <SidebarToggleIcon />}
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
  onLogout: () => void;
  onClose: () => void;
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
  onLogout,
  onClose,
  onSettings,
  onOpenSearch,
}: SessionListProps) {
  const navigate = useNavigate();
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);
  // True while the pointer is over the Recents header or any chat row.
  const [recentsHot, setRecentsHot] = useState(false);
  const [menu, setMenu] = useState<{ id: number; anchor: MenuAnchor } | null>(null);
  // Hover tooltip with the full chat name, shown beside the row like Claude.
  const [rowTip, setRowTip] = useState<{ id: number; text: string; x: number; y: number } | null>(null);
  const rowTipTimer = useRef<number | null>(null);
  const clearRowTip = useCallback(() => {
    if (rowTipTimer.current !== null) { window.clearTimeout(rowTipTimer.current); rowTipTimer.current = null; }
    setRowTip(null);
  }, []);
  const scheduleRowTip = (row: HTMLElement, session: Session) => {
    if (rowTipTimer.current !== null || rowTip?.id === session.id) return;
    const text = (session.sessionName || '').trim();
    if (!text || !window.matchMedia?.('(hover: hover)').matches) return;
    const rect = row.getBoundingClientRect();
    rowTipTimer.current = window.setTimeout(() => {
      rowTipTimer.current = null;
      setRowTip({ id: session.id, text, x: rect.right + 6, y: rect.top + rect.height / 2 });
    }, 450);
  };
  useEffect(() => {
    window.addEventListener('scroll', clearRowTip, true);
    return () => { window.removeEventListener('scroll', clearRowTip, true); clearRowTip(); };
  }, [clearRowTip]);
  const isMobile = useIsMobile();
  // The "View all" arrow only shows on hover and never while a reply is streaming.
  const viewAllVisible = (recentsHot || isMobile) && respondingSessionId == null;
  const [sheetGroupsOpen, setSheetGroupsOpen] = useState(false);
  // Long-press a chat (touch) to open its options sheet.
  const pressTimer = useRef<number | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current !== null) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  };
  useEffect(() => cancelPress, []);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);
  const [unreadIds, setUnreadIds] = useState<number[]>(loadUnreadIds);
  const [groupBy, setGroupBy] = useListPref<GroupBy>(GROUP_BY_KEY, 'date', GROUP_VALUES);
  const [sortBy, setSortBy] = useListPref<SortBy>(SORT_BY_KEY, 'activity', SORT_VALUES);
  const [custom, setCustom] = useState<CustomGroupsState>(loadCustomGroups);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const skipGroupCommit = useRef(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  const optionsButtonRef = useRef<HTMLButtonElement>(null);

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

  // Keep custom groups in sync between the drawer, the sidebar and other tabs.
  useEffect(() => {
    const sync = () => setCustom(loadCustomGroups());
    window.addEventListener(LIST_PREFS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(LIST_PREFS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

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

  const getSessionTimestamp = (session: Session, field: 'createdAt' | 'updatedAt') => {
    const value = field === 'createdAt'
      ? ((session as any).createdAt || (session as any).created_at)
      : ((session as any).updatedAt || (session as any).updated_at || (session as any).createdAt || (session as any).created_at);
    return serverTime(value) || 0;
  };

  const sortField: 'createdAt' | 'updatedAt' = sortBy === 'created' ? 'createdAt' : 'updatedAt';
  const sortAlphabetically = (a: Session, b: Session) =>
    a.sessionName.localeCompare(b.sessionName, undefined, { sensitivity: 'base', numeric: true });
  const orderedSessions = [...displaySessions].sort((a, b) =>
    sortBy === 'name'
      ? sortAlphabetically(a, b)
      : getSessionTimestamp(b, sortField) - getSessionTimestamp(a, sortField));
  const sortedSessions = orderedSessions;

  const pinnedSessions = orderedSessions.filter(s => pinnedIds.includes(s.id));
  const unpinnedSessions = orderedSessions.filter(s => !pinnedIds.includes(s.id));
  const pinnedFirst = (list: Session[]) => [
    ...list.filter(s => pinnedIds.includes(s.id)),
    ...list.filter(s => !pinnedIds.includes(s.id)),
  ];

  const grouped: { label: string; items: Session[]; custom?: boolean }[] = [];
  const pushGroup = (label: string, items: Session[]) => {
    if (items.length) grouped.push({ label, items });
  };
  const splitByRead = (list: Session[]) => {
    pushGroup('Unread', list.filter(s => unreadIds.includes(s.id)));
    pushGroup('Read', list.filter(s => !unreadIds.includes(s.id)));
  };

  if (groupBy === 'unread') {
    splitByRead(pinnedFirst(orderedSessions));
  } else {
    pushGroup('Pinned', pinnedSessions);
    if (groupBy === 'date') {
      const buckets = new Map<string, Session[]>();
      unpinnedSessions.forEach(session => {
        const label = getGroupLabel(session, sortField);
        const bucket = buckets.get(label);
        if (bucket) bucket.push(session);
        else buckets.set(label, [session]);
      });
      const newest = (items: Session[]) => Math.max(...items.map(s => getSessionTimestamp(s, sortField)));
      [...buckets.entries()]
        .sort((a, b) => newest(b[1]) - newest(a[1]))
        .forEach(([label, items]) => pushGroup(label, items));
    } else if (groupBy === 'state') {
      pushGroup('Responding', unpinnedSessions.filter(s => respondingSessionId === s.id));
      splitByRead(unpinnedSessions.filter(s => respondingSessionId !== s.id));
    } else if (groupBy === 'custom') {
      custom.groups.forEach(name => {
        grouped.push({
          label: name,
          custom: true,
          items: unpinnedSessions.filter(s => custom.assignments[String(s.id)] === name),
        });
      });
      pushGroup('Ungrouped', unpinnedSessions.filter(s => !custom.assignments[String(s.id)]));
    } else {
      pushGroup(pinnedSessions.length ? 'Chats' : '', unpinnedSessions);
    }
  }

  const menuSession = menu ? displaySessions.find(s => s.id === menu.id) ?? null : null;
  // Keep the last chat so the sheet's content stays put while it slides away.
  const lastMenuSession = useRef<Session | null>(null);
  if (menuSession) lastMenuSession.current = menuSession;
  const sheetSession = menuSession ?? lastMenuSession.current;
  useEffect(() => { if (!menu) setSheetGroupsOpen(false); }, [menu]);

  const pressHandlers = (session: Session, disabled: boolean) => ({
    onTouchStart: (event: React.TouchEvent<HTMLElement>) => {
      prefetchSession(session.id);
      if (disabled || !isMobile || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const row = event.currentTarget;
      pressOrigin.current = { x: touch.clientX, y: touch.clientY };
      longPressed.current = false;
      cancelPress();
      pressTimer.current = window.setTimeout(() => {
        pressTimer.current = null;
        longPressed.current = true;
        haptic(15);
        const rect = row.getBoundingClientRect();
        setMenu({ id: session.id, anchor: { top: rect.top, bottom: rect.bottom, right: rect.right } });
      }, 450);
    },
    onTouchMove: (event: React.TouchEvent<HTMLElement>) => {
      const origin = pressOrigin.current;
      const touch = event.touches[0];
      if (origin && touch && Math.hypot(touch.clientX - origin.x, touch.clientY - origin.y) > 10) cancelPress();
    },
    onTouchEnd: cancelPress,
    onTouchCancel: cancelPress,
    onContextMenu: (event: React.MouseEvent) => { if (isMobile) event.preventDefault(); },
  });

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

  const createGroup = (rawName: string) => {
    const name = rawName.trim().slice(0, 40);
    if (!name || custom.groups.some(g => g.toLowerCase() === name.toLowerCase())) return;
    const next = { ...custom, groups: [...custom.groups, name] };
    setCustom(next);
    saveCustomGroups(next);
  };

  const deleteGroup = (name: string) => {
    const assignments = { ...custom.assignments };
    Object.keys(assignments).forEach(id => { if (assignments[id] === name) delete assignments[id]; });
    const next = { groups: custom.groups.filter(g => g !== name), assignments };
    setCustom(next);
    saveCustomGroups(next);
  };

  const moveToGroup = (id: number, name: string | null) => {
    const assignments = { ...custom.assignments };
    if (name) assignments[String(id)] = name;
    else delete assignments[String(id)];
    const next = { ...custom, assignments };
    setCustom(next);
    saveCustomGroups(next);
  };

  const commitNewGroup = () => {
    if (skipGroupCommit.current) return;
    skipGroupCommit.current = true;
    createGroup(newGroupName);
    setNewGroupName('');
    setCreatingGroup(false);
  };

  const cancelNewGroup = () => {
    skipGroupCommit.current = true;
    setNewGroupName('');
    setCreatingGroup(false);
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
    if (custom.assignments[String(id)]) moveToGroup(id, null);
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
          <span className="text-[12px] text-zinc-400 opacity-0 transition-opacity group-hover/nav:opacity-100 group-focus-visible/nav:opacity-100 dark:text-zinc-500">{NEW_CHAT_KEYS}</span>
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
      <div
        className="group/recents flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-4"
        onMouseEnter={() => setRecentsHot(true)}
        onMouseLeave={() => setRecentsHot(false)}
      >
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

        <div className="flex items-center gap-0.5">
        {/* View all: opens the full "Chats" page */}
        <Tip label="View all" side="top">
          <button
            type="button"
            onClick={() => { onClose(); navigate('/chats'); }}
            aria-label="View all chats"
            tabIndex={viewAllVisible ? 0 : -1}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-[opacity,colors] duration-150 hover:bg-zinc-200/60 hover:text-zinc-800 focus-visible:opacity-100 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${
              viewAllVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <ArrowUpRight className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </Tip>

        {sessions.length > 0 && (
          <div ref={optionsRef} className="relative">
            <Tip label="Sort & manage" side="top">
              <button
                ref={optionsButtonRef}
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
              {optionsOpen && optionsButtonRef.current && (
                <ListOptionsMenu
                  key="list-options"
                  anchorEl={optionsButtonRef.current}
                  groupBy={groupBy}
                  sortBy={sortBy}
                  onGroupBy={setGroupBy}
                  onSortBy={setSortBy}
                  onDismiss={() => setOptionsOpen(false)}
                />
              )}
            </AnimatePresence>
          </div>
        )}
        </div>
      </div>

      {/* Chat list */}
      {!recentsCollapsed && (
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          {groupBy === 'custom' && sortedSessions.length > 0 && (
            creatingGroup ? (
              <div className="px-1 pt-2">
                <input
                  autoFocus
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitNewGroup(); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelNewGroup(); }
                    e.stopPropagation();
                  }}
                  onBlur={commitNewGroup}
                  maxLength={40}
                  placeholder="Group name"
                  aria-label="New group name"
                  className="h-8 w-full rounded-lg border border-zinc-400 bg-white px-2.5 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { skipGroupCommit.current = false; setCreatingGroup(true); }}
                className="mt-1 flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-800 focus-visible:outline-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <Plus className="h-4 w-4" strokeWidth={1.7} />
                New group
              </button>
            )
          )}
          {sortedSessions.length === 0 ? (
            <div className="mx-1 mt-2 rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center dark:border-zinc-700">
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">No chats yet</p>
              <p className="mt-0.5 text-[12px] text-zinc-400 dark:text-zinc-500">Start a new conversation</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={`${group.custom ? 'custom:' : ''}${group.label}`} className="mb-1">
                {group.label ? (
                  <div className="group/ghead flex items-center justify-between gap-2 px-2.5 pb-1 pt-3 text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                    <span className="min-w-0 truncate">{group.label}</span>
                    {group.custom && (
                      <button
                        type="button"
                        onClick={() => deleteGroup(group.label)}
                        aria-label={`Delete group ${group.label}`}
                        title="Delete group (chats are kept)"
                        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700 group-focus-within/ghead:flex group-hover/ghead:flex dark:hover:bg-zinc-800 dark:hover:text-zinc-200 [@media(hover:none)]:flex"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="pt-2" />
                )}
                {group.custom && group.items.length === 0 && (
                  <div className="px-2.5 py-1 text-[12px] text-zinc-400 dark:text-zinc-500">No chats</div>
                )}

                <div className="space-y-px">
                  {group.items.map(session => {
                    const isActive = currentSessionId === session.id;
                    const isUnread = unreadIds.includes(session.id);
                    const isMenuOpen = menu?.id === session.id;
                    const isRenaming = renamingId === session.id;
                    const isResponding = respondingSessionId === session.id;
                    // Negative ids are local placeholders (the first-login welcome
                    // chat): they have no menu, pin or rename.
                    const isLocalOnly = session.id < 0;

                    return (
                      <motion.div
                        key={session.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`group/item flex h-8 cursor-pointer [@media(hover:none)]:select-none [@media(hover:none)]:[-webkit-touch-callout:none] items-center gap-2 rounded-lg px-2.5 transition-colors ${
                          isActive || isMenuOpen
                            ? 'bg-zinc-200/70 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                            : 'text-zinc-700 hover:bg-zinc-200/60 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100'
                        }`}
                        onClick={() => {
                          if (longPressed.current) { longPressed.current = false; return; }
                          clearRowTip(); handleSelectSession(session.id);
                        }}
                        onMouseEnter={() => { setRecentsHot(true); prefetchSession(session.id); }}
                        onMouseDown={() => prefetchSession(session.id)}
                        {...pressHandlers(session, isLocalOnly || isRenaming)}
                        onFocus={() => prefetchSession(session.id)}
                        onMouseOver={event => {
                          if (isRenaming || menu) { clearRowTip(); return; }
                          if ((event.target as HTMLElement).closest('[data-row-actions]')) { clearRowTip(); return; }
                          scheduleRowTip(event.currentTarget, session);
                        }}
                        onMouseLeave={() => { clearRowTip(); setRecentsHot(false); }}
                      >
                        {isRenaming && !isMobile ? (
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
                            className={`min-w-0 flex-1 truncate text-[14px] leading-snug font-normal`}
                          >
                            {typingSessionId === session.id
                              ? <TypewriterText text={session.sessionName} onDone={onTypingDone} />
                              : session.sessionName}
                          </span>
                        )}

                        {/* Status at the end of the row: orange dot while replying, blue dot when
                            marked unread, page icon once the reply is complete. Hidden on hover (and
                            while the menu is open) so the 3-dots button takes its place. */}
                        {!isRenaming && !isLocalOnly && !isMenuOpen && (isResponding || isUnread || !isMobile) && (
                          <span
                            role="img"
                            aria-label={isResponding ? 'Chat responding' : isUnread ? 'Unread' : 'Reply complete'}
                            className={`shrink-0 items-center justify-center ${
                              isMobile ? 'flex' : 'flex group-hover/item:hidden group-focus-within/item:hidden'
                            }`}
                          >
                            {isResponding ? (
                              <span className="h-2 w-2 animate-pulse rounded-full bg-[#D97757]" />
                            ) : isUnread ? (
                              <span className="h-2 w-2 rounded-full bg-[#3B82F6]" />
                            ) : (
                              <ChatReadyIcon className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                            )}
                          </span>
                        )}

                        {(!isRenaming || isMobile) && !isLocalOnly && (
                          <div
                            data-row-actions
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

      {/* Chat name tooltip (portalled so the list never clips it) */}
      {rowTip && !menu && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          className="twinkle-tip is-visible"
          style={{
            left: rowTip.x,
            top: rowTip.y,
            transform: 'translateY(-50%)',
            maxWidth: Math.max(160, Math.min(260, window.innerWidth - rowTip.x - 8)),
            zIndex: TOP_LAYER,
          }}
        >
          {rowTip.text}
        </div>,
        document.body
      )}

      {/* Chat options dropdown (single instance, portalled) */}
      <AnimatePresence>
        {!isMobile && menu && menuSession && (
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
            customGroups={groupBy === 'custom' ? custom.groups : undefined}
            currentGroup={custom.assignments[String(menuSession.id)] ?? null}
            onMoveToGroup={name => { moveToGroup(menuSession.id, name); setMenu(null); }}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>

      {/* Phones: the same options as a bottom sheet (⋮ button or long-press). */}
      {isMobile && (
        <BottomSheet open={!!menuSession} onClose={() => setMenu(null)} label="Chat options">
          {sheetSession && (
            <div role="menu" aria-label="Chat options">
              <SheetItem
                icon={pinnedIds.includes(sheetSession.id) ? <PinOff className="h-5 w-5" strokeWidth={1.7} /> : <SidebarPinIcon className="h-5 w-5" />}
                label={pinnedIds.includes(sheetSession.id) ? 'Unpin' : 'Pin'}
                onClick={() => togglePin(sheetSession.id)}
              />
              <SheetItem
                icon={unreadIds.includes(sheetSession.id) ? <Eye className="h-5 w-5" strokeWidth={1.7} /> : <EyeOff className="h-5 w-5" strokeWidth={1.7} />}
                label={unreadIds.includes(sheetSession.id) ? 'Mark as read' : 'Mark as unread'}
                onClick={() => { setUnread(sheetSession.id, !unreadIds.includes(sheetSession.id)); setMenu(null); }}
              />
              <SheetItem icon={<Pencil className="h-5 w-5" strokeWidth={1.7} />} label="Rename" onClick={() => startRename(sheetSession)} />
              <SheetItem icon={<Upload className="h-5 w-5" strokeWidth={1.7} />} label="Share" onClick={() => handleShare(sheetSession.id)} />
              {groupBy === 'custom' && (
                <>
                  <SheetItem
                    icon={<FolderInput className="h-5 w-5" strokeWidth={1.7} />}
                    label="Move to group"
                    trailing={<ChevronRight className={`h-5 w-5 shrink-0 text-zinc-400 transition-transform ${sheetGroupsOpen ? 'rotate-90' : ''}`} strokeWidth={1.8} />}
                    onClick={() => setSheetGroupsOpen(open => !open)}
                  />
                  {sheetGroupsOpen && (
                    <div className="ml-8 border-l border-zinc-200 pl-2 dark:border-zinc-700">
                      {custom.groups.length === 0 ? (
                        <div className="px-3 py-2 text-[14px] text-zinc-500 dark:text-zinc-400">No groups yet. Use “New group” in the chat list.</div>
                      ) : custom.groups.map(name => (
                        <SheetItem
                          key={name}
                          icon={(custom.assignments[String(sheetSession.id)] ?? null) === name ? <Check className="h-5 w-5" strokeWidth={2} /> : <span className="h-5 w-5" />}
                          label={name}
                          onClick={() => { moveToGroup(sheetSession.id, name); setMenu(null); }}
                        />
                      ))}
                      {custom.assignments[String(sheetSession.id)] && (
                        <SheetItem icon={<X className="h-5 w-5" strokeWidth={1.8} />} label="Remove from group" onClick={() => { moveToGroup(sheetSession.id, null); setMenu(null); }} />
                      )}
                    </div>
                  )}
                </>
              )}
              <SheetDivider />
              <SheetItem icon={<Trash2 className="h-5 w-5" strokeWidth={1.7} />} label="Delete" danger onClick={() => handleDelete(sheetSession.id)} />
            </div>
          )}
        </BottomSheet>
      )}

      {/* Phones: rename in a sheet above the keyboard instead of inside the narrow row. */}
      {isMobile && (
        <RenameSheet
          open={renamingId !== null}
          value={renameValue}
          onChange={setRenameValue}
          onSubmit={commitRename}
          onCancel={cancelRename}
        />
      )}

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
            <div className="truncate px-3 pb-1.5 pt-2 text-[13px] font-medium leading-5 text-zinc-500 dark:text-zinc-400">
              {user.email || user.name || user.username}
            </div>

            <MenuItem
              roomy
              icon={<SettingsGear className="h-[18px] w-[18px]" strokeWidth={1.7} />}
              label="Settings"
              shortcut="Ctrl+Shift+,"
              onClick={goSettings}
            />
            <MenuItem
              roomy
              icon={<Globe className="h-[18px] w-[18px]" strokeWidth={1.7} />}
              label="Language"
              onClick={openLanguage}
            />

            <MenuDivider roomy />

            <MenuItem
              roomy
              icon={<Info className="h-[18px] w-[18px]" strokeWidth={1.7} />}
              label="Learn more"
              onClick={learnMore}
              trailing={<ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />}
            />

            <MenuDivider roomy />

            <MenuItem
              roomy
              icon={<LogOut className="h-[18px] w-[18px]" strokeWidth={1.7} />}
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
  onComposeChat,
  onDeleteSession,
  onRenameSession,
  onShareSession,
  onLogout,
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
  // Mobile drawer: Back button closes it, Escape closes it (unless a sheet is
  // open on top), focus stays inside, and a left swipe closes it.
  const drawerRef = useRef<HTMLElement | null>(null);
  const drawerSwipe = useRef<{ x: number; y: number } | null>(null);
  useBackClose(mobileOpen, () => onMobileClose?.());
  useFocusTrap(drawerRef, mobileOpen);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      onMobileClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen, onMobileClose]);

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
      onLogout,
    onSettings: handleSettings,
    onOpenSearch: openSearch,
  };

  return (
    <>
      <AnimatePresence>
        {searchModalOpen && (
          <SearchPalette
            open={searchModalOpen}
            sessions={sessions}
            onClose={() => setSearchModalOpen(false)}
            onSelectSession={id => {
              onSelectSession(id);
              onClose();
            }}
            onNewSession={() => {
              onNewSession();
              onClose();
            }}
            onComposeChat={onComposeChat}
            onPrefetchSession={prefetchSession}
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
        className={`lg:hidden fixed inset-0 z-[10010] transition-opacity duration-200 motion-reduce:transition-none ${
          mobileOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        // `inert` hides the closed drawer from assistive tech AND drops focus from
        // it; aria-hidden on a focused element is blocked by the browser.
        inert={!mobileOpen}
      >
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onMobileClose}
        />

        <aside
          ref={drawerRef}
          aria-label="Sidebar"
          onTouchStart={event => {
            const touch = event.touches[0];
            drawerSwipe.current = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
          }}
          onTouchEnd={event => {
            const start = drawerSwipe.current;
            drawerSwipe.current = null;
            const touch = event.changedTouches[0];
            if (!start || !touch) return;
            const dx = touch.clientX - start.x;
            const dy = Math.abs(touch.clientY - start.y);
            // Swipe left to close.
            if (dx < -70 && dy < Math.abs(dx) * 0.6) { haptic(8); onMobileClose?.(); }
          }}
          className={`twinkle-sidebar absolute inset-y-0 left-0 z-[9999] flex h-[100dvh] w-[min(18rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] flex-col overflow-hidden border-r border-zinc-200 bg-white shadow-none transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-zinc-800 dark:bg-zinc-950 ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={e => e.stopPropagation()}
        >
          <SidebarHeader onToggle={onMobileClose} label="Close sidebar" mobile />
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
          className="fixed left-[15px] top-[18px] z-[10000] hidden lg:block"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.15 }}
        >
          <Tip label="Open sidebar" shortcut={TOGGLE_SIDEBAR_KEYS} side="right">
            <button
              type="button"
              onClick={expandDesktop}
              onPointerEnter={event => { if (event.pointerType === 'mouse') openPeek(); }}
              onPointerLeave={event => { if (event.pointerType === 'mouse') schedulePeekClose(); }}
              aria-label="Open sidebar"
              className="relative flex h-8 w-[17px] items-center justify-center rounded-lg text-zinc-600 transition-colors before:pointer-events-none before:absolute before:inset-y-0 before:-inset-x-[3px] before:rounded-lg before:transition-colors hover:before:bg-zinc-200/60 after:absolute after:inset-y-0 after:-left-3 after:w-3 hover:text-zinc-900 dark:text-zinc-300 dark:hover:before:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <SidebarToggleIcon className="relative shrink-0 -translate-y-px" />
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
            className={`twinkle-sidebar fixed inset-y-0 left-0 z-[10000] hidden h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 lg:flex ${
              desktopCollapsed ? 'shadow-[8px_0_30px_rgba(0,0,0,0.12)] dark:shadow-[8px_0_30px_rgba(0,0,0,0.5)]' : 'shadow-none'
            }`}
            style={{ width: `${desktopWidth}px` }}
            onClick={e => e.stopPropagation()}
          >
            <SidebarHeader
              onToggle={desktopCollapsed ? expandDesktop : collapseDesktop}
              label={desktopCollapsed ? 'Open sidebar' : 'Hide sidebar'}
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
