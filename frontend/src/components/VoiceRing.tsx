import { useMemo, type CSSProperties } from 'react';

export type OrbPalette = {
  /** Base gradient painted on the core. */
  background: string;
  /** Lightest tone. */
  soft: string;
  /** Mid tone. */
  mid: string;
  /** Deepest tone. */
  strong: string;
  /** Soft colored light cast around the ring. */
  glow: string;
};

export type VoiceRingState = 'idle' | 'listening' | 'speaking' | 'thinking';

type Props = {
  palette: OrbPalette;
  state?: VoiceRingState;
  /** Dim the ring (e.g. microphone paused). */
  muted?: boolean;
  /** Size comes from Tailwind classes, e.g. "h-56 w-56". Everything inside scales with it. */
  className?: string;
  label?: string;
};

const BAR_COUNT = 56;

// Deterministic pseudo-random value in [0, 1) so the ring looks the same on every render.
const seeded = (index: number) => {
  const x = Math.sin(index * 12.9898 + 4.1414) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * A ring of audio-reactive bars around a glowing core. While listening, the bars
 * follow the live microphone level (the `--lvl` CSS variable set by a parent); while
 * speaking they ripple on their own; while thinking the ring slowly rotates.
 */
export default function VoiceRing({ palette, state = 'idle', muted = false, className = '', label }: Props) {
  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, index) => {
        const random = seeded(index);
        return {
          key: index,
          style: {
            '--a': `${(index * 360) / BAR_COUNT}deg`,
            '--amp': (7 + random * 15).toFixed(2),
            '--d': `${(-random * 1.6).toFixed(2)}s`,
          } as CSSProperties,
        };
      }),
    [],
  );

  return (
    <div
      className={`twinkle-ring relative shrink-0 ${className}`}
      data-state={state}
      data-muted={muted ? 'true' : undefined}
      role="img"
      aria-label={label}
      style={
        {
          containerType: 'size',
          '--c-soft': palette.soft,
          '--c-mid': palette.mid,
          '--c-strong': palette.strong,
          '--c-glow': palette.glow,
        } as CSSProperties
      }
    >
      <div className="twinkle-ring-bars absolute inset-0" aria-hidden="true">
        {bars.map(bar => (
          <span key={bar.key} className="twinkle-ring-spoke" style={bar.style}>
            <span className="twinkle-ring-bar" />
          </span>
        ))}
      </div>

      <span className="twinkle-ring-core" aria-hidden="true" style={{ background: palette.background }} />
    </div>
  );
}
