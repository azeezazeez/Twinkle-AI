import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { motion } from 'motion/react';
import {
  LIVE_TALK_COLOR_KEY,
  LIVE_TALK_COLORS,
  getSavedLiveTalkColor,
} from '../lib/liveTalkColors';

export default function LiveTalkColor() {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedColor, setSelectedColor] = useState(
    () => getSavedLiveTalkColor().id
  );

  useEffect(() => {
    const handleColorChange = (event: Event) => {
      const custom = event as CustomEvent<string>;

      const newId = custom.detail;

      if (
        newId &&
        LIVE_TALK_COLORS.some(color => color.id === newId)
      ) {
        setSelectedColor(newId);
      } else {
        setSelectedColor(getSavedLiveTalkColor().id);
      }
    };

    window.addEventListener(
      'twinkle-live-talk-color-change',
      handleColorChange
    );

    return () => {
      window.removeEventListener(
        'twinkle-live-talk-color-change',
        handleColorChange
      );
    };
  }, []);

  // Always derive the complete color object from the selected ID.
  const selected =
    LIVE_TALK_COLORS.find(color => color.id === selectedColor) ??
    LIVE_TALK_COLORS[0];

  const selectColor = (id: string) => {
    const color = LIVE_TALK_COLORS.find(item => item.id === id);

    if (!color) return;

    // Update React state immediately.
    setSelectedColor(color.id);

    // Save selection.
    try {
      localStorage.setItem(LIVE_TALK_COLOR_KEY, color.id);
    } catch {
      // Best effort when browser storage is unavailable.
    }

    // Notify the rest of the application.
    window.dispatchEvent(
      new CustomEvent('twinkle-live-talk-color-change', {
        detail: color.id,
      })
    );
  };

  return (
    <div className="min-h-[100dvh] w-full bg-white dark:bg-zinc-950">
      <main className="flex min-h-[100dvh] w-full flex-col px-4 py-5 sm:px-8 sm:py-8">
        <button
          type="button"
          onClick={() => {
            const from = (location.state as { from?: string } | null)?.from;

            if (from) {
              navigate(from);
              return;
            }

            navigate('/settings', { replace: true });
          }}
          className="flex w-fit items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex w-full flex-1 flex-col items-center justify-center pb-8 text-center">
          <p className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
            Live Talk appearance
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
            Choose your Live Talk color
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400 sm:text-base">
            Choose the color of the Live Talk model.
          </p>

          {/* Selected color preview */}
          <motion.div
            key={selected.id}
            initial={{ scale: 0.96, opacity: 0.85 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="mt-10 h-44 w-44 rounded-full sm:mt-12 sm:h-56 sm:w-56"
            style={{
              background: selected.background,
              boxShadow: `0 24px 90px ${selected.glow}`,
            }}
            aria-label={`${selected.name} Live Talk preview`}
          />

          {/* Selected color name */}
          <motion.p
            key={`name-${selected.id}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-8 text-base font-semibold text-zinc-900 dark:text-white"
          >
            {selected.name}
          </motion.p>

          {/* Color choices */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 sm:mt-10 sm:gap-5">
            {LIVE_TALK_COLORS.map(color => {
              const isSelected = color.id === selected.id;

              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => selectColor(color.id)}
                  aria-label={`Use ${color.name}`}
                  aria-pressed={isSelected}
                  className={`relative flex h-12 w-12 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:focus:ring-zinc-600 dark:focus:ring-offset-zinc-950 ${
                    isSelected
                      ? 'scale-110'
                      : 'hover:scale-105'
                  }`}
                >
                  <span
                    className="h-10 w-10 rounded-full"
                    style={{
                      background: color.swatch,
                    }}
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
