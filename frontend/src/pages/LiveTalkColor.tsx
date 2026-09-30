import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { motion } from 'motion/react';
import {
  LIVE_TALK_COLOR_KEY,
  LIVE_TALK_COLORS,
  getSavedLiveTalkColor,
} from '../lib/liveTalkColors';

export default function LiveTalkColor() {
  const [selectedColor, setSelectedColor] = useState(() => getSavedLiveTalkColor().id);

  useEffect(() => {
    const handleColorChange = (event: Event) => {
      const custom = event as CustomEvent<string>;
      setSelectedColor(custom.detail || getSavedLiveTalkColor().id);
    };

    window.addEventListener('twinkle-live-talk-color-change', handleColorChange);
    return () => window.removeEventListener('twinkle-live-talk-color-change', handleColorChange);
  }, []);

  const selected = LIVE_TALK_COLORS.find(color => color.id === selectedColor) ?? LIVE_TALK_COLORS[0];

  const selectColor = (id: string) => {
    setSelectedColor(id);
    try {
      localStorage.setItem(LIVE_TALK_COLOR_KEY, id);
    } catch {
      // Best effort when browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent('twinkle-live-talk-color-change', { detail: id }));
  };

  return (
    <div className="min-h-[100dvh] w-full bg-white dark:bg-zinc-950">
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-5 py-6 sm:px-10 sm:py-10">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="mb-8 flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Live Talk Color
        </button>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center pb-12 text-center">
          <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">Live Talk appearance</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
            Choose your Live Talk color
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            This changes the color and glow of the Live Talk model only. Your microphone button stays unchanged.
          </p>

          <motion.div
            key={selected.id}
            initial={{ scale: 0.96, opacity: 0.85 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="mt-12 h-40 w-40 rounded-full sm:h-48 sm:w-48"
            style={{
              background: selected.background,
              boxShadow: `0 24px 90px ${selected.glow}`,
            }}
            aria-label={`${selected.name} Live Talk preview`}
          />

          <p className="mt-8 text-base font-semibold text-zinc-900 dark:text-white">
            {selected.name}
          </p>

          <div className="mt-7 grid grid-cols-4 gap-4 sm:grid-cols-8">
            {LIVE_TALK_COLORS.map(color => {
              const isSelected = color.id === selected.id;
              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => selectColor(color.id)}
                  aria-label={`Use ${color.name}` }
                  aria-pressed={isSelected}
                  className={`relative flex h-12 w-12 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:focus:ring-zinc-600 dark:focus:ring-offset-zinc-950 ${isSelected ? 'scale-110' : 'hover:scale-105'}`}
                >
                  <span
                    className="h-10 w-10 rounded-full"
                    style={{ background: color.swatch }}
                  />
                  {isSelected && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <Check className="h-4 w-4 text-white drop-shadow" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <p className="mt-8 text-xs text-zinc-400 dark:text-zinc-500">
            Your selection is saved automatically.
          </p>
        </div>
      </main>
    </div>
  );
}
