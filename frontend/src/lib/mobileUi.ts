import { useEffect, useRef, useState, type RefObject } from 'react';

/** Short vibration on supported phones. Silently does nothing elsewhere. */
export const haptic = (ms = 10) => {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch { /* not supported */ }
};

/** True below the `lg` breakpoint (phones and tablets). */
export function useIsMobile(query = '(max-width: 1023px)') {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [value, setValue] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setValue(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return value;
}

/**
 * While `open`, the phone's Back button (or back swipe) closes the layer
 * instead of leaving the chat. One temporary history entry is used per layer.
 */
export function useBackClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const id = `twinkle-layer-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let pushed = false;
    let popped = false;

    // Deferred so React StrictMode's mount/unmount/mount never touches history.
    const timer = window.setTimeout(() => {
      try {
        window.history.pushState({ ...(window.history.state ?? {}), twinkleLayer: id }, '');
        pushed = true;
      } catch { /* history unavailable */ }
    }, 0);

    const onPop = () => {
      if (!pushed || popped) return;
      if (window.history.state?.twinkleLayer === id) return;
      popped = true;
      closeRef.current();
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('popstate', onPop);
      // Closed by a tap rather than Back: drop the temporary entry again.
      if (pushed && !popped && window.history.state?.twinkleLayer === id) window.history.back();
    };
  }, [open]);
}

const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside `ref` while active, handles Escape, and restores focus on close. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape?: () => void) {
  const escRef = useRef(onEscape);
  escRef.current = onEscape;

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const previous = document.activeElement as HTMLElement | null;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));

    const timer = window.setTimeout(() => {
      if (el.contains(document.activeElement)) return;
      (items()[0] ?? el).focus({ preventScroll: true });
    }, 30);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escRef.current) { event.preventDefault(); escRef.current(); return; }
      if (event.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) { event.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [ref, active]);
}

/** Height covered by the on-screen keyboard, so a sheet can sit above it. */
export function useKeyboardInset(active: boolean) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) { setInset(0); return; }
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setInset(0);
    };
  }, [active]);
  return inset;
}
