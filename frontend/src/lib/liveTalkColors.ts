export type LiveTalkColor = {
  id: string;
  name: string;
  background: string;
  glow: string;
  swatch: string;
};

export const LIVE_TALK_COLOR_KEY = 'twinkle_live_talk_color';

export const LIVE_TALK_COLORS: LiveTalkColor[] = [
  { id: 'purple', name: 'Purple', background: 'radial-gradient(circle at 35% 25%, #f5f3ff 0%, #ddd6fe 30%, #8b5cf6 62%, #5b21b6 100%)', glow: 'rgba(91,33,182,.24)', swatch: '#7c3aed' },
  { id: 'blue', name: 'Blue', background: 'radial-gradient(circle at 35% 25%, #fef9c3 0%, #dff6ff 28%, #74c7ff 58%, #1479ed 100%)', glow: 'rgba(20,121,237,.24)', swatch: '#2563eb' },
  { id: 'pink', name: 'Pink', background: 'radial-gradient(circle at 35% 25%, #fff1f7 0%, #fbcfe8 30%, #f472b6 62%, #be185d 100%)', glow: 'rgba(190,24,93,.24)', swatch: '#ec4899' },
  { id: 'green', name: 'Green', background: 'radial-gradient(circle at 35% 25%, #f0fdf4 0%, #bbf7d0 30%, #4ade80 62%, #15803d 100%)', glow: 'rgba(21,128,61,.24)', swatch: '#16a34a' },
  { id: 'orange', name: 'Orange', background: 'radial-gradient(circle at 35% 25%, #fff7ed 0%, #fed7aa 30%, #fb923c 62%, #ea580c 100%)', glow: 'rgba(234,88,12,.24)', swatch: '#f97316' },
  { id: 'red', name: 'Red', background: 'radial-gradient(circle at 35% 25%, #fef2f2 0%, #fecaca 30%, #f87171 62%, #b91c1c 100%)', glow: 'rgba(185,28,28,.24)', swatch: '#ef4444' },
  { id: 'cyan', name: 'Cyan', background: 'radial-gradient(circle at 35% 25%, #ecfeff 0%, #a5f3fc 30%, #22d3ee 62%, #0e7490 100%)', glow: 'rgba(14,116,144,.24)', swatch: '#06b6d4' },
  { id: 'gold', name: 'Gold', background: 'radial-gradient(circle at 35% 25%, #fffbeb 0%, #fde68a 30%, #facc15 62%, #a16207 100%)', glow: 'rgba(161,98,7,.24)', swatch: '#eab308' },
];

const FALLBACK = LIVE_TALK_COLORS[0];

export const getLiveTalkColor = (id: string | null | undefined): LiveTalkColor =>
  LIVE_TALK_COLORS.find(color => color.id === id) ?? FALLBACK;

export const getSavedLiveTalkColor = (): LiveTalkColor => {
  try {
    return getLiveTalkColor(localStorage.getItem(LIVE_TALK_COLOR_KEY));
  } catch {
    return FALLBACK;
  }
};
