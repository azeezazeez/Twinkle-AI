import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check, ChevronRight, FolderInput, MoreVertical, Pencil, Pin, PinOff, Plus, Search, SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import type { Session } from '../types';
import { chatApi } from '../lib/api';
import { parseServerDate, serverTime } from '../lib/time';
import ConfirmationModal from './ConfirmationModal';



const PINNED_KEY = 'Twinkle_pinned_sessions';
const PINNED_CHANGED_EVENT = 'twinkle:pinned-sessions-changed';
const SORT_BY_KEY = 'Twinkle_sort_by';
const CUSTOM_GROUPS_KEY = 'Twinkle_custom_groups';
const LIST_PREFS_EVENT = 'twinkle:list-prefs-changed';
const TOP_LAYER = 2147483647;

type SortBy = 'name' | 'created' | 'activity';
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'activity', label: 'Activity' },
  { value: 'created', label: 'Date created' },
  { value: 'name', label: 'Name' },
];

const MENU_SURFACE =
  'rounded-xl border border-zinc-300/70 bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)]';

/* ── storage helpers (same keys as the sidebar) ───────────────────────────── */

const loadPinned = (): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
};
const savePinned = (ids: number[]) => {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(PINNED_CHANGED_EVENT));
};

type Projects = { groups: string[]; assignments: Record<string, string> };
const loadProjects = (): Projects => {
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
const saveProjects = (state: Projects) => {
  try { localStorage.setItem(CUSTOM_GROUPS_KEY, JSON.stringify(state)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(LIST_PREFS_EVENT));
};

const loadSortBy = (): SortBy => {
  try {
    const stored = localStorage.getItem(SORT_BY_KEY);
    return stored === 'name' || stored === 'created' || stored === 'activity' ? stored : 'activity';
  } catch {
    return 'activity';
  }
};

/* ── small helpers ────────────────────────────────────────────────────────── */

const timeAgo = (value: unknown, now: number): string => {
  const date = parseServerDate(value as any);
  if (!date) return '';
  const seconds = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.round(days / 7);
  if (days < 30) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  if (days < 365) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

const activityOf = (s: any) => serverTime(s.updatedAt ?? s.updated_at ?? s.createdAt ?? s.created_at);
const createdOf = (s: any) => serverTime(s.createdAt ?? s.created_at);

function MenuRow({
  icon, label, shortcut, danger = false, trailing, onClick, onMouseEnter,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  trailing?: ReactNode;
  onClick: () => void;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] leading-5 transition-colors focus-visible:outline-none ${
        danger
          ? 'text-[#B53333] hover:bg-[#B53333]/10 focus-visible:bg-[#B53333]/10 dark:text-[#F2877E] dark:hover:bg-[#F2877E]/10'
          : 'text-zinc-800 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800'
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      {shortcut && <span className="ml-2 shrink-0 text-[12px] font-normal text-zinc-400 dark:text-zinc-500">{shortcut}</span>}
    </button>
  );
}

const Divider = () => <div role="separator" className="mx-2 my-1 h-px bg-zinc-200 dark:bg-zinc-700/70" />;

/* ── 3-dots menu ──────────────────────────────────────────────────────────── */

type MenuAnchor = { top: number; bottom: number; right: number };

function RowMenu({
  anchor, pinned, projects, currentProject, onSelect, onPin, onRename, onMoveToProject, onCreateProject, onDelete, onClose,
}: {
  anchor: MenuAnchor;
  pinned: boolean;
  projects: string[];
  currentProject: string | null;
  onSelect: () => void;
  onPin: () => void;
  onRename: () => void;
  onMoveToProject: (name: string | null) => void;
  onCreateProject: (name: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [flipSub, setFlipSub] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const margin = 8;
    const left = Math.min(Math.max(anchor.right - width, margin), window.innerWidth - width - margin);
    const fitsBelow = anchor.bottom + 6 + height + margin <= window.innerHeight;
    const top = fitsBelow ? anchor.bottom + 6 : Math.max(margin, anchor.top - 6 - height);
    setPos({ top, left, origin: fitsBelow ? 'top right' : 'bottom right' });
    // The submenu opens towards the side with room.
    setFlipSub(window.innerWidth - (left + width) < 230);
  }, [anchor]);

  const actions = useRef({ onSelect, onPin, onRename, onDelete, onClose });
  actions.current = { onSelect, onPin, onRename, onDelete, onClose };

  useEffect(() => {
    // Ignore anything that happens in the first moments after opening, so the
    // click that opened the menu (and layout changes it causes, such as the open
    // sidebar settling) can never close it straight away.
    const openedAt = performance.now();
    const settled = () => performance.now() - openedAt > 250;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (ref.current?.contains(target as Node)) return;
      if (target?.closest?.('[data-chats-menu-trigger]')) return;
      // Menus portalled to <body> (submenus, tooltips) belong to this menu.
      if (target?.closest?.('[data-chats-menu-surface]')) return;
      actions.current.onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); actions.current.onClose(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'p') { event.preventDefault(); actions.current.onPin(); }
      else if (key === 'r') { event.preventDefault(); actions.current.onRename(); }
      else if (key === 'd') { event.preventDefault(); actions.current.onDelete(); }
    };
    // Only the person scrolling THIS page's list closes the menu. Programmatic
    // scroll/resize events from other parts of the app (for example the open
    // sidebar) must never dismiss it, so these listen for real user input only.
    const onUserScroll = (event: Event) => {
      if (!settled()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('[data-chats-menu-surface]')) return;
      if (target?.closest?.('[data-chats-page]')) actions.current.onClose();
    };
    const startWidth = window.innerWidth;
    const onResize = () => {
      if (settled() && Math.abs(window.innerWidth - startWidth) > 40) actions.current.onClose();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('wheel', onUserScroll, { capture: true, passive: true });
    window.addEventListener('touchmove', onUserScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('wheel', onUserScroll, true);
      window.removeEventListener('touchmove', onUserScroll, true);
    };
  }, []);

  const commitNewProject = () => {
    const name = newName.trim().slice(0, 40);
    if (name) onCreateProject(name);
    setCreating(false);
    setNewName('');
  };

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      data-chats-menu-surface
      aria-label="Chat options"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className={`fixed w-[212px] ${MENU_SURFACE}`}
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        transformOrigin: pos?.origin ?? 'top right',
        visibility: pos ? 'visible' : 'hidden',
        zIndex: TOP_LAYER,
      }}
      onClick={event => event.stopPropagation()}
    >
      <MenuRow icon={<Check className="h-4 w-4" strokeWidth={1.8} />} label="Select" onClick={onSelect} onMouseEnter={() => setSubOpen(false)} />
      <Divider />
      <MenuRow
        icon={pinned ? <PinOff className="h-4 w-4" strokeWidth={1.7} /> : <Pin className="h-4 w-4" strokeWidth={1.7} />}
        label={pinned ? 'Unpin' : 'Pin'}
        shortcut="P"
        onClick={onPin}
        onMouseEnter={() => setSubOpen(false)}
      />
      <MenuRow icon={<Pencil className="h-4 w-4" strokeWidth={1.7} />} label="Rename" shortcut="R" onClick={onRename} onMouseEnter={() => setSubOpen(false)} />

      <div className="relative">
        <MenuRow
          icon={<FolderInput className="h-4 w-4" strokeWidth={1.7} />}
          label="Add to project"
          trailing={<ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={1.8} />}
          onClick={() => setSubOpen(open => !open)}
          onMouseEnter={() => setSubOpen(true)}
        />
        {subOpen && (
          <div
            role="menu"
            aria-label="Add to project"
            className={`absolute -top-1.5 w-52 ${flipSub ? 'right-full mr-1' : 'left-full ml-1'} ${MENU_SURFACE}`}
          >
            {projects.map(name => (
              <MenuRow
                key={name}
                icon={currentProject === name ? <Check className="h-4 w-4" strokeWidth={2} /> : null}
                label={name}
                onClick={() => onMoveToProject(name)}
              />
            ))}
            {projects.length > 0 && <Divider />}
            {creating ? (
              <div className="px-1 py-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={event => setNewName(event.target.value)}
                  onKeyDown={event => {
                    event.stopPropagation();
                    if (event.key === 'Enter') { event.preventDefault(); commitNewProject(); }
                    if (event.key === 'Escape') { event.preventDefault(); setCreating(false); setNewName(''); }
                  }}
                  maxLength={40}
                  placeholder="Project name"
                  aria-label="New project name"
                  className="h-8 w-full rounded-lg border border-zinc-400 bg-white px-2.5 text-[13px] text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
                />
              </div>
            ) : (
              <MenuRow icon={<Plus className="h-4 w-4" strokeWidth={1.8} />} label="New project" onClick={() => setCreating(true)} />
            )}
            {currentProject && (
              <>
                <Divider />
                <MenuRow icon={<X className="h-4 w-4" strokeWidth={1.8} />} label="Remove from project" onClick={() => onMoveToProject(null)} />
              </>
            )}
          </div>
        )}
      </div>

      <Divider />
      <MenuRow
        icon={<Trash2 className="h-4 w-4" strokeWidth={1.7} />}
        label="Delete"
        shortcut="D"
        danger
        onClick={onDelete}
        onMouseEnter={() => setSubOpen(false)}
      />
    </motion.div>,
    document.body,
  );
}

