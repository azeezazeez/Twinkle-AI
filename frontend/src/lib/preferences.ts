// Small, app-wide display preferences (text size, reduced motion).
// Stored in localStorage and applied to <html> so every page honours them.

export type FontSizePref = 'small' | 'default' | 'large';

export interface DisplayPrefs {
  fontSize: FontSizePref;
  reduceMotion: boolean;
}

export const PREFS_KEY = 'twinkle_prefs';
export const PREFS_EVENT = 'twinkle-prefs-change';

const DEFAULT_PREFS: DisplayPrefs = { fontSize: 'default', reduceMotion: false };
const FONT_PX: Record<FontSizePref, string> = { small: '15px', default: '', large: '17.5px' };
const STYLE_ID = 'twinkle-reduce-motion-style';

export const loadPrefs = (): DisplayPrefs => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return {
      fontSize: ['small', 'default', 'large'].includes(parsed.fontSize) ? parsed.fontSize : DEFAULT_PREFS.fontSize,
      reduceMotion: Boolean(parsed.reduceMotion),
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

export const applyPreferences = (prefs: DisplayPrefs = loadPrefs()) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.fontSize = FONT_PX[prefs.fontSize];

  let style = document.getElementById(STYLE_ID);
  if (prefs.reduceMotion) {
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent =
        '*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}';
      document.head.appendChild(style);
    }
  } else if (style) {
    style.remove();
  }
};

export const savePrefs = (prefs: DisplayPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* storage may be blocked */ }
  applyPreferences(prefs);
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }));
};
