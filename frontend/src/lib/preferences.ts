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
const FONT_PX: Record<FontSizePref, number> = { small: 13, default: 15, large: 17.5 };
const BASE_PX = 15; // matches `html { font-size: 15px }` in index.css
const TEXT_STYLE_ID = 'twinkle-text-size-style';
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

// Tailwind text-[Npx] utilities are fixed pixels, so they ignore the root font
// size. For non-default sizes we emit matching rules that scale them as well.
const PX_SIZES = [9, 10, 11, 12, 13, 14, 14.5, 15, 16, 17, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 40];
const BREAKPOINTS: Array<[string, number]> = [['sm', 640], ['md', 768], ['lg', 1024], ['xl', 1280]];
const esc = (px: number) => String(px).replace('.', '\\.');

const buildTextSizeCss = (ratio: number) => {
  const size = (px: number) => `${+(px * ratio).toFixed(3)}px`;
  let css = '';
  for (const px of PX_SIZES) css += `.text-\\[${esc(px)}px\\]{font-size:${size(px)}!important}`;
  for (const [prefix, min] of BREAKPOINTS) {
    css += `@media (min-width:${min}px){`;
    for (const px of PX_SIZES) css += `.${prefix}\\:text-\\[${esc(px)}px\\]{font-size:${size(px)}!important}`;
    css += '}';
  }
  return css;
};

const setStyle = (id: string, css: string | null) => {
  let style = document.getElementById(id);
  if (css === null) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  if (style.textContent !== css) style.textContent = css;
};

export const applyPreferences = (prefs: DisplayPrefs = loadPrefs()) => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const px = FONT_PX[prefs.fontSize];
  root.style.fontSize = `${px}px`;
  root.dataset.textSize = prefs.fontSize;
  setStyle(TEXT_STYLE_ID, px === BASE_PX ? null : buildTextSizeCss(px / BASE_PX));

  root.dataset.motion = prefs.reduceMotion ? 'reduced' : 'system';
  // Spinners keep turning so loading states stay visible.
  setStyle(
    STYLE_ID,
    prefs.reduceMotion
      ? '*,*::before,*::after{animation-duration:.01ms!important;animation-delay:0s!important;transition-duration:.01ms!important;transition-delay:0s!important;scroll-behavior:auto!important}' +
        '*:not(.animate-spin):not(.animate-spin *),*:not(.animate-spin)::before,*:not(.animate-spin)::after{animation-iteration-count:1!important}'
      : null
  );
};

export const savePrefs = (prefs: DisplayPrefs) => {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* storage may be blocked */ }
  applyPreferences(prefs);
  window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: prefs }));
};
