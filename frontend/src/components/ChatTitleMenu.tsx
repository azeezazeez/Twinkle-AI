import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Eye, EyeOff, Pencil, PinOff, Trash2, Upload } from 'lucide-react';
import FileDocIcon from './FileDocIcon';
import { motion } from 'motion/react';

// Same storage the sidebar uses, so pinning here and there stays in sync.
const PINNED_KEY = 'Twinkle_pinned_sessions';
const PINNED_CHANGED_EVENT = 'twinkle:pinned-sessions-changed';
const UNREAD_KEY = 'Twinkle_unread_sessions';
const UNREAD_CHANGED_EVENT = 'twinkle:unread-sessions-changed';
const loadUnread = (): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(UNREAD_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
};
const saveUnread = (ids: number[]) => {
  try { localStorage.setItem(UNREAD_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
};
const TOP_LAYER = 2147483647;

// Same surface as the sidebar's chat options menu, so both popups match.
const MENU_SURFACE =
  'rounded-xl border border-zinc-300/70 bg-white p-1.5 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_8px_30px_rgba(0,0,0,0.45)]';

// Exact same Pin icon the sidebar menu uses.
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

function Item({
  icon, label, shortcut, danger = false, large = false, onClick,
}: { icon: ReactNode; label: string; shortcut?: string; danger?: boolean; large?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex ${large ? 'h-12 text-[16px]' : 'h-9 text-[14px]'} w-full items-center gap-3 rounded-lg px-3 text-left leading-5 transition-colors focus-visible:outline-none ${
        danger
          ? 'text-[#B53333] hover:bg-[#B53333]/10 focus-visible:bg-[#B53333]/10 dark:text-[#F2877E] dark:hover:bg-[#F2877E]/10'
          : 'text-zinc-800 hover:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800'
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && !large && <span className="ml-2 shrink-0 text-[12px] font-normal text-zinc-400 dark:text-zinc-500">{shortcut}</span>}
    </button>
  );
}

interface Props {
  sessionId: number;
  title: string;
  /** True while the assistant is still producing a reply in this chat. */
  responding?: boolean;
  onRename: (id: number, name: string) => void;
  onShare: (id: number) => void;
  onDelete: (id: number) => void;
}

/**
 * Chat name shown at the top-left of the chat area. A down arrow opens the
 * chat options (pin, rename, share, delete); hovering shows a tooltip.
 */
export default function ChatTitleMenu({ sessionId, title, responding = false, onRename, onShare, onDelete }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const tipTimer = useRef<number | null>(null);

  const [pinned, setPinned] = useState<number[]>(loadPinned);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');

  const isPinned = pinned.includes(sessionId);
  const [unread, setUnread] = useState<number[]>(loadUnread);
  const isUnread = unread.includes(sessionId);
  useEffect(() => {
    const sync = () => setUnread(loadUnread());
    window.addEventListener(UNREAD_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(UNREAD_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Phones/tablets (below the lg breakpoint) get a bottom sheet instead of a popover.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const sync = () => setPinned(loadPinned());
    window.addEventListener(PINNED_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PINNED_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // A different chat: close anything that belonged to the previous one.
  useEffect(() => {
    setMenuOpen(false);
    setRenaming(false);
    setTip(null);
  }, [sessionId]);

  const clearTip = () => {
    if (tipTimer.current !== null) { window.clearTimeout(tipTimer.current); tipTimer.current = null; }
    setTip(null);
  };
  useEffect(() => clearTip, []);

  const showTip = () => {
    if (menuOpen || renaming || !arrowRef.current) return;
    // Touch screens have no hover; a tooltip there would only flash on tap.
    if (typeof window.matchMedia === 'function' && !window.matchMedia('(hover: hover)').matches) return;
    if (tipTimer.current !== null) window.clearTimeout(tipTimer.current);
    const rect = arrowRef.current.getBoundingClientRect();
    tipTimer.current = window.setTimeout(() => {
      setTip({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
    }, 350);
  };

  const closeMenu = () => setMenuOpen(false);

  const openMenu = () => {
    clearTip();
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 8, left: rect.left });
    setMenuOpen(true);
  };

  // Keep the menu inside the viewport once its size is known.
  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !menuPos) return;
    const width = menuRef.current.offsetWidth;
    const maxLeft = window.innerWidth - width - 8;
    if (menuPos.left > maxLeft) setMenuPos({ ...menuPos, left: Math.max(8, maxLeft) });
  }, [menuOpen, menuPos]);

  const togglePin = () => {
    const next = isPinned ? pinned.filter(id => id !== sessionId) : [...pinned, sessionId];
    setPinned(next);
    savePinned(next);
    closeMenu();
  };

  const toggleUnread = () => {
    const next = isUnread ? unread.filter(id => id !== sessionId) : [...unread, sessionId];
    setUnread(next);
    saveUnread(next);
    closeMenu();
  };

  const startRename = () => {
    setDraft(title);
    setRenaming(true);
    closeMenu();
  };

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== title) onRename(sessionId, next);
    setRenaming(false);
  };

  const handleShare = () => { closeMenu(); onShare(sessionId); };

  const handleDelete = () => {
    closeMenu();
    onDelete(sessionId);
    const next = pinned.filter(id => id !== sessionId);
    setPinned(next);
    savePinned(next);
  };

  useEffect(() => {
    if (renaming) {
      const timer = window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
      return () => window.clearTimeout(timer);
    }
  }, [renaming]);

  // Outside click, Escape, and the P / R / D shortcuts shown in the menu.
  const actions = useRef({ togglePin, startRename, handleDelete, toggleUnread });
  actions.current = { togglePin, startRename, handleDelete, toggleUnread };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || wrapRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p') { event.preventDefault(); actions.current.togglePin(); }
      else if (key === 'u') { event.preventDefault(); actions.current.toggleUnread(); }
      else if (key === 'r') { event.preventDefault(); actions.current.startRename(); }
      else if (key === 'd') { event.preventDefault(); actions.current.handleDelete(); }
    };
    const dismiss = () => setMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    if (!isMobile) window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', dismiss);
    };
  }, [menuOpen, isMobile]);

  if (renaming) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); commitRename(); }
          if (event.key === 'Escape') { event.preventDefault(); setRenaming(false); }
          event.stopPropagation();
        }}
        onBlur={commitRename}
        maxLength={120}
        aria-label="Rename chat"
        className="h-9 w-[min(420px,100%)] rounded-lg border border-zinc-400 bg-white px-3 text-[15px] text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
      />
    );
  }

  return (
    <>
      <div
        ref={wrapRef}
        className={`group/title flex h-9 max-w-full items-center rounded-lg transition-colors ${
          menuOpen ? 'bg-zinc-200/70 dark:bg-zinc-800' : 'hover:bg-zinc-200/60 dark:hover:bg-zinc-800'
        }`}
      >
        {/* Clicking the name itself starts renaming. */}
        <button
          type="button"
          onClick={startRename}
          aria-label={`Rename ${title}`}
          data-tooltip="Rename chat"
          data-tooltip-shortcut="R"
          data-tooltip-side="bottom"
          className="flex h-9 min-w-0 items-center rounded-l-lg pl-2.5 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50"
        >
          <span className="min-w-0 truncate text-[15px] font-normal text-zinc-900 dark:text-zinc-100">{title}</span>
        </button>

        {/* Status: brand-colour dot while replying or when marked unread, otherwise the file icon. */}
        <span
          data-tooltip={responding ? 'Responding…' : isUnread ? 'Unread' : 'Chat ready'}
          data-tooltip-side="bottom"
          role="img"
          aria-label={responding ? 'Responding' : isUnread ? 'Unread' : 'Chat ready'}
          className="flex h-9 shrink-0 items-center px-1.5"
        >
          {responding || isUnread ? (
            <span className={`h-2 w-2 rounded-full bg-[var(--brand-primary)] ${responding ? 'animate-pulse' : ''}`} />
          ) : (
            <FileDocIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" strokeWidth={1.8} />
          )}
        </span>

        {/* Only the arrow opens the options menu and shows the tooltip. */}
        <button
          ref={arrowRef}
          type="button"
          onClick={() => (menuOpen ? closeMenu() : openMenu())}
          onMouseEnter={showTip}
          onMouseLeave={clearTip}
          onMouseDown={clearTip}
          aria-label={`More options for ${title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-9 shrink-0 items-center rounded-r-lg pl-1 pr-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50"
        >
          <ChevronDown className="h-4 w-4 text-zinc-500 dark:text-zinc-400" strokeWidth={1.8} />
        </button>
      </div>

      {tip && !menuOpen && createPortal(
        <div
          role="tooltip"
          className="twinkle-tip is-visible"
          style={{ left: Math.min(Math.max(tip.x, 148), window.innerWidth - 148), top: tip.y, transform: 'translateX(-50%)', zIndex: TOP_LAYER }}
        >
          More options for {title}
        </div>,
        document.body
      )}

      {menuOpen && isMobile && createPortal(
        <div className="fixed inset-0" style={{ zIndex: TOP_LAYER }}>
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            onClick={closeMenu}
          />
          <motion.div
            ref={menuRef}
            role="menu"
            aria-label="Chat options"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 500) closeMenu(); }}
            className="absolute inset-x-0 bottom-0 rounded-t-[24px] bg-white px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] dark:bg-zinc-900"
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden="true" />
            <Item large
              icon={isPinned ? <PinOff className="h-5 w-5" strokeWidth={1.7} /> : <SidebarPinIcon className="h-5 w-5" />}
              label={isPinned ? 'Unpin' : 'Pin'}
              onClick={togglePin}
            />
            <Item large icon={isUnread ? <Eye className="h-5 w-5" strokeWidth={1.7} /> : <EyeOff className="h-5 w-5" strokeWidth={1.7} />} label={isUnread ? 'Mark as read' : 'Mark as unread'} onClick={toggleUnread} />
            <Item large icon={<Pencil className="h-5 w-5" strokeWidth={1.7} />} label="Rename" onClick={startRename} />
            <Item large icon={<Upload className="h-5 w-5" strokeWidth={1.7} />} label="Share chat" onClick={handleShare} />
            <div role="separator" className="mx-2 my-1 h-px bg-zinc-200 dark:bg-zinc-700/70" />
            <Item large icon={<Trash2 className="h-5 w-5" strokeWidth={1.7} />} label="Delete" danger onClick={handleDelete} />
          </motion.div>
        </div>,
        document.body
      )}

      {menuOpen && !isMobile && menuPos && createPortal(
        <motion.div
          ref={menuRef}
          role="menu"
          aria-label="Chat options"
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className={`fixed w-48 ${MENU_SURFACE}`}
          style={{ top: menuPos.top, left: menuPos.left, transformOrigin: 'top left', zIndex: TOP_LAYER }}
        >
          <Item
            icon={isPinned ? <PinOff className="h-4 w-4" strokeWidth={1.7} /> : <SidebarPinIcon className="h-4 w-4" />}
            label={isPinned ? 'Unpin' : 'Pin'}
            shortcut="P"
            onClick={togglePin}
          />
          <Item icon={isUnread ? <Eye className="h-4 w-4" strokeWidth={1.7} /> : <EyeOff className="h-4 w-4" strokeWidth={1.7} />} label={isUnread ? 'Mark as read' : 'Mark as unread'} shortcut="U" onClick={toggleUnread} />
          <Item icon={<Pencil className="h-4 w-4" strokeWidth={1.7} />} label="Rename" shortcut="R" onClick={startRename} />
          <Item icon={<Upload className="h-4 w-4" strokeWidth={1.7} />} label="Share chat" onClick={handleShare} />
          <div role="separator" className="mx-2 my-1 h-px bg-zinc-200 dark:bg-zinc-700/70" />
          <Item icon={<Trash2 className="h-4 w-4" strokeWidth={1.7} />} label="Delete" shortcut="D" danger onClick={handleDelete} />
        </motion.div>,
        document.body
      )}
    </>
  );
}
