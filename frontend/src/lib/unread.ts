// Shared "unread chats" storage. Same key/event the sidebar uses, so the chat
// title, the sidebar and background replies all stay in sync.
const UNREAD_KEY = 'Twinkle_unread_sessions';
const UNREAD_CHANGED_EVENT = 'twinkle:unread-sessions-changed';

export const loadUnreadIds = (): number[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(UNREAD_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
};

const saveUnreadIds = (ids: number[]) => {
  try { localStorage.setItem(UNREAD_KEY, JSON.stringify(ids)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
};

export const setChatUnread = (id: number, unread: boolean) => {
  if (!Number.isFinite(id) || id < 0) return;
  const current = loadUnreadIds();
  if (unread === current.includes(id)) return;
  saveUnreadIds(unread ? [...current, id] : current.filter(item => item !== id));
};

export { UNREAD_KEY, UNREAD_CHANGED_EVENT };
