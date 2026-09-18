import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Session, User } from '../types';
import {
  LogOut, Trash2, X, Search, SquarePen,
  MoreHorizontal, Pin, PinOff, Edit3,
  MessageCircle, Sun, Moon, Sparkles,
  Settings2, UserCircle2, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import UserAvatar from './UserAvatar'; 
import { chatApi } from '../lib/api';
import StormLogo from './StormLogo';

function SidebarControlIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M9 4.8V19.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  user: User;
  sessions: Session[];
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
  onRenameSession: (id: number, name: string) => void;
  onClearAll: () => void;
  onLogout: () => void;
  onClose?: () => void;
  onProfile?: () => void;
  onSettings?: () => void;
  onDesktopStateChange?: (expanded: boolean) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PINNED_KEY = 'Twinkle_pinned_sessions';
const SIDEBAR_SEEN_KEY = 'Twinkle_sidebar_seen';

const loadPinnedIds = (): number[] => {
  try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); } catch { return []; }
};
const savePinnedIds = (ids: number[]) => {
  localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
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
// ─── IconTooltip ──────────────────────────────────────────────────────────────
function IconTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative group/tip flex items-center justify-center w-full">
      {children}
      <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded-lg whitespace-nowrap pointer-events-none z-[300] shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        {label}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900" />
      </div>
    </div>
  );
}

