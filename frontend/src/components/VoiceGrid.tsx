import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Play, Volume2 } from 'lucide-react';
import FoggyOrb from './FoggyOrb';
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return VOICES;
    return VOICES.filter(
      voice => voice.name.toLowerCase().includes(q) || voice.description.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <div>
      {/* Current voice */}
      <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:gap-5 sm:p-5">
        <FoggyOrb
          palette={getVoiceOrbPalette(current.name)}
          state={playing ? 'speaking' : 'idle'}
          className="h-[76px] w-[76px] shrink-0"
          label={`${current.name} voice`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Current voice</p>
          <motion.h3
            key={current.name}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="truncate text-xl font-semibold tracking-tight text-zinc-900 dark:text-white"
          >
            {current.name}
          </motion.h3>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{current.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onPlay(current.name)}
          className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-zinc-950 px-3.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {playing ? <Volume2 className="h-4 w-4" /> : <Play className="h-4 w-4" fill="currentColor" />}
          <span className="hidden sm:inline">{playing ? 'Playing…' : 'Play sample'}</span>
        </button>
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
              className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
                isSelected
                  ? 'border-zinc-900 bg-zinc-50 dark:border-white/70 dark:bg-white/[0.06]'
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
                      className="w-0.5 rounded-full bg-zinc-900 dark:bg-white"
                      animate={{ height: [4, 14, 6, 12, 4] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: bar * 0.12 }}
                    />
                  ))}
                </span>
              ) : isSelected ? (
                <Check className="h-4 w-4 shrink-0 text-zinc-900 dark:text-white" strokeWidth={2.2} />
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
