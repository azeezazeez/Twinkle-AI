export type LiveTalkColor = {
  id: string;
  name: string;
  background: string;
  glow: string;
  swatch: string;
};

export const LIVE_TALK_COLOR_KEY = 'twinkle_live_talk_color';

export const LIVE_TALK_COLORS: LiveTalkColor[] = [
  // Existing colors
  {
    id: 'purple',
    name: 'Purple',
    background: 'radial-gradient(circle at 35% 25%, #f5f3ff 0%, #ddd6fe 30%, #8b5cf6 62%, #5b21b6 100%)',
    glow: 'rgba(91,33,182,.24)',
    swatch: '#7c3aed',
  },
  {
    id: 'blue',
    name: 'Blue',
    background: 'radial-gradient(circle at 35% 25%, #fef9c3 0%, #dff6ff 28%, #74c7ff 58%, #1479ed 100%)',
    glow: 'rgba(20,121,237,.24)',
    swatch: '#2563eb',
  },
  {
    id: 'pink',
    name: 'Pink',
    background: 'radial-gradient(circle at 35% 25%, #fff1f7 0%, #fbcfe8 30%, #f472b6 62%, #be185d 100%)',
    glow: 'rgba(190,24,93,.24)',
    swatch: '#ec4899',
  },
  {
    id: 'green',
    name: 'Green',
    background: 'radial-gradient(circle at 35% 25%, #f0fdf4 0%, #bbf7d0 30%, #4ade80 62%, #15803d 100%)',
    glow: 'rgba(21,128,61,.24)',
    swatch: '#16a34a',
  },
  {
    id: 'orange',
    name: 'Orange',
    background: 'radial-gradient(circle at 35% 25%, #fff7ed 0%, #fed7aa 30%, #fb923c 62%, #ea580c 100%)',
    glow: 'rgba(234,88,12,.24)',
    swatch: '#f97316',
  },
  {
    id: 'red',
    name: 'Red',
    background: 'radial-gradient(circle at 35% 25%, #fef2f2 0%, #fecaca 30%, #f87171 62%, #b91c1c 100%)',
    glow: 'rgba(185,28,28,.24)',
    swatch: '#ef4444',
  },
  {
    id: 'cyan',
    name: 'Cyan',
    background: 'radial-gradient(circle at 35% 25%, #ecfeff 0%, #a5f3fc 30%, #22d3ee 62%, #0e7490 100%)',
    glow: 'rgba(14,116,144,.24)',
    swatch: '#06b6d4',
  },
  {
    id: 'gold',
    name: 'Gold',
    background: 'radial-gradient(circle at 35% 25%, #fffbeb 0%, #fde68a 30%, #facc15 62%, #a16207 100%)',
    glow: 'rgba(161,98,7,.24)',
    swatch: '#eab308',
  },

  // Additional colors
  {
    id: 'indigo',
    name: 'Indigo',
    background: 'radial-gradient(circle at 35% 25%, #eef2ff 0%, #c7d2fe 30%, #6366f1 62%, #3730a3 100%)',
    glow: 'rgba(55,48,163,.24)',
    swatch: '#4f46e5',
  },
  {
    id: 'violet',
    name: 'Violet',
    background: 'radial-gradient(circle at 35% 25%, #faf5ff 0%, #e9d5ff 30%, #a855f7 62%, #6b21a8 100%)',
    glow: 'rgba(107,33,168,.24)',
    swatch: '#9333ea',
  },
  {
    id: 'teal',
    name: 'Teal',
    background: 'radial-gradient(circle at 35% 25%, #f0fdfa 0%, #99f6e4 30%, #2dd4bf 62%, #0f766e 100%)',
    glow: 'rgba(15,118,110,.24)',
    swatch: '#14b8a6',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    background: 'radial-gradient(circle at 35% 25%, #ecfdf5 0%, #a7f3d0 30%, #34d399 62%, #047857 100%)',
    glow: 'rgba(4,120,87,.24)',
    swatch: '#10b981',
  },
  {
    id: 'lime',
    name: 'Lime',
    background: 'radial-gradient(circle at 35% 25%, #f7fee7 0%, #d9f99d 30%, #a3e635 62%, #4d7c0f 100%)',
    glow: 'rgba(77,124,15,.24)',
    swatch: '#84cc16',
  },
  {
    id: 'rose',
    name: 'Rose',
    background: 'radial-gradient(circle at 35% 25%, #fff1f2 0%, #fecdd3 30%, #fb7185 62%, #be123c 100%)',
    glow: 'rgba(190,18,60,.24)',
    swatch: '#f43f5e',
  },
  {
    id: 'fuchsia',
    name: 'Fuchsia',
    background: 'radial-gradient(circle at 35% 25%, #fdf4ff 0%, #f5d0fe 30%, #e879f9 62%, #a21caf 100%)',
    glow: 'rgba(162,28,175,.24)',
    swatch: '#d946ef',
  },
  {
    id: 'sky',
    name: 'Sky',
    background: 'radial-gradient(circle at 35% 25%, #f0f9ff 0%, #bae6fd 30%, #38bdf8 62%, #0369a1 100%)',
    glow: 'rgba(3,105,161,.24)',
    swatch: '#0ea5e9',
  },
  {
    id: 'slate',
    name: 'Slate',
    background: 'radial-gradient(circle at 35% 25%, #f8fafc 0%, #cbd5e1 30%, #64748b 62%, #334155 100%)',
    glow: 'rgba(51,65,85,.24)',
    swatch: '#64748b',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    background: 'radial-gradient(circle at 35% 25%, #e0e7ff 0%, #818cf8 30%, #4338ca 62%, #1e1b4b 100%)',
    glow: 'rgba(30,27,75,.28)',
    swatch: '#4338ca',
  },
  {
    id: 'aqua',
    name: 'Aqua',
    background: 'radial-gradient(circle at 35% 25%, #ecfeff 0%, #a5f3fc 30%, #67e8f9 62%, #0891b2 100%)',
    glow: 'rgba(8,145,178,.24)',
    swatch: '#0891b2',
  },
  {
    id: 'coral',
    name: 'Coral',
    background: 'radial-gradient(circle at 35% 25%, #fff7ed 0%, #fed7aa 30%, #fb7185 62%, #c2410c 100%)',
    glow: 'rgba(194,65,12,.24)',
    swatch: '#f97316',
  },
];

const FALLBACK = LIVE_TALK_COLORS[0];

export const getLiveTalkColor = (
  id: string | null | undefined
): LiveTalkColor =>
  LIVE_TALK_COLORS.find(color => color.id === id) ?? FALLBACK;

export const getSavedLiveTalkColor = (): LiveTalkColor => {
  try {
    return getLiveTalkColor(localStorage.getItem(LIVE_TALK_COLOR_KEY));
  } catch {
    return FALLBACK;
  }
};
