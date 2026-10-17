import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Play, Volume2 } from 'lucide-react';
import VoiceRing from './VoiceRing';
import SearchBar from './SearchBar';
import { VOICES } from '../lib/voices';
import { getVoiceOrbPalette } from '../lib/voiceThemes';

type Props = {
  selected: string;
  previewing: string | null;
  error?: string;
  /** Select a voice (saves it and plays a short sample). */
  onPick: (voice: string) => void;
  /** Replay the sample of the current voice. */
  onPlay: (voice: string) => void;
};

/**
 * Voice picker: a "current voice" card on top and a searchable grid of all
 * voices below. Clicking a card selects it and plays a sample, so there is no
 * carousel, no dots and no extra "browse" dialog.
 */
export default function VoiceGrid({ selected, previewing, error, onPick, onPlay }: Props) {
  const [query, setQuery] = useState('');

  const current = VOICES.find(voice => voice.name === selected) ?? VOICES[0];
  const playing = previewing === current.name;
  const currentPalette = getVoiceOrbPalette(current.name);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return VOICES;
    return VOICES.filter(
      voice => voice.name.toLowerCase().includes(q) || voice.description.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div>
      {/* Current voice – same look as the Live Talk stage */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 transition-opacity duration-700"
          style={{
            background: `radial-gradient(60% 70% at 50% 38%, ${currentPalette.glow}, transparent 72%)`,
            opacity: playing ? 0.9 : 0.5,
          }}
        />
        <div className="relative flex flex-col items-center px-5 pb-6 pt-7 text-center">
          <VoiceRing
            palette={currentPalette}
            state={playing ? 'speaking' : 'idle'}
            className="h-44 w-44 sm:h-52 sm:w-52"
            label={`${current.name} voice`}
          />
          <motion.h3
            key={current.name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-5 text-2xl font-medium tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            {current.name}
          </motion.h3>
          <p className="mt-1 max-w-sm text-sm leading-5 text-zinc-500 dark:text-zinc-400" role="status" aria-live="polite">
            {playing ? 'Playing sample…' : current.description}
          </p>
          <button
            type="button"
            onClick={() => onPlay(current.name)}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#C6613F] px-6 text-sm font-medium text-white transition-colors hover:bg-[#b4553a] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C6613F]/50"
          >
            {playing ? <Volume2 className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
            {playing ? 'Playing…' : 'Play sample'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-[#ecc5c3] bg-[#fdf6f5] px-4 py-3 text-sm leading-5 text-[#b3261e] dark:border-[#7f1d1d] dark:bg-[#2a0f12] dark:text-[#f2b8b5]"
        >
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {filtered.length} of {VOICES.length} voices
        </p>
        <div className="w-full max-w-[260px]">
          <SearchBar value={query} onChange={setQuery} placeholder="Search voices" aria-label="Search voices" />
        </div>
      </div>

      {/* Grid */}
      <div role="listbox" aria-label="Voices" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map(voice => {
          const isSelected = voice.name === selected;
          const isPlaying = voice.name === previewing;
          const palette = getVoiceOrbPalette(voice.name);
          return (
            <button
              key={voice.name}
              type="button"
              role="option"
              aria-selected={isSelected}
              onClick={() => onPick(voice.name)}
              style={isSelected ? { borderColor: palette.strong, boxShadow: `0 0 0 1px ${palette.strong}` } : undefined}
              className={`group flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
                isSelected
                  ? 'bg-zinc-50 dark:bg-white/[0.06]'
                  : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-white/10 dark:bg-transparent dark:hover:bg-white/5'
              }`}
            >
              <span
                className="h-9 w-9 shrink-0 rounded-full ring-1 ring-black/5 dark:ring-white/10"
                style={{ background: palette.background }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-50">{voice.name}</span>
                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{voice.description}</span>
              </span>
              {isPlaying ? (
                <span className="flex h-4 items-end gap-0.5" aria-label="Playing">
                  {[0, 1, 2].map(bar => (
                    <motion.span
                      key={bar}
                      className="w-0.5 rounded-full"
                      style={{ background: palette.strong }}
                      animate={{ height: [4, 14, 6, 12, 4] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: bar * 0.12 }}
                    />
                  ))}
                </span>
              ) : isSelected ? (
                <Check className="h-4 w-4 shrink-0" style={{ color: palette.strong }} strokeWidth={2.2} />
              ) : (
                <Play className="h-3.5 w-3.5 shrink-0 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-500" fill="currentColor" />
              )}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-10 text-center text-sm text-zinc-500">No voice matches “{query}”.</p>
      )}
    </div>
  );
}
