import { useState, useEffect, useRef, useCallback } from 'react';
import { Session, User } from '../types';
import {
  LogOut, Trash2, X, Search, SquarePen,
  MoreHorizontal, Pin, PinOff, Edit3,
  MessageCircle, Sun, Moon, Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import UserAvatar from './UserAvatar';
import { chatApi } from '../lib/api';
import StormLogo from './StormLogo';

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
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PINNED_KEY = 'nexus_pinned_sessions';
const SIDEBAR_SEEN_KEY = 'nexus_sidebar_seen';

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
function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
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
      setTimeout(() => searchInputRef.current?.focus(), 80);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

        <div className="relative group">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-zinc-400 group-focus-within:text-zinc-500 transition-colors">
            {isSearching
              ? <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              : <Search className="w-3.5 h-3.5" />}
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search chats..."
            className="w-full pl-10 pr-8 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-zinc-400 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => handleSearchChange('')}
              className="absolute inset-y-0 right-3 flex items-center text-zinc-400 hover:text-zinc-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="px-4 pb-2 shrink-0">
        <div className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Chats</div>
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
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group mb-2">
          <UserAvatar
            name={user.username}
            className="w-9 h-9 text-xs shadow-sm group-hover:scale-105 transition-transform shrink-0"
          />
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-black truncate text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
              {user.username}
            </p>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2.5 p-2.5 text-[10px] font-black text-zinc-400 hover:text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-950/30 rounded-xl transition-all uppercase tracking-[0.2em]"
        >
          <LogOut className="w-3.5 h-3.5" /> Logout
        </button>
      </div>
    </>
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
  onClose = () => {},
  mobileOpen = false,
  onMobileClose = () => {},
}: Props) {
  // Start collapsed on every fresh load so the chat interface is shown
  // immediately. The user can expand it with the sidebar icon.
  const [desktopCollapsed, setDesktopCollapsed] = useState(true);
  const [focusSearch, setFocusSearch] = useState(false);

  const expandDesktop = useCallback(() => {
    setDesktopCollapsed(false);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
    setFocusSearch(false);
  }, []);

  const expandDesktopToSearch = useCallback(() => {
    setDesktopCollapsed(false);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
    setFocusSearch(true);
  }, []);

  const collapseDesktop = useCallback(() => {
    setDesktopCollapsed(true);
    setFocusSearch(false);
    onClose();
  }, [onClose]);

  const toggleDesktop = useCallback(() => {
    if (desktopCollapsed) expandDesktop();
    else collapseDesktop();
  }, [desktopCollapsed, expandDesktop, collapseDesktop]);

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
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-transparent rounded-xl flex items-center justify-center p-1.5 shrink-0">
                <StormLogo className="w-full h-full text-zinc-900 dark:text-white" />
              </div>
              <h2 className="text-lg font-medium tracking-tight text-zinc-900/90 dark:text-white/90">Twinkle</h2>
            </div>
            <ThemeToggleButton />
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

            <IconTooltip label={`Chats (${sessions.length})`}>
              <button
                onClick={expandDesktop}
                aria-label="Chats"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-all"
              >
                <MessageCircle className="w-[19px] h-[19px]" strokeWidth={1.7} />
              </button>
            </IconTooltip>
          </div>

          <div className="flex-1" />

          <IconTooltip label="Toggle theme">
            <ThemeToggleButton className="w-10 h-10" />
          </IconTooltip>

          {/* Account option stays at the bottom, like the reference */}
          <IconTooltip label={user.username}>
            <button onClick={expandDesktop} aria-label="Profile">
              <UserAvatar
                name={user.username}
                className="w-8 h-8 text-xs shadow-sm hover:scale-105 transition-transform"
              />
            </button>
          </IconTooltip>
        </aside>
      )}

      {/* ═══════════════════════════════════════════════════
          DESKTOP EXPANDED FULL SIDEBAR  (lg+ only)
      ═══════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {!desktopCollapsed && (
          <>
            <motion.div
              key="desktop-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="hidden lg:block fixed inset-0 z-[2147483646] bg-black/40 backdrop-blur-sm"
              onClick={collapseDesktop}
              aria-hidden="true"
            />
            <aside
              className="twinkle-sidebar hidden lg:flex fixed inset-y-0 left-0 z-[2147483647] w-72 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col h-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
                <button
                  onClick={collapseDesktop}
                  className="flex items-center gap-2.5 group"
                  title="Close sidebar"
                >
                  <div className="w-9 h-9 bg-transparent rounded-xl flex items-center justify-center p-1.5 group-hover:opacity-80 transition-opacity">
                    <StormLogo className="w-full h-full text-zinc-900 dark:text-white" />
                  </div>
                  <h2 className="text-xl font-medium tracking-tight text-zinc-900/90 dark:text-white/90">Twinkle</h2>
                </button>
                <ThemeToggleButton />
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
