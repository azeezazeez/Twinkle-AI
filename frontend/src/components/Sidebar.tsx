import { useState, useEffect, useRef, useCallback, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Session, User } from '../types';
import {
  LogOut, Trash2, X, Search, SquarePen,
  MoreHorizontal, Pin, PinOff,
  MessageCircle, Pencil, Upload,
  Settings2, UserCircle2, ChevronRight, PanelLeft,
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
      <div className="absolute left-full ml-3 px-3 py-1.5 bg-zinc-900 text-white text-[13px] font-semibold rounded-full whitespace-nowrap pointer-events-none z-[300] shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        {label}
        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-900" />
      </div>
    </div>
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
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [menuPlacement, setMenuPlacement] = useState<'up' | 'down'>('down');
  const menuRef = useRef<HTMLDivElement>(null);

  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [pinnedIds, setPinnedIds] = useState<number[]>(loadPinnedIds);

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
      <div className="p-4 pb-2 shrink-0">
        <button
          type="button"
          onClick={() => { onNewSession(); onClose(); }}
          aria-label="New chat"
          className="group/newchat w-full h-12 px-2.5 bg-transparent text-zinc-900 dark:text-zinc-100 rounded-xl flex items-center gap-3 text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors active:bg-zinc-100 dark:active:bg-zinc-800"
        >
          <span className="twinkle-newchat-box shrink-0 flex h-8 w-8 items-center justify-center rounded-lg" aria-hidden="true">
            <SquarePen className="twinkle-newchat-icon w-[22px] h-[22px] text-zinc-900 dark:text-zinc-100" strokeWidth={1.7} />
          </span>
          <span className="text-[17px] font-normal tracking-tight">New chat</span>
        </button>

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
              <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">
                  {group.label}
                </span>
                {group === grouped[0] && sessions.length > 0 && (
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
                          <div
                            className={`shrink-0 flex items-center gap-0.5 transition-opacity ${
                              isMenuOpen || isActive
                                ? 'opacity-100'
                                : 'opacity-0 group-hover/item:opacity-100'
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
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                togglePin(session.id);
                              }}
                              aria-label={isPinned ? 'Unpin chat' : 'Pin chat'}
                              title={isPinned ? 'Unpin' : 'Pin'}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 transition-colors"
                            >
                              {isPinned ? (
                                <PinOff className="w-[17px] h-[17px]" strokeWidth={1.8} />
                              ) : (
                                <Pin className="w-[17px] h-[17px]" strokeWidth={1.8} />
                              )}
                            </button>

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
                                <Pin className="w-[20px] h-[20px] text-zinc-800 dark:text-zinc-200" strokeWidth={1.8} />
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
                              <Trash2 className="w-[20px] h-[20px]" strokeWidth={1.8} />
                              <span>Delete</span>
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
                ? "absolute bottom-0 left-1/2 z-[10000] ml-0 w-[290px] max-w-[calc(100vw-24px)] -translate-x-1/2 origin-bottom-left overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_18px_55px_rgba(0,0,0,.16)] dark:border-zinc-800 dark:bg-zinc-950 sm:left-full sm:ml-3 sm:translate-x-0"
                : "absolute bottom-[calc(100%+10px)] left-1/2 z-[10000] w-[290px] max-w-[calc(100vw-24px)] -translate-x-1/2 origin-bottom-left overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_18px_55px_rgba(0,0,0,.16)] dark:border-zinc-800 dark:bg-zinc-950 sm:left-0 sm:translate-x-0"
            }
          >
            {/* Account header */}
            <div className="rounded-xl px-2.5 py-2.5">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={user.username}
                  avatarUrl={user.avatarUrl}
                  className="h-9 w-9 shrink-0 text-xs shadow-sm"
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
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <UserCircle2 className="h-[18px] w-[18px] text-zinc-500" />
              <span className="flex-1">Profile</span>
              <ChevronRight className="h-4 w-4 text-zinc-400" />
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={goSettings}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
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
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
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
        className="relative z-10 flex h-[min(620px,76vh)] w-full max-w-[970px] flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.16)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_24px_70px_rgba(0,0,0,0.45)]"
      >
        <div className="flex shrink-0 items-center border-b border-zinc-100 px-7 py-5 dark:border-zinc-800">
          <Search className="mr-4 h-[21px] w-[21px] text-zinc-400" strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search..."
            type="search"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[18px] font-normal text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="ml-4 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
                  <span className="min-w-0 flex-1 truncate text-[17px] font-normal text-zinc-900 dark:text-zinc-100">
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
      const stored = Number(localStorage.getItem('Twinkle_sidebar_width'));
      return Number.isFinite(stored) ? Math.min(440, Math.max(280, stored)) : 360;
    } catch {
      return 360;
    }
  });
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const resizingRef = useRef(false);

  useEffect(() => {
    onDesktopWidthChange?.(desktopWidth);
  }, [desktopWidth, onDesktopWidthChange]);

  const handleResizeStart = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizingRef.current = true;
    const startX = event.clientX;
    const startWidth = desktopWidth;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!resizingRef.current) return;
      const nextWidth = Math.min(440, Math.max(280, startWidth + (moveEvent.clientX - startX)));
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
    setDesktopCollapsed(false);
    onDesktopStateChange?.(true);
    localStorage.setItem(SIDEBAR_SEEN_KEY, '1');
  }, [onDesktopStateChange]);

  const collapseDesktop = useCallback(() => {
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
    setDesktopCollapsed(true);
    onDesktopStateChange?.(false);
    onMobileClose?.();
    onClose();
  }, [onClose, onDesktopStateChange, onMobileClose]);

  const listProps = {
    user,
    sessions,
    currentSessionId,
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
            <div className="flex items-center gap-2 shrink-0">
              <motion.button
                type="button"
                onClick={openSearch}
                aria-label="Search chats"
                title="Search chats"
                className="group/search flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-none"
              >
                <Search className="twinkle-search-icon h-[19px] w-[19px]" strokeWidth={1.8} />
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
        <aside className="twinkle-sidebar hidden lg:flex fixed inset-y-0 left-0 z-[2147483645] w-14 bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col items-center py-4 shadow-sm">
          {/* Top brand / sidebar control */}
          <IconTooltip label="Open sidebar">
            <button
              onClick={toggleDesktop}
              aria-label="Open sidebar"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-none"
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
                className="group/newchat w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-none"
              >
                <SquarePen className="twinkle-newchat-icon w-[19px] h-[19px]" strokeWidth={1.7} />
              </button>
            </IconTooltip>



            <IconTooltip label="Search">
              <button
                onClick={openSearch}
                aria-label="Search"
                className="group/search w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-none"
              >
                <Search className="twinkle-search-icon w-[19px] h-[19px]" strokeWidth={1.7} />
              </button>
            </IconTooltip>

            <IconTooltip label="Recents">
              <button
                onClick={expandDesktop}
                aria-label="Chats"
                className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-none"
              >
                <MessageCircle className="w-[19px] h-[19px]" strokeWidth={1.7} />
              </button>
            </IconTooltip>
          </div>

          <div className="flex-1" />

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
              className="twinkle-sidebar hidden lg:flex fixed inset-y-0 left-0 z-[2147483647] bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 flex-col h-full shadow-2xl"
              style={{ width: `${desktopWidth}px` }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-2 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 bg-transparent rounded-xl flex items-center justify-center p-1.5 shrink-0">
                    <StormLogo className="w-full h-full text-zinc-900 dark:text-white" />
                  </div>
                  <h2 className="text-xl font-medium tracking-tight text-zinc-900/90 dark:text-white/90">Twinkle</h2>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <motion.button
                    type="button"
                    onClick={openSearch}
                    aria-label="Search chats"
                    title="Search chats"
                    className="group/search flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200 transition-none"
                  >
                    <Search className="twinkle-search-icon h-[19px] w-[19px]" strokeWidth={1.8} />
                  </motion.button>

                  <div className="relative group/close">
                  <motion.button
                    type="button"
                    onClick={collapseDesktop}
                    aria-label="Close sidebar"
                    title="Close sidebar"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none
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

              <SessionList
                {...listProps}
                onClose={collapseDesktop}
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
