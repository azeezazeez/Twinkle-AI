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
