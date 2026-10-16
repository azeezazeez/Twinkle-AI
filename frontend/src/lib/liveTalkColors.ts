import type { OrbPalette } from '../components/FoggyOrb';

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

  // More colors
  {
    id: 'mint',
    name: 'Mint',
    background: 'radial-gradient(circle at 35% 25%, #f0fff9 0%, #c6f7e2 30%, #7ee8c0 62%, #2f9e7a 100%)',
    glow: 'rgba(47,158,122,.24)',
    swatch: '#5eead4',
  },
  {
    id: 'peach',
    name: 'Peach',
    background: 'radial-gradient(circle at 35% 25%, #fffaf5 0%, #ffe1cc 30%, #ffb38a 62%, #e0703c 100%)',
    glow: 'rgba(224,112,60,.24)',
    swatch: '#fdba74',
  },
  {
    id: 'lavender',
    name: 'Lavender',
    background: 'radial-gradient(circle at 35% 25%, #fbf9ff 0%, #e6dcff 30%, #b8a2f5 62%, #7459c7 100%)',
    glow: 'rgba(116,89,199,.24)',
    swatch: '#c4b5fd',
  },
  {
    id: 'berry',
    name: 'Berry',
    background: 'radial-gradient(circle at 35% 25%, #fff1f9 0%, #f9b8dc 30%, #d6479b 62%, #7e1d5f 100%)',
    glow: 'rgba(126,29,95,.26)',
    swatch: '#c026d3',
  },
  {
    id: 'crimson',
    name: 'Crimson',
    background: 'radial-gradient(circle at 35% 25%, #fff1f2 0%, #fda4af 28%, #e11d48 62%, #7f1230 100%)',
    glow: 'rgba(159,18,57,.28)',
    swatch: '#be123c',
  },
  {
    id: 'amber',
    name: 'Amber',
    background: 'radial-gradient(circle at 35% 25%, #fffdf0 0%, #fde7a0 28%, #fbbf24 60%, #b45309 100%)',
    glow: 'rgba(180,83,9,.26)',
    swatch: '#f59e0b',
  },
  {
    id: 'forest',
    name: 'Forest',
    background: 'radial-gradient(circle at 35% 25%, #f1fdf3 0%, #a8e6b4 28%, #3f9f5f 60%, #14532d 100%)',
    glow: 'rgba(20,83,45,.28)',
    swatch: '#15803d',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    background: 'radial-gradient(circle at 35% 25%, #effcff 0%, #8fe3f8 28%, #1d8fd9 60%, #0b3a85 100%)',
    glow: 'rgba(11,58,133,.28)',
    swatch: '#0284c7',
  },
  {
    id: 'ice',
    name: 'Ice',
    background: 'radial-gradient(circle at 35% 25%, #ffffff 0%, #e3f4ff 30%, #b6dcf7 62%, #7aa6d1 100%)',
    glow: 'rgba(122,166,209,.3)',
    swatch: '#bae6fd',
  },
  {
    id: 'sand',
    name: 'Sand',
    background: 'radial-gradient(circle at 35% 25%, #fffdf8 0%, #f3e6cf 30%, #d9bf93 62%, #9c7a45 100%)',
    glow: 'rgba(156,122,69,.26)',
    swatch: '#d6b98a',
  },
  {
    id: 'graphite',
    name: 'Graphite',
    background: 'radial-gradient(circle at 35% 25%, #f4f4f5 0%, #a1a1aa 30%, #52525b 62%, #18181b 100%)',
    glow: 'rgba(24,24,27,.3)',
    swatch: '#3f3f46',
  },

  // Multi-tone blends – the fog drifts between two or three hues
  {
    id: 'sunset',
    name: 'Sunset',
    background: 'radial-gradient(circle at 35% 25%, #fff3d6 0%, #ffb27a 28%, #f0558c 62%, #7c2a9e 100%)',
    glow: 'rgba(240,85,140,.28)',
    swatch: 'linear-gradient(135deg, #fb923c, #ec4899 55%, #7c3aed)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    background: 'radial-gradient(circle at 35% 25%, #ecfeff 0%, #7cf0c8 28%, #5b8cf0 62%, #7e3fd1 100%)',
    glow: 'rgba(91,140,240,.28)',
    swatch: 'linear-gradient(135deg, #2dd4bf, #6366f1 55%, #a855f7)',
  },
  {
    id: 'candy',
    name: 'Candy',
    background: 'radial-gradient(circle at 35% 25%, #fff5fb 0%, #ffc2e2 28%, #a9c4ff 62%, #6d7be8 100%)',
    glow: 'rgba(109,123,232,.26)',
    swatch: 'linear-gradient(135deg, #f9a8d4, #93c5fd)',
  },
  {
    id: 'lagoon',
    name: 'Lagoon',
    background: 'radial-gradient(circle at 35% 25%, #f0fffc 0%, #8af0e0 28%, #20a9c9 62%, #1e4fa8 100%)',
    glow: 'rgba(30,79,168,.26)',
    swatch: 'linear-gradient(135deg, #2dd4bf, #2563eb)',
  },
  {
    id: 'ember',
    name: 'Ember',
    background: 'radial-gradient(circle at 35% 25%, #fffbe6 0%, #ffcf5c 26%, #f2552c 62%, #7a1a1a 100%)',
    glow: 'rgba(242,85,44,.28)',
    swatch: 'linear-gradient(135deg, #facc15, #ef4444)',
  },
];

// Pulls the hex stops out of a color's gradient so the foggy orb can reuse them.
const hexStops = (value: string): string[] => value.match(/#[0-9a-fA-F]{6}/g) ?? [];

/** Turns a Live Talk color into the palette used by <FoggyOrb />. */
export const toOrbPalette = (color: LiveTalkColor): OrbPalette => {
  const stops = hexStops(color.background);
  return {
    background: color.background,
    soft: stops[1] ?? stops[0] ?? '#e0e7ff',
    mid: stops[2] ?? stops[1] ?? '#818cf8',
    strong: stops[3] ?? stops[2] ?? '#4338ca',
    glow: color.glow,
  };
};

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