// ─── ThemeToggleButton ────────────────────────────────────────────────────────
function ThemeToggleButton({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') return true;
    if (savedTheme === 'light') return false;
    return document.documentElement.classList.contains('dark');
  });

  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (theme: 'dark' | 'light') => {
      document.documentElement.classList.toggle('dark', theme === 'dark');
      setIsDark(theme === 'dark');
    };

    // Explicit user choice wins; otherwise follow the device theme.
    if (savedTheme === 'dark' || savedTheme === 'light') {
      applyTheme(savedTheme);
    } else {
      applyTheme(mediaQuery.matches ? 'dark' : 'light');
    }

    const handleDeviceThemeChange = (event: MediaQueryListEvent) => {
      // Only follow the device automatically when the user has not
      // explicitly selected a theme.
      const currentPreference = localStorage.getItem('theme');
      if (currentPreference !== 'dark' && currentPreference !== 'light') {
        applyTheme(event.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleDeviceThemeChange);

    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      mediaQuery.removeEventListener('change', handleDeviceThemeChange);
      observer.disconnect();
    };
  }, []);

  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`flex items-center justify-center rounded-full
        bg-zinc-100 dark:bg-zinc-800
        border border-zinc-200 dark:border-zinc-700
        text-zinc-500 dark:text-zinc-400
        hover:text-zinc-600 dark:hover:text-zinc-400
        hover:border-zinc-300 dark:hover:border-zinc-600
        shadow-sm transition-all duration-200
        ${className ?? 'w-9 h-9'}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.span
            key="sun"
            initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center"
          >
            <Sun className="w-4 h-4" />
          </motion.span>
        ) : (
          <motion.span
            key="moon"
            initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
            animate={{ rotate: 0, opacity: 1, scale: 1 }}
            exit={{ rotate: -90, opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-center"
          >
            <Moon className="w-4 h-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ─── SessionList ──────────────────────────────────────────────────────────────
interface SessionListProps {
  user: User;
  sessions: Session[];
  currentSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  onDeleteSession: (id: number) => void;
  onRenameSession: (id: number, name: string) => void;
  onClearAll: () => void;
  onLogout: () => void;
  onClose: () => void;
  onProfile?: () => void;
  onSettings?: () => void;
  focusSearchOnMount?: boolean;
}

function SessionList({
  user,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onClearAll,
  onLogout,
  onClose,
  onProfile,
  onSettings,
  focusSearchOnMount = false,
}: SessionListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRequestRef = useRef(0);

  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);

  useEffect(() => {
    if (focusSearchOnMount) {
      const timer = window.setTimeout(() => searchInputRef.current?.focus(), 80);
      return () => window.clearTimeout(timer);
    }
  }, [focusSearchOnMount]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && searchQuery) {
        setSearchQuery('');
        setSearchResults(null);
        setIsSearching(false);
        ++searchRequestRef.current;
      }
    };

    document.addEventListener('keydown', handleKeyboard);
    return () => document.removeEventListener('keydown', handleKeyboard);
  }, [searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim();
    const requestId = ++searchRequestRef.current;

    if (!query) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);

      try {
        const res = await chatApi.searchSessions(query);
        if (requestId !== searchRequestRef.current) return;

        const rawResults = Array.isArray((res as any)?.sessions)
          ? (res as any).sessions
          : [];

        const normalizedResults = rawResults
          .map((s: any) => ({
            ...s,
            id: Number(s.id ?? s.sessionId ?? s.session_id),
            sessionName: String(
              s.sessionName ?? s.name ?? s.title ?? 'New Chat'
            ),
          }))
          .filter((s: any) => Number.isFinite(s.id));

        setSearchResults(normalizedResults);
      } catch (err) {
        if (requestId !== searchRequestRef.current) return;

        // The API is unavailable/failed: search the already loaded sessions
        // instead of leaving the mobile drawer empty.
        const lowerQuery = query.toLowerCase();
        setSearchResults(
          sessions.filter(s =>
            String(s.sessionName ?? '').toLowerCase().includes(lowerQuery)
          )
        );
      } finally {
        if (requestId === searchRequestRef.current) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, sessions]);

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

  const displaySessions: Session[] = (searchResults ?? sessions)
    .map((s: any) => ({
      ...s,
      id: Number(s.id ?? s.sessionId ?? s.session_id),
      sessionName: String(s.sessionName ?? s.name ?? s.title ?? 'New Chat'),
    }))
    .filter((s: any) => Number.isFinite(s.id));

  const sortedSessions = [
    ...displaySessions.filter(s => pinnedIds.includes(s.id)),
    ...displaySessions.filter(s => !pinnedIds.includes(s.id)),
  ];

  const grouped: { label: string; items: Session[] }[] = [];
  sortedSessions.forEach(session => {
    const label = pinnedIds.includes(session.id) ? 'Pinned' : getGroupLabel(session);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(session);
    else grouped.push({ label, items: [session] });
  });

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) setSearchResults(null);
  };

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
    setMenuOpenId(null);
    onClose();
    onDeleteSession(id);
    setPinnedIds(prev => {
      const next = prev.filter(p => p !== id);
      savePinnedIds(next);
      return next;
    });
  };

  // FIX: Select the session FIRST (synchronously), then close the drawer.
  // The previous order (close -> setTimeout -> select) raced against the
  // mobile drawer's remount-on-close (Sidebar used to swap a `key` on
  // mobileOpen), which could unmount SessionList before the deferred
  // onSelectSession ever fired -- so taps on mobile sometimes silently
  // failed to switch sessions. Selecting first removes the race entirely.
  const handleSelectSession = (id: number) => {
    if (renamingId !== null) return;

    // Clear transient search state before closing the mobile drawer. This
    // guarantees that reopening the drawer shows the complete session list.
    ++searchRequestRef.current;
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);

    onSelectSession(id);
    onClose();
  };

  return (
    <>
      {/* Top controls */}
      <div className="p-4 shrink-0">
        <button
          type="button"
          onClick={() => { onNewSession(); onClose(); }}
          aria-label="New chat"
          className="w-full h-12 px-2.5 bg-transparent text-zinc-900 dark:text-zinc-100 rounded-xl flex items-center gap-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          <SquarePen className="w-[22px] h-[22px] shrink-0 text-zinc-900 dark:text-zinc-100" strokeWidth={1.7} />
          <span className="text-[17px] font-normal tracking-tight">New chat</span>
        </button>

        <div className="relative group mx-auto w-full max-w-[324px]">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-zinc-500 transition-colors">
            {isSearching
              ? <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              : <Search className="w-3.5 h-3.5" />}
          </div>
          <input
            ref={searchInputRef}
            type="search"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.preventDefault();
                handleSearchChange('');
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                const query = searchQuery.trim();
                if (query) {
                  ++searchRequestRef.current;
                  setSearchQuery(query);
                }
              }
            }}
            placeholder="Search chats..."
            autoComplete="off"
            spellCheck={false}
            aria-label="Search chats"
            className="w-full pl-10 pr-9 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-zinc-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-600"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="px-4 pb-2 shrink-0">
        <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Recents</div>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-4"
        style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
      >
        {sortedSessions.length === 0 ? (
          <div className="mx-2 py-8 text-center bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider leading-relaxed">
              {searchQuery ? 'No matching chats' : 'No chats yet'}
              <br />
              <span className="opacity-60 font-medium">
                {searchQuery ? 'Try a different query' : 'Start a new conversation'}
              </span>
            </p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label} className="mb-2">
              <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
                  {group.label}
                </span>
                {!searchQuery && group === grouped[0] && sessions.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                      onClearAll();
                    }}
                    title="Clear all"
                    className="text-[9px] font-black text-zinc-400 hover:text-zinc-500 transition-colors flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-zinc-50"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="space-y-0.5">
                {group.items.map(session => {
                  const isActive = currentSessionId === session.id;
                  const isPinned = pinnedIds.includes(session.id);
                  const isMenuOpen = menuOpenId === session.id;
                  const isRenaming = renamingId === session.id;

                  return (
                    <div
                      key={session.id}
                      className="relative"
                      ref={isMenuOpen ? menuRef : undefined}
                    >
                      <motion.div
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`group/item flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                          isActive
                            ? 'bg-zinc-50 dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300'
                            : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-800 dark:hover:text-zinc-200'
                        }`}
                        onClick={() => handleSelectSession(session.id)}
                      >
                        <div className={`shrink-0 w-1.5 h-1.5 rounded-full transition-colors ${
                          isActive ? 'bg-zinc-500' : isPinned ? 'bg-amber-400' : 'bg-transparent'
                        }`} />

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
                          <span className="flex-1 min-w-0 truncate text-xs font-semibold leading-snug">
                            {session.sessionName}
                          </span>
                        )}

                        {!isRenaming && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setMenuOpenId(isMenuOpen ? null : session.id);
                            }}
                            className={`shrink-0 p-1 rounded-md transition-all ${
                              isMenuOpen
                                ? 'opacity-100 bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                                : 'opacity-60 hover:opacity-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-400'
                            }`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
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
                            className="absolute right-0 top-full mt-1 z-[200] w-44 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-xl shadow-black/10 overflow-hidden"
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => startRename(session)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              <Edit3 className="w-4 h-4 text-zinc-400" /> Rename
                            </button>
                            <button
                              onClick={() => togglePin(session.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                            >
                              {isPinned
                                ? <PinOff className="w-4 h-4 text-amber-500" />
                                : <Pin className="w-4 h-4 text-zinc-400" />}
                              {isPinned ? 'Unpin' : 'Pin'}
                            </button>
                            <div className="mx-3 border-t border-zinc-100 dark:border-zinc-800" />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(session.id);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-950/30 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
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
      </div>

      {/* Footer */}
      <div className="p-4 shrink-0 border-t border-zinc-200 dark:border-zinc-800">
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
            ? "flex h-9 w-9 items-center justify-center rounded-full outline-none transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-zinc-300 dark:focus-visible:ring-zinc-700"
            : "flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
        }
      >
        <UserAvatar
          name={user.username}
          avatarUrl={user.avatarUrl}
          className={
            compact
              ? "h-8 w-8 text-xs shadow-sm"
              : "h-9 w-9 shrink-0 text-xs shadow-sm"
          }
        />

        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-zinc-800 dark:text-zinc-200">
                {user.username}
              </span>
              <span className="block truncate text-[10px] text-zinc-400">
                {user.email}
              </span>
            </span>
            <ChevronRight
              className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
                open ? 'rotate-90' : ''
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
                ? "absolute bottom-0 left-full z-[10000] ml-3 w-[310px] origin-bottom-left overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_55px_rgba(0,0,0,.16)] dark:border-zinc-800 dark:bg-zinc-950"
                : "absolute bottom-[calc(100%+10px)] left-1/2 z-[10000] w-[calc(100vw-32px)] max-w-[310px] -translate-x-1/2 origin-bottom overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-[0_18px_55px_rgba(0,0,0,.16)] dark:border-zinc-800 dark:bg-zinc-950 sm:left-0 sm:w-[310px] sm:max-w-none sm:translate-x-0 sm:origin-bottom-left"
            }
          >
            {/* Account header */}
            <div className="rounded-xl px-3 py-3">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={user.username}
                  avatarUrl={user.avatarUrl}
                  className="h-10 w-10 shrink-0 text-xs shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                    {user.username}
                  </p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {user.email}
                  </p>
                </div>
              </div>
            </div>

            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

            <button
              type="button"
              role="menuitem"
              onClick={goProfile}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <UserCircle2 className="h-[18px] w-[18px] text-zinc-500" />
              <span className="flex-1">Profile</span>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={goSettings}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <Settings2 className="h-[18px] w-[18px] text-zinc-500" />
              <span className="flex-1">Settings</span>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>

            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <LogOut className="h-[18px] w-[18px] text-zinc-500" />
              <span className="flex-1">Log out</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Sidebar export ──────────────────────────────────────────────────────
export default function Sidebar({
  user,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
  onClearAll,
  onLogout,
  onProfile,
  onSettings,
  onDesktopStateChange,
  onClose = () => {},
  mobileOpen = false,
  onMobileClose = () => {},
}: Props) {
  // Start collapsed on every fresh load so the chat interface is shown
  // immediately. The user can expand it with the sidebar icon.
  const [desktopCollapsed, setDesktopCollapsed] = useState(true);
  const [focusSearch, setFocusSearch] = useState(false);
  // Chat.tsx owns the authoritative session collection. Derive the count
  // directly from the prop so it can never become stale or be overwritten by
  // an older backend request.

  useEffect(() => { onDesktopStateChange?.(false); }, [onDesktopStateChange]);

  const expandDesktop = useCallback(() => {
    setDesktopCollapsed(false);
    onDesktopStateChange?.(true);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
    setFocusSearch(false);
  }, [onDesktopStateChange]);

  const expandDesktopToSearch = useCallback(() => {
    setDesktopCollapsed(false);
    onDesktopStateChange?.(true);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
    setFocusSearch(true);
  }, [onDesktopStateChange]);

  const collapseDesktop = useCallback(() => {
    setDesktopCollapsed(true);
    onDesktopStateChange?.(false);
    setFocusSearch(false);
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

  const listProps = {
    user,
    sessions,
    currentSessionId,
    onSelectSession,
    onNewSession,
    onDeleteSession,
    onRenameSession,
    onClearAll,
    onLogout,
      onProfile: handleProfile,
    onSettings: handleSettings,
  };

  return (
    <>
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
          className={`twinkle-sidebar absolute inset-y-0 left-0 z-[9999] w-[min(18rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex flex-col h-[100dvh] overflow-hidden shadow-2xl transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Mobile header: same right-edge control alignment as desktop */}
          <div className="relative flex w-full items-center pl-5 pt-5 pb-3 pr-0 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-transparent rounded-xl flex items-center justify-center p-1.5 shrink-0">
                <StormLogo className="w-full h-full text-zinc-900 dark:text-white" />
              </div>
              <h2 className="text-lg font-medium tracking-tight text-zinc-900/90 dark:text-white/90">
                Twinkle
              </h2>
            </div>

            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center shrink-0">
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="Close sidebar"
                title="Close sidebar"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-zinc-600 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-950 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
              >
                <SidebarControlIcon className="h-6 w-6" />
              </button>

              <div className="absolute left-full top-1/2 ml-3 -translate-y-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap pointer-events-none z-[300] shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
                Close sidebar
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <SessionList
              {...listProps}
              onClose={onMobileClose}
              focusSearchOnMount={false}
            />
          </div>
        </aside>
      </div>

      {/* ═══════════════════════════════════════════════════
          DESKTOP COLLAPSED ICON RAIL  (lg+ only)
      ═══════════════════════════════════════════════════ */}
      {desktopCollapsed && (
        <aside className="twinkle-sidebar hidden lg:flex fixed inset-y-0 left-0 z-[2147483645] w-14 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col items-center py-4 shadow-sm">
          {/* Top brand / sidebar control */}
          <IconTooltip label="Open sidebar">
            <button
              onClick={toggleDesktop}
              aria-label="Open sidebar"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-all"
            >
              <StormLogo className="w-7 h-7 text-black dark:text-white" />
            </button>
          </IconTooltip>

          {/* Same core navigation options as the reference UI */}
          <div className="mt-4 flex flex-col items-center w-full gap-1">
            <IconTooltip label="New Chat">
              <button
                onClick={onNewSession}
                aria-label="New Chat"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all"
              >
                <SquarePen className="w-[19px] h-[19px]" strokeWidth={1.7} />
              </button>
            </IconTooltip>



            <IconTooltip label="Search">
              <button
                onClick={expandDesktopToSearch}
                aria-label="Search"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all"
              >
                <Search className="w-[19px] h-[19px]" strokeWidth={1.7} />
              </button>
            </IconTooltip>

            <IconTooltip label={"Recents"}>
              <button
                onClick={expandDesktop}
                aria-label="Recents"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all"
              >
                <MessageCircle className="w-[19px] h-[19px]" strokeWidth={1.7} />
              </button>
            </IconTooltip>
          </div>

          <div className="flex-1" />

          <IconTooltip label="Toggle theme">
            <ThemeToggleButton className="w-10 h-10 mb-2" />
          </IconTooltip>

          {/* Account menu */}
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
              className="twinkle-sidebar hidden lg:flex fixed inset-y-0 left-0 z-[2147483647] w-[360px] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col h-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Expanded sidebar header: logo/text on the left, close control flush to the right edge */}
              <div className="relative flex w-full items-center pl-5 pt-5 pb-3 pr-0 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-transparent rounded-xl flex items-center justify-center p-1.5 shrink-0">
                    <StormLogo className="w-full h-full text-zinc-900 dark:text-white" />
                  </div>
                  <h2 className="text-xl font-medium tracking-tight text-zinc-900/90 dark:text-white/90">
                    Twinkle
                  </h2>
                </div>

                {/* Explicit right anchoring: the control is positioned from the sidebar's right edge.
                    mr-2 moves it 8px left; adjust to mr-1/mr-3/mr-4 if desired. */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center shrink-0">
                  <button
                    type="button"
                    onClick={collapseDesktop}
                    aria-label="Close sidebar"
                    title="Close sidebar"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-zinc-600 transition-all duration-200 hover:bg-zinc-100 hover:text-zinc-950 active:scale-95 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
                  >
                    <SidebarControlIcon className="h-6 w-6" />
                  </button>

                  <div className="absolute left-full top-1/2 ml-3 -translate-y-1/2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap pointer-events-none z-[300] shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
                    Close sidebar
                  </div>
                </div>
              </div>

              <SessionList
                {...listProps}
                onClose={collapseDesktop}
                focusSearchOnMount={focusSearch}
              />
            </aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
