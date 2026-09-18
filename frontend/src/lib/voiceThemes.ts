export type VoiceTheme = {
  soft: string;
  mid: string;
  strong: string;
};

const VOICE_THEMES: Record<string, VoiceTheme> = {
  Zephyr: { soft: '#FFE8F3', mid: '#F3A6C8', strong: '#D94F8A' },
  Puck: { soft: '#E8F1FF', mid: '#9EC5FF', strong: '#3B82F6' },
  Charon: { soft: '#E7FFF4', mid: '#9BE7C4', strong: '#10B981' },
  Kore: { soft: '#FFF1E5', mid: '#FFC48C', strong: '#F97316' },
  Fenrir: { soft: '#F0EBFF', mid: '#C4B5FD', strong: '#7C3AED' },
  Leda: { soft: '#E9FBFF', mid: '#8FE3F8', strong: '#06B6D4' },
  Orus: { soft: '#FFF7D6', mid: '#FDE68A', strong: '#EAB308' },
  Aoede: { soft: '#F4E8FF', mid: '#D8B4FE', strong: '#A855F7' },
  Callirrhoe: { soft: '#FFE8E8', mid: '#FDA4AF', strong: '#E11D48' },
  Autonoe: { soft: '#E8F5FF', mid: '#93C5FD', strong: '#2563EB' },
  Enceladus: { soft: '#E9FFF8', mid: '#86EFAC', strong: '#16A34A' },
  Iapetus: { soft: '#FFF0F5', mid: '#F9A8D4', strong: '#DB2777' },
  Umbriel: { soft: '#FFF4E6', mid: '#FDBA74', strong: '#EA580C' },
  Algieba: { soft: '#EEF2FF', mid: '#A5B4FC', strong: '#4F46E5' },
  Despina: { soft: '#ECFEFF', mid: '#67E8F9', strong: '#0891B2' },
  Erinome: { soft: '#F5F3FF', mid: '#C4B5FD', strong: '#8B5CF6' },
  Algenib: { soft: '#FDF2F8', mid: '#F9A8D4', strong: '#EC4899' },
  Rasalgethi: { soft: '#F0FDFA', mid: '#99F6E4', strong: '#0F766E' },
  Laomedeia: { soft: '#EFF6FF', mid: '#BFDBFE', strong: '#1D4ED8' },
  Achernar: { soft: '#F7FEE7', mid: '#BEF264', strong: '#65A30D' },
  Alnilam: { soft: '#FFF7ED', mid: '#FED7AA', strong: '#C2410C' },
  Schedar: { soft: '#FAF5FF', mid: '#E9D5FF', strong: '#9333EA' },
  Gacrux: { soft: '#F0F9FF', mid: '#BAE6FD', strong: '#0284C7' },
  Pulcherrima: { soft: '#F0FDFA', mid: '#A7F3D0', strong: '#059669' },
  Achird: { soft: '#FEFCE8', mid: '#FEF08A', strong: '#CA8A04' },
  Zubenelgenubi: { soft: '#FDF4FF', mid: '#F0ABFC', strong: '#C026D3' },
  Vindemiatrix: { soft: '#FFF1F2', mid: '#FECDD3', strong: '#BE123C' },
  Sadachbia: { soft: '#EEF2FF', mid: '#C7D2FE', strong: '#4338CA' },
  Sadaltager: { soft: '#F0FDF4', mid: '#BBF7D0', strong: '#15803D' },
  Sulafat: { soft: '#F0F9FF', mid: '#A5F3FC', strong: '#0E7490' },
};

const FALLBACK_THEME: VoiceTheme = {
  soft: '#E8F1FF',
  mid: '#9EC5FF',
  strong: '#3B82F6',
};

export const getVoiceTheme = (voiceName: string): VoiceTheme =>
  VOICE_THEMES[voiceName] ?? FALLBACK_THEME;
