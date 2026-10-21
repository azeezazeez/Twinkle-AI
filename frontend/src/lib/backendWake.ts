import { toast } from './toast';



const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const HEALTH_URL = `${API_BASE}/health`;
const SLOW_AFTER_MS = 3000;
const KEEP_ALIVE_MS = 10 * 60 * 1000;
const WAKE_TOAST_ID = 'backend-waking';

let started = false;

async function ping(timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(HEALTH_URL, { cache: 'no-store', signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function wakeUp(): Promise<void> {
  let slow = false;
  const slowTimer = window.setTimeout(() => {
    slow = true;
    toast.info('Waking up the server, this can take up to a minute…', { id: WAKE_TOAST_ID, duration: 0 });
  }, SLOW_AFTER_MS);

  let ok = await ping(70_000);
  if (!ok) ok = await ping(70_000); // one retry for a cold start that raced the first call

  window.clearTimeout(slowTimer);
  if (slow) {
    toast.dismiss(WAKE_TOAST_ID);
    if (ok) toast.success('Server is ready', { duration: 2000 });
  }
}

export function startBackendWake(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void wakeUp();

  window.setInterval(() => {
    if (document.visibilityState === 'visible') void ping(20_000);
  }, KEEP_ALIVE_MS);

  // Coming back to a tab that has been hidden for a while: make sure it is awake.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > KEEP_ALIVE_MS) void wakeUp();
  });
}
