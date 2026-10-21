import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useMotionValue, useTransform } from 'motion/react';
import { haptic, useBackClose, useFocusTrap, useKeyboardInset } from '../lib/mobileUi';

const TOP_LAYER = 2147483647;

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name of the sheet. */
  label: string;
  /** Lift the sheet above the on-screen keyboard (for sheets with an input). */
  keyboardAware?: boolean;
  children: ReactNode;
}


export default function BottomSheet({ open, onClose, label, keyboardAware = false, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const controls = useDragControls();
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 320], [1, 0]);
  const inset = useKeyboardInset(open && keyboardAware);

  useBackClose(open, onClose);
  useFocusTrap(sheetRef, open, onClose);

  useEffect(() => {
    if (!open) return;
    haptic(8);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-root"
          className="fixed inset-0"
          style={{ zIndex: TOP_LAYER }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1, transition: { duration: 0.25 } }}
        >
          <motion.div
            className="absolute inset-0 bg-black/50"
            style={{ opacity: backdropOpacity }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            style={{ y, bottom: inset }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag="y"
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragMomentum={false}
            onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 500) { haptic(6); onClose(); } }}
            className="absolute inset-x-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-[24px] bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.18)] outline-none dark:bg-zinc-900"
          >
            {/* Drag handle: only this strip starts a drag, so inputs and scrolling still work. */}
            <div
              className="sticky top-0 z-10 -mx-4 flex h-7 cursor-grab touch-none items-center justify-center bg-white dark:bg-zinc-900"
              onPointerDown={event => controls.start(event)}
              aria-hidden="true"
            >
              <div className="h-1 w-9 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}

/** Large, touch-friendly row for sheets. */
export function SheetItem({
  icon, label, danger = false, trailing, onClick,
}: { icon: ReactNode; label: string; danger?: boolean; trailing?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => { haptic(10); onClick(); }}
      className={`flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[16px] leading-5 transition-colors focus-visible:outline-none ${
        danger
          ? 'text-[#B53333] active:bg-[#B53333]/10 focus-visible:bg-[#B53333]/10 dark:text-[#F2877E] dark:active:bg-[#F2877E]/10'
          : 'text-zinc-800 active:bg-zinc-100 focus-visible:bg-zinc-100 dark:text-zinc-100 dark:active:bg-zinc-800 dark:focus-visible:bg-zinc-800'
      }`}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

export function SheetDivider() {
  return <div role="separator" className="mx-2 my-1 h-px bg-zinc-200 dark:bg-zinc-700/70" />;
}

/** Rename dialog for phones: a sheet that sits above the on-screen keyboard. */
export function RenameSheet({
  open, value, onChange, onSubmit, onCancel,
}: { open: boolean; value: string; onChange: (value: string) => void; onSubmit: () => void; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onCancel} label="Rename chat" keyboardAware>
      <form onSubmit={event => { event.preventDefault(); if (value.trim()) { haptic(10); onSubmit(); } }} className="pb-1">
        <label htmlFor="twinkle-rename-input" className="mb-2 block px-1 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
          Rename chat
        </label>
        <input
          id="twinkle-rename-input"
          ref={inputRef}
          value={value}
          onChange={event => onChange(event.target.value)}
          maxLength={120}
          enterKeyHint="done"
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-zinc-300 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-400/30 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-11 flex-1 rounded-xl border border-zinc-300 text-[15px] font-medium text-zinc-800 active:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-100 dark:active:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!value.trim()}
            className="h-11 flex-1 rounded-xl bg-zinc-900 text-[15px] font-medium text-white active:opacity-90 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Save
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
