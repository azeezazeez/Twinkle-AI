import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { dismissToast, subscribeToasts, type ToastItem } from '../lib/toast';

const MAX_VISIBLE = 3;
const TOAST_MAX_WIDTH = 420;

const MOBILE_QUERY = '(max-width: 639px)';
// PC / laptop screens: toasts are pinned to the exact bottom-right corner here.
const DESKTOP_QUERY = '(min-width: 1024px)';

function useMediaQuery(queryString: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(queryString).matches
  );
  useEffect(() => {
    const query = window.matchMedia(queryString);
    const sync = () => setMatches(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, [queryString]);
  return matches;
}

function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY);
}

function useIsDesktop() {
  return useMediaQuery(DESKTOP_QUERY);
}

function ToastCard({ item, fromTop }: { item: ToastItem; fromTop: boolean }) {
  const reduceMotion = useReducedMotion();
  const timerRef = useRef<number | null>(null);
  const remainingRef = useRef(item.duration);
  const startedRef = useRef(0);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = useCallback(() => {
    clear();
    if (remainingRef.current <= 0) return;
    startedRef.current = Date.now();
    timerRef.current = window.setTimeout(() => dismissToast(item.id), remainingRef.current);
  }, [item.id]);

  const pause = () => {
    if (timerRef.current === null) return;
    remainingRef.current -= Date.now() - startedRef.current;
    clear();
  };

  // (Re)start whenever the same toast is triggered again.
  useEffect(() => {
    remainingRef.current = item.duration;
    start();
    return clear;
  }, [item.stamp, item.duration, start]);

  const Icon = item.kind === 'success' ? CheckCircle2 : item.kind === 'error' ? AlertCircle : Info;
  const iconColor =
    item.kind === 'success'
      ? 'text-emerald-600 dark:text-emerald-400'
      : item.kind === 'error'
        ? 'text-red-600 dark:text-red-400'
        : 'text-zinc-600 dark:text-zinc-300';

  return (
    <motion.div
      layout
      role={item.kind === 'error' ? 'alert' : 'status'}
      aria-live={item.kind === 'error' ? 'assertive' : 'polite'}
      initial={reduceMotion ? { opacity: 0 } : fromTop ? { opacity: 0, y: -24, scale: 0.97 } : { opacity: 0, x: 24, scale: 0.97 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0, transition: { duration: 0.1 } } : fromTop ? { opacity: 0, y: -24, scale: 0.97, transition: { duration: 0.16 } } : { opacity: 0, x: 24, scale: 0.97, transition: { duration: 0.16 } }}
      transition={reduceMotion ? { duration: 0.12 } : { type: 'spring', stiffness: 420, damping: 34 }}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
      onTouchStart={pause}
      onTouchEnd={start}
      className="pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white py-3 pl-4 pr-3 text-[15px] leading-snug text-zinc-900 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#30302E] dark:text-zinc-100 dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)] sm:py-3.5 sm:pl-5"
    >
      <Icon className={`h-[18px] w-[18px] shrink-0 ${iconColor}`} strokeWidth={1.9} aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words font-medium">{item.message}</p>
      {item.action && (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            dismissToast(item.id);
          }}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-[14px] font-semibold text-zinc-900 transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-100 dark:hover:bg-white/10"
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(item.id)}
        aria-label="Close notification"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
      >
        <X className="h-4 w-4" strokeWidth={2} />
      </button>
    </motion.div>
  );
}

/** Renders every toast. Mount once, near the root of the app. */
export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  // On PC / laptop screens toasts always sit in the bottom-right corner. On
  // in-between (tablet) widths they are still lifted above the chat message
  // box when the two would actually overlap.
  const [composerLift, setComposerLift] = useState(0);
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (items.length === 0 || isMobile || isDesktop) {
      setComposerLift(0);
      return;
    }
    const measure = () => {
      const composer = document.querySelector<HTMLElement>('.twinkle-composer-shell, .chat-composer-shell');
      if (!composer) { setComposerLift(0); return; }
      const rect = composer.getBoundingClientRect();
      const visible = rect.height > 0 && rect.top < window.innerHeight && rect.bottom > 0;
      const margin = window.innerWidth >= 640 ? 24 : 12;
      const toastLeft = Math.max(margin, window.innerWidth - margin - TOAST_MAX_WIDTH);
      const overlapsHorizontally = rect.right > toastLeft && rect.left < window.innerWidth;
      setComposerLift(visible && overlapsHorizontally ? Math.max(0, Math.round(window.innerHeight - rect.top + 8)) : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [items.length, isMobile, isDesktop]);

  useEffect(
    () =>
      subscribeToasts(event => {
        if (event.type === 'dismiss') {
          setItems(prev => prev.filter(entry => entry.id !== event.id));
          return;
        }
        setItems(prev => {
          const exists = prev.some(entry => entry.id === event.item.id);
          const next = exists
            ? prev.map(entry => (entry.id === event.item.id ? event.item : entry))
            : [...prev, event.item];
          return next.slice(-MAX_VISIBLE);
        });
      }),
    []
  );

  if (typeof document === 'undefined') return null;

  // Toasts are anchored to the right edge, like Claude's own notifications. On
  // narrow screens they span the width so they never overflow.
  return createPortal(
    <div
      aria-label="Notifications"
      className={`pointer-events-none fixed inset-x-0 z-[2147483647] flex flex-col gap-2 px-3 sm:px-6 ${
        isMobile
          ? 'top-0 items-center pt-[calc(env(safe-area-inset-top)+12px)]'
          : 'bottom-0 items-end pb-[calc(env(safe-area-inset-bottom)+24px)]'
      }`}
      style={!isMobile && !isDesktop && composerLift > 0 ? { paddingBottom: composerLift } : undefined}
    >
      <div className="flex w-full max-w-[420px] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map(item => (
            <ToastCard key={item.id} item={item} fromTop={isMobile} />
          ))}
        </AnimatePresence>
      </div>
    </div>,
    document.body
  );
}
