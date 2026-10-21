
export type ShortcutAction =
  | 'search'
  | 'new-chat'
  | 'toggle-sidebar'
  | 'settings'
  | 'shortcuts'
  | 'live-talk';

export const SHORTCUT_EVENT = 'twinkle:shortcut';
export const PENDING_SHORTCUT_KEY = 'twinkle_pending_shortcut';

export const isMac = () =>
  typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

export function matchShortcut(event: KeyboardEvent): ShortcutAction | null {
  if (event.repeat || event.isComposing || event.altKey) return null;
  if (!(event.ctrlKey || event.metaKey)) return null;

  const key = (event.key || '').toLowerCase();
  const code = event.code || '';
  const is = (letterKey: string, letterCode: string) => key === letterKey || code === letterCode;

  if (event.shiftKey) {
    if (is('o', 'KeyO')) return 'new-chat';
    if (is('s', 'KeyS')) return 'toggle-sidebar';
    if (is('l', 'KeyL')) return 'live-talk';
    // Shift turns "," into "<" in event.key, so also look at event.code.
    if (code === 'Comma' || key === ',' || key === '<') return 'settings';
    return null;
  }

  if (is('b', 'KeyB') || code === 'Period' || key === 'B') return 'toggle-sidebar';
  if (is('k', 'KeyK')) return 'search';
  if (code === 'Comma' || key === ',') return 'settings';
  if (code === 'Slash' || key === '/') return 'shortcuts';
  return null;
}

export function dispatchShortcut(action: ShortcutAction) {
  window.dispatchEvent(new CustomEvent<ShortcutAction>(SHORTCUT_EVENT, { detail: action }));
}

/** Subscribe to broadcast shortcuts. Returns the unsubscribe function. */
export function onShortcut(handler: (action: ShortcutAction) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<ShortcutAction>).detail);
  window.addEventListener(SHORTCUT_EVENT, listener);
  return () => window.removeEventListener(SHORTCUT_EVENT, listener);
}

/** For shortcuts pressed on a page that has no chat yet (e.g. Settings). */
export function setPendingShortcut(action: ShortcutAction) {
  try { sessionStorage.setItem(PENDING_SHORTCUT_KEY, action); } catch { /* storage blocked */ }
}

export function takePendingShortcut(): ShortcutAction | null {
  try {
    const value = sessionStorage.getItem(PENDING_SHORTCUT_KEY) as ShortcutAction | null;
    if (value) sessionStorage.removeItem(PENDING_SHORTCUT_KEY);
    return value;
  } catch {
    return null;
  }
}

export type ShortcutItem = { title: string; desc: string; keys: string[] };

export const shortcutGroups = (mod: string): Array<{ heading: string; items: ShortcutItem[] }> => [
  {
    heading: 'Navigation',
    items: [
      { title: 'Search chats', desc: 'Open chat search from anywhere.', keys: [mod, 'K'] },
      { title: 'New chat', desc: 'Start a fresh conversation.', keys: [mod, 'Shift', 'O'] },
      { title: 'Toggle sidebar', desc: 'Collapse or expand the chat list. Ctrl/⌘ + B also works.', keys: [mod, '.'] },
      { title: 'Open settings', desc: 'Jump straight to Settings.', keys: [mod, 'Shift', ','] },
      { title: 'Show shortcuts', desc: 'Open this list.', keys: [mod, '/'] },
    ],
  },
  {
    heading: 'Chat',
    items: [
      { title: 'Send message', desc: 'Send what you typed in the composer.', keys: ['Enter'] },
      { title: 'New line', desc: 'Add a line break without sending.', keys: ['Shift', 'Enter'] },
      { title: 'Cancel editing', desc: 'Stop editing a message or renaming a chat.', keys: ['Esc'] },
      { title: 'Close dialog', desc: 'Dismiss pop-ups, menus and confirmations.', keys: ['Esc'] },
    ],
  },
  {
    heading: 'Chat list menu',
    items: [
      { title: 'Pin / unpin chat', desc: 'With a chat’s ⋮ menu open.', keys: ['P'] },
      { title: 'Mark read / unread', desc: 'With a chat’s ⋮ menu (or the chat name menu) open.', keys: ['U'] },
      { title: 'Rename chat', desc: 'With a chat’s ⋮ menu open.', keys: ['R'] },
      { title: 'Delete chat', desc: 'With a chat’s ⋮ menu open.', keys: ['D'] },
    ],
  },
  {
    heading: 'Touch gestures',
    items: [
      { title: 'Open sidebar', desc: 'Swipe right from the left edge of the screen.', keys: ['Swipe →'] },
      { title: 'Close sidebar', desc: 'Swipe left on the sidebar, or press Back.', keys: ['Swipe ←'] },
      { title: 'Chat options', desc: 'Touch and hold a chat in the list.', keys: ['Long-press'] },
      { title: 'Close a sheet', desc: 'Drag its handle down, tap outside, or press Back.', keys: ['Drag ↓'] },
    ],
  },
  {
    heading: 'Live Talk',
    items: [
      { title: 'Start Live Talk', desc: 'Begin a voice conversation.', keys: [mod, 'Shift', 'L'] },
      { title: 'Mute / unmute microphone', desc: 'While Live Talk is open.', keys: ['M'] },
      { title: 'End conversation', desc: 'While Live Talk is open.', keys: ['Esc'] },
    ],
  },
];
