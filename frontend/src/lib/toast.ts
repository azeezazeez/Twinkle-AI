export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  kind?: ToastKind;
  /** Milliseconds before auto-dismiss. Use 0 to keep it until closed. */
  duration?: number;
  action?: ToastAction;
  /** Same id replaces the visible toast instead of stacking a duplicate. */
  id?: string;
}

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
  duration: number;
  action?: ToastAction;
  /** Bumped when the same toast is re-triggered so its timer restarts. */
  stamp: number;
}

type Listener = (event: { type: 'show'; item: ToastItem } | { type: 'dismiss'; id: string }) => void;

const listeners = new Set<Listener>();
let counter = 0;

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: string): void {
  listeners.forEach(listener => listener({ type: 'dismiss', id }));
}

function show(message: string, options: ToastOptions = {}): string {
  const kind = options.kind ?? 'info';
  const item: ToastItem = {
    id: options.id ?? `${kind}:${message}`,
    message,
    kind,
    duration: options.duration ?? (kind === 'error' ? 6000 : 4000),
    action: options.action,
    stamp: ++counter,
  };
  listeners.forEach(listener => listener({ type: 'show', item }));
  return item.id;
}

type Helper = (message: string, options?: Omit<ToastOptions, 'kind'>) => string;

interface ToastFn {
  (message: string, options?: ToastOptions): string;
  info: Helper;
  success: Helper;
  error: Helper;
  dismiss: (id: string) => void;
}

export const toast: ToastFn = Object.assign(
  (message: string, options?: ToastOptions) => show(message, options),
  {
    info: ((message, options) => show(message, { ...options, kind: 'info' })) as Helper,
    success: ((message, options) => show(message, { ...options, kind: 'success' })) as Helper,
    error: ((message, options) => show(message, { ...options, kind: 'error' })) as Helper,
    dismiss: dismissToast,
  }
);
