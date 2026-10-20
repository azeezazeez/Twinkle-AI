import { useEffect } from 'react';


const TARGET_SELECTOR =
  'button, [role="button"], [role="menuitem"], [role="tab"], [role="switch"], a[href], summary, label[for], input[type="button"], input[type="submit"]';

export default function ClickCircle() {
  useEffect(() => {
    const reduced = () =>
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.motion === 'reduced';

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || reduced()) return;
      const target = (event.target as Element | null)?.closest?.(TARGET_SELECTOR) as HTMLElement | null;
      if (!target) return;
      if ((target as HTMLButtonElement).disabled || target.getAttribute('aria-disabled') === 'true') return;

      const circle = document.createElement('span');
      circle.className = 'twinkle-click-circle';
      circle.setAttribute('aria-hidden', 'true');
      circle.style.left = `${event.clientX}px`;
      circle.style.top = `${event.clientY}px`;
      document.body.appendChild(circle);
      const remove = () => circle.remove();
      circle.addEventListener('animationend', remove, { once: true });
      window.setTimeout(remove, 800);
    };

    document.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true });
    return () => document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, []);

  return null;
}