/* ── sort menu (the sliders icon) ─────────────────────────────────────────── */

function SortMenu({ anchorEl, value, onChange, onClose }: { anchorEl: HTMLElement; value: SortBy; onChange: (v: SortBy) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    const width = ref.current?.offsetWidth ?? 200;
    setPos({ top: rect.bottom + 6, left: Math.min(Math.max(rect.right - width, 8), window.innerWidth - width - 8) });
  }, [anchorEl]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchorEl.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorEl, onClose]);

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label="Sort chats"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={`fixed w-52 ${MENU_SURFACE}`}
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, transformOrigin: 'top right', visibility: pos ? 'visible' : 'hidden', zIndex: TOP_LAYER }}
    >
      <div className="px-3 pb-1 pt-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">Sort by</div>
      {SORT_OPTIONS.map(option => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={value === option.value}
          onClick={() => { onChange(option.value); onClose(); }}
          className="flex h-9 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[14px] text-zinc-800 transition-colors hover:bg-zinc-100 focus-visible:bg-zinc-100 focus-visible:outline-none dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <span>{option.label}</span>
          {value === option.value && <Check className="h-4 w-4 text-[#2F6FDE] dark:text-[#6BA2F5]" strokeWidth={2} />}
        </button>
      ))}
    </motion.div>,
    document.body,
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

