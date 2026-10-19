import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';


const SELECTOR = '[data-tooltip],[title]';
const SHOW_DELAY_MS = 150;
const GAP = 8;
const VIEWPORT_PAD = 8;

type Side = 'top' | 'bottom' | 'left' | 'right';

function canHover() {
  return typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
}

export default function GlobalTooltip() {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  const kbdRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const tip = tipRef.current;
    const textEl = textRef.current;
    const kbdEl = kbdRef.current;
    if (!tip || !textEl || !kbdEl) return;

    let current: HTMLElement | null = null;
    let stolenTitle: string | null = null;
    let timer: number | undefined;

    const restoreTitle = () => {
      if (current && stolenTitle !== null && !current.hasAttribute('title')) {
        current.setAttribute('title', stolenTitle);
      }
      stolenTitle = null;
    };

    const hide = () => {
      window.clearTimeout(timer);
      tip.classList.remove('is-visible');
      restoreTitle();
      current = null;
    };

    const place = (target: HTMLElement, preferred: Side) => {
      const r = target.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let side = preferred;
      if (side === 'top' && r.top - h - GAP < VIEWPORT_PAD) side = 'bottom';
      else if (side === 'bottom' && r.bottom + h + GAP > vh - VIEWPORT_PAD) side = 'top';
      else if (side === 'left' && r.left - w - GAP < VIEWPORT_PAD) side = 'right';
      else if (side === 'right' && r.right + w + GAP > vw - VIEWPORT_PAD) side = 'left';

      let left: number;
      let top: number;
      if (side === 'top' || side === 'bottom') {
        left = r.left + r.width / 2 - w / 2;
        top = side === 'top' ? r.top - h - GAP : r.bottom + GAP;
      } else {
        top = r.top + r.height / 2 - h / 2;
        left = side === 'left' ? r.left - w - GAP : r.right + GAP;
      }
      left = Math.min(Math.max(left, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, vw - w - VIEWPORT_PAD));
      top = Math.min(Math.max(top, VIEWPORT_PAD), Math.max(VIEWPORT_PAD, vh - h - VIEWPORT_PAD));

      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      tip.dataset.side = side;
    };

    const show = (target: HTMLElement) => {
      if (!target.isConnected) return;
      if (target.getAttribute('aria-expanded') === 'true') return; // open menus/pickers own the focus

      let text = target.getAttribute('data-tooltip');
      const nativeTitle = target.getAttribute('title');
      if (nativeTitle !== null) {
        // Suppress the browser's own tooltip and use ours instead.
        stolenTitle = nativeTitle;
        target.removeAttribute('title');
        if (nativeTitle.trim()) text = nativeTitle;
      }
      if (!text || !text.trim()) {
        restoreTitle();
        return;
      }

      textEl.textContent = text;
      const shortcut = target.getAttribute('data-tooltip-shortcut');
      kbdEl.textContent = shortcut || '';
      kbdEl.style.display = shortcut ? '' : 'none';

      const side = (target.getAttribute('data-tooltip-side') as Side) || 'top';
      tip.style.left = '0px';
      tip.style.top = '0px';
      place(target, side);
      tip.classList.add('is-visible');
    };

    const schedule = (target: HTMLElement) => {
      window.clearTimeout(timer);
      // Already showing something? Switch immediately (feels instant while scanning icons).
      const delay = tip.classList.contains('is-visible') ? 0 : SHOW_DELAY_MS;
      timer = window.setTimeout(() => show(target), delay);
    };

    const onOver = (event: MouseEvent) => {
      if (!canHover()) return;
      const el = (event.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (el === current) return;
      if (current) hide();
      if (!el) return;
      if (el.closest('[data-no-tooltip]')) return;
      current = el;
      schedule(el);
    };

    const onFocusIn = (event: FocusEvent) => {
      const el = (event.target as Element | null)?.closest?.(SELECTOR) as HTMLElement | null;
      if (!el || !(el as HTMLElement).matches(':focus-visible')) return;
      if (current) hide();
      current = el;
      show(el);
    };

    const onOut = (event: MouseEvent) => {
      if (!current) return;
      const to = event.relatedTarget as Node | null;
      if (to && current.contains(to)) return;
      hide();
    };

    const onDismiss = () => { if (current) hide(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onDismiss(); };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onDismiss, true);
    document.addEventListener('mousedown', onDismiss, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onDismiss, true);
    document.addEventListener('wheel', onDismiss, { capture: true, passive: true });
    window.addEventListener('resize', onDismiss);
    window.addEventListener('blur', onDismiss);
    document.documentElement.addEventListener('mouseleave', onDismiss);

    return () => {
      hide();
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onDismiss, true);
      document.removeEventListener('mousedown', onDismiss, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onDismiss, true);
      document.removeEventListener('wheel', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
      window.removeEventListener('blur', onDismiss);
      document.documentElement.removeEventListener('mouseleave', onDismiss);
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div ref={tipRef} role="tooltip" className="twinkle-tip" data-no-translate>
      <span ref={textRef} />
      <kbd ref={kbdRef} className="twinkle-tip-kbd" style={{ display: 'none' }} />
    </div>,
    document.body
  );
}