type Props = {
  sessions: Session[];
  onOpenSession: (id: number) => void;
  onNewChat: () => void;
  onDeleteSession: (id: number) => void;
  onDeleteMany: (ids: number[]) => void;
  onRenameSession: (id: number, name: string) => void;
};

export default function ChatsListPage({ sessions, onOpenSession, onNewChat, onDeleteSession, onDeleteMany, onRenameSession }: Props) {
  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinned);
  const [projects, setProjects] = useState<Projects>(loadProjects);
  const [sortBy, setSortByState] = useState<SortBy>(loadSortBy);
  const [now, setNow] = useState(() => Date.now());

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [remoteResults, setRemoteResults] = useState<number[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  const [sortOpen, setSortOpen] = useState(false);
  const sortButtonRef = useRef<HTMLButtonElement>(null);

  const [menu, setMenu] = useState<{ id: number; anchor: MenuAnchor } | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmBulk, setConfirmBulk] = useState(false);

  // Keep in sync with the sidebar and other tabs.
  useEffect(() => {
    const sync = () => {
      setPinnedIds(loadPinned());
      setProjects(loadProjects());
      setSortByState(loadSortBy());
    };
    window.addEventListener(PINNED_CHANGED_EVENT, sync);
    window.addEventListener(LIST_PREFS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PINNED_CHANGED_EVENT, sync);
      window.removeEventListener(LIST_PREFS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Keeps "10 minutes ago" fresh.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (searchOpen) window.setTimeout(() => searchRef.current?.focus(), 30);
  }, [searchOpen]);

  useEffect(() => {
    if (renamingId === null) return;
    const timer = window.setTimeout(() => {
      const input = document.getElementById('chats-page-rename-input') as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [renamingId]);

  // Deep search (chat contents) with a local fallback.
  useEffect(() => {
    const q = query.trim();
    const requestId = ++requestRef.current;
    if (!q) { setRemoteResults(null); return; }
    const timer = window.setTimeout(async () => {
      try {
        const response: any = await chatApi.searchSessions(q);
        if (requestId !== requestRef.current) return;
        const raw = Array.isArray(response?.sessions) ? response.sessions : [];
        setRemoteResults(raw.map((item: any) => Number(item.id ?? item.sessionId ?? item.session_id)).filter(Number.isFinite));
      } catch {
        if (requestId === requestRef.current) setRemoteResults(null);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const setSortBy = (value: SortBy) => {
    setSortByState(value);
    try { localStorage.setItem(SORT_BY_KEY, value); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(LIST_PREFS_EVENT));
  };

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const normalized = sessions
      .map((s: any) => ({ ...s, id: Number(s.id ?? s.sessionId ?? s.session_id), sessionName: String(s.sessionName ?? s.name ?? s.title ?? 'New Chat') }))
      .filter((s: any) => Number.isFinite(s.id) && s.id > 0) as Session[];
    const filtered = q
      ? normalized.filter(s => s.sessionName.toLowerCase().includes(q) || (remoteResults?.includes(s.id) ?? false))
      : normalized;
    const compare = (a: Session, b: Session) =>
      sortBy === 'name'
        ? a.sessionName.localeCompare(b.sessionName, undefined, { sensitivity: 'base', numeric: true })
        : sortBy === 'created'
          ? createdOf(b) - createdOf(a)
          : activityOf(b) - activityOf(a);
    const ordered = [...filtered].sort(compare);
    return [...ordered.filter(s => pinnedIds.includes(s.id)), ...ordered.filter(s => !pinnedIds.includes(s.id))];
  }, [sessions, query, remoteResults, sortBy, pinnedIds]);

  const menuSession = menu ? items.find(s => s.id === menu.id) ?? null : null;

  const togglePin = (id: number) => {
    const next = pinnedIds.includes(id) ? pinnedIds.filter(p => p !== id) : [...pinnedIds, id];
    setPinnedIds(next);
    savePinned(next);
    setMenu(null);
  };

  const moveToProject = (id: number, name: string | null) => {
    const assignments = { ...projects.assignments };
    if (name) assignments[String(id)] = name;
    else delete assignments[String(id)];
    const next = { ...projects, assignments };
    setProjects(next);
    saveProjects(next);
    setMenu(null);
  };

  const createProject = (id: number, rawName: string) => {
    const name = rawName.trim().slice(0, 40);
    if (!name) return;
    const existing = projects.groups.find(g => g.toLowerCase() === name.toLowerCase());
    const groups = existing ? projects.groups : [...projects.groups, name];
    const next = { groups, assignments: { ...projects.assignments, [String(id)]: existing ?? name } };
    setProjects(next);
    saveProjects(next);
    setMenu(null);
  };

  const startRename = (session: Session) => {
    setMenu(null);
    setRenamingId(session.id);
    setRenameValue(session.sessionName);
  };
  const commitRename = () => {
    if (renamingId !== null && renameValue.trim()) onRenameSession(renamingId, renameValue.trim());
    setRenamingId(null);
    setRenameValue('');
  };

  const enterSelect = (id?: number) => {
    setMenu(null);
    setSelectMode(true);
    setSelected(id === undefined ? [] : [id]);
  };
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelected([]);
  }, []);
  const toggleSelected = (id: number) =>
    setSelected(current => (current.includes(id) ? current.filter(item => item !== id) : [...current, id]));

  // Escape leaves select mode (menus handle their own Escape first).
  useEffect(() => {
    if (!selectMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !menu && !confirmBulk) exitSelect();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectMode, menu, confirmBulk, exitSelect]);

  const allSelected = items.length > 0 && selected.length === items.length;

  return (
    <div className="absolute inset-0 z-[9996] overflow-y-auto bg-white dark:bg-zinc-950" data-chats-page>
      <div className="mx-auto w-full max-w-[1216px] px-5 pb-16 pt-16 sm:px-8 lg:pt-[72px]">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-[30px] font-medium leading-tight tracking-[-0.01em] text-zinc-900 sm:text-[34px] dark:text-zinc-50">
            Chats
          </h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setSearchOpen(open => !open); if (searchOpen) setQuery(''); }}
              aria-label="Search chats"
              aria-pressed={searchOpen}
              data-tooltip="Search"
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10 ${searchOpen ? 'bg-zinc-100 dark:bg-white/10' : ''}`}
            >
              <Search className="h-[20px] w-[20px]" strokeWidth={1.8} />
            </button>

            <button
              ref={sortButtonRef}
              type="button"
              onClick={() => setSortOpen(open => !open)}
              aria-label="Sort chats"
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              data-tooltip="Sort"
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/10 ${sortOpen ? 'bg-zinc-100 dark:bg-white/10' : ''}`}
            >
              <SlidersHorizontal className="h-[20px] w-[20px]" strokeWidth={1.8} />
            </button>
            <AnimatePresence>
              {sortOpen && sortButtonRef.current && (
                <SortMenu key="sort" anchorEl={sortButtonRef.current} value={sortBy} onChange={setSortBy} onClose={() => setSortOpen(false)} />
              )}
            </AnimatePresence>

            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : enterSelect())}
              className="h-9 rounded-lg border border-zinc-300/80 bg-white px-4 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-white/15 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/5"
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>

            <button
              type="button"
              onClick={onNewChat}
              className="h-9 rounded-lg bg-zinc-950 px-4 text-[14px] font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              New
            </button>
          </div>
        </header>

        {searchOpen && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-zinc-300/80 bg-white px-3.5 py-2 shadow-[0_2px_14px_rgba(0,0,0,0.05)] focus-within:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={1.8} />
            <input
              ref={searchRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') { setSearchOpen(false); setQuery(''); } }}
              placeholder="Search your chats"
              aria-label="Search your chats"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10">
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            )}
          </div>
        )}

        {selectMode && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-zinc-100 px-4 py-2.5 dark:bg-white/5">
            <div className="flex items-center gap-4 text-[14px] text-zinc-700 dark:text-zinc-200">
              <span>{selected.length} selected</span>
              <button
                type="button"
                onClick={() => setSelected(allSelected ? [] : items.map(item => item.id))}
                className="text-[#2F6FDE] hover:underline dark:text-[#6BA2F5]"
              >
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
            </div>
            <button
              type="button"
              disabled={selected.length === 0}
              onClick={() => setConfirmBulk(true)}
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-[#B53333] px-3 text-[13px] font-medium text-white transition-colors hover:bg-[#9E2B2B] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.8} />
              Delete
            </button>
          </div>
        )}

        <ul className="mt-6" aria-label="Chats">
          {items.length === 0 && (
            <li className="px-3 py-10 text-center text-[15px] text-zinc-500 dark:text-zinc-400">
              {query.trim() ? 'No matching chats' : 'No chats yet'}
            </li>
          )}

          {items.map(session => {
            const pinned = pinnedIds.includes(session.id);
            const isMenuOpen = menu?.id === session.id;
            const isRenaming = renamingId === session.id;
            const isChecked = selected.includes(session.id);
            const project = projects.assignments[String(session.id)];

            return (
              <li key={session.id} className="group/chat relative">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isRenaming) return;
                    if (selectMode) toggleSelected(session.id);
                    else onOpenSession(session.id);
                  }}
                  onKeyDown={event => {
                    if (isRenaming) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (selectMode) toggleSelected(session.id);
                      else onOpenSession(session.id);
                    }
                  }}
                  onMouseEnter={() => window.dispatchEvent(new CustomEvent('twinkle-prefetch-session', { detail: session.id }))}
                  className={`flex min-h-[64px] w-full cursor-pointer items-center gap-4 rounded-2xl px-4 py-3 text-left transition-colors active:!transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 ${
                    isMenuOpen || isChecked ? 'bg-zinc-100 dark:bg-white/[0.06]' : 'hover:bg-zinc-100 dark:hover:bg-white/[0.06]'
                  }`}
                >
                  {selectMode && (
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isChecked
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                          : 'border-zinc-400 bg-transparent dark:border-zinc-500'
                      }`}
                    >
                      {isChecked && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <input
                        id="chats-page-rename-input"
                        value={renameValue}
                        onChange={event => setRenameValue(event.target.value)}
                        onKeyDown={event => {
                          event.stopPropagation();
                          if (event.key === 'Enter') commitRename();
                          if (event.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
                        }}
                        onBlur={commitRename}
                        onClick={event => event.stopPropagation()}
                        className="w-full rounded-lg border border-zinc-400 bg-white px-2.5 py-1 text-[16px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400/30 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    ) : (
                      <div className="flex min-w-0 items-center gap-2">
                        {pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.8} aria-label="Pinned" />}
                        <span data-twinkle-user-content className="min-w-0 truncate text-[16px] text-zinc-900 dark:text-zinc-100">
                          {session.sessionName}
                        </span>
                        {project && (
                          <span className="hidden shrink-0 rounded-md bg-zinc-200/70 px-1.5 py-0.5 text-[11px] text-zinc-600 sm:inline dark:bg-white/10 dark:text-zinc-300">
                            {project}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {!isRenaming && (
                    <div className="relative flex h-8 shrink-0 items-center justify-end">
                      <span
                        className={`text-[14px] text-zinc-500 transition-opacity dark:text-zinc-400 ${
                          selectMode ? '' : 'group-focus-within/chat:opacity-0 group-hover/chat:opacity-0 [@media(hover:none)]:hidden'
                        } ${isMenuOpen ? 'opacity-0' : ''}`}
                      >
                        {timeAgo((session as any).updatedAt ?? (session as any).updated_at ?? (session as any).createdAt, now)}
                      </span>

                      {!selectMode && (
                        <button
                          type="button"
                          data-chats-menu-trigger
                          onPointerDown={event => event.stopPropagation()}
                          onMouseDown={event => event.stopPropagation()}
                          onClick={event => {
                            event.stopPropagation();
                            if (isMenuOpen) { setMenu(null); return; }
                            const rect = event.currentTarget.getBoundingClientRect();
                            setMenu({ id: session.id, anchor: { top: rect.top, bottom: rect.bottom, right: rect.right } });
                          }}
                          aria-label="Chat options"
                          aria-haspopup="menu"
                          aria-expanded={isMenuOpen}
                          className={`absolute right-0 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-zinc-200/80 dark:text-zinc-300 dark:hover:bg-white/10 ${
                            isMenuOpen
                              ? 'bg-zinc-200/80 opacity-100 dark:bg-white/10'
                              : 'opacity-0 focus:opacity-100 group-hover/chat:opacity-100 [@media(hover:none)]:opacity-100'
                          }`}
                        >
                          <MoreVertical className="h-[18px] w-[18px]" strokeWidth={1.8} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <AnimatePresence>
        {menu && menuSession && (
          <RowMenu
            key={menu.id}
            anchor={menu.anchor}
            pinned={pinnedIds.includes(menuSession.id)}
            projects={projects.groups}
            currentProject={projects.assignments[String(menuSession.id)] ?? null}
            onSelect={() => enterSelect(menuSession.id)}
            onPin={() => togglePin(menuSession.id)}
            onRename={() => startRename(menuSession)}
            onMoveToProject={name => moveToProject(menuSession.id, name)}
            onCreateProject={name => createProject(menuSession.id, name)}
            onDelete={() => { setMenu(null); onDeleteSession(menuSession.id); }}
            onClose={() => setMenu(null)}
          />
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmBulk}
        onClose={() => setConfirmBulk(false)}
        onConfirm={() => {
          const ids = [...selected];
          setConfirmBulk(false);
          exitSelect();
          onDeleteMany(ids);
        }}
        title={`Delete ${selected.length} ${selected.length === 1 ? 'chat' : 'chats'}?`}
        message={`${selected.length === 1 ? 'This chat' : `These ${selected.length} chats`} will be permanently deleted. This can’t be undone.`}
        confirmText="Delete"
      />
    </div>
  );
}
