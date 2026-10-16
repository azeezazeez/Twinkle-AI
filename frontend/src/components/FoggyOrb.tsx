import type { CSSProperties } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export type OrbPalette = {
  /** Base gradient painted on the orb body. */
  background: string;
  /** Lightest tone – used for the fog highlights. */
  soft: string;
  /** Mid tone – used for the drifting fog. */
  mid: string;
  /** Deepest tone – used for shading and the outer haze. */
  strong: string;
  /** Soft colored light cast around the orb. */
  glow: string;
};

export type OrbState = 'idle' | 'listening' | 'speaking';

type Props = {
  palette: OrbPalette;
  state?: OrbState;
  /** Size comes from Tailwind classes, e.g. "h-36 w-36". Everything inside scales with it. */
  className?: string;
  label?: string;
};

// Drifting fog blobs. Positions / sizes are percentages of the orb so the
// effect looks identical at every size. `tone` picks the palette color.
const FOG_BLOBS: Array<{
  tone: 'soft' | 'mid' | 'strong';
  size: number;
  left: number;
  top: number;
  dx: number;
  dy: number;
  duration: number;
  delay: number;
  opacity: number;
}> = [
  { tone: 'soft', size: 74, left: -14, top: -10, dx: 34, dy: 26, duration: 9, delay: 0, opacity: 0.95 },
  { tone: 'mid', size: 66, left: 42, top: 6, dx: -30, dy: 34, duration: 11, delay: 1.2, opacity: 0.85 },
  { tone: 'strong', size: 70, left: 8, top: 48, dx: 30, dy: -26, duration: 12, delay: 0.6, opacity: 0.7 },
  { tone: 'soft', size: 52, left: 50, top: 52, dx: -26, dy: -30, duration: 8.5, delay: 2, opacity: 0.8 },
  { tone: 'mid', size: 44, left: 24, top: 22, dx: 22, dy: 20, duration: 7, delay: 0.3, opacity: 0.7 },
];

const SPEED: Record<OrbState, number> = {
  idle: 1,
  listening: 0.72,
  speaking: 0.5,
};

/**
 * An orb wrapped in slowly drifting fog. The fog flows faster while the model
 * listens and faster still while it speaks, and a soft haze spills just past
 * the orb edge so the whole thing feels like a glowing cloud.
 */
export default function FoggyOrb({ palette, state = 'idle', className = '', label }: Props) {
  const reduceMotion = useReducedMotion();
  const speed = reduceMotion ? 1 : SPEED[state];
  const animated = !reduceMotion;

  const loop = (duration: number, delay = 0) => ({
    duration: duration * speed,
    delay,
    repeat: Infinity,
    repeatType: 'mirror' as const,
    ease: 'easeInOut' as const,
  });

  const blur = (cq: number) => `blur(${cq}cqmin)`;

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ containerType: 'size' } as CSSProperties}
      role="img"
      aria-label={label}
    >
      {/* Outer haze that spills past the orb edge */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[34%] rounded-full"
        style={{
          background: `radial-gradient(circle, ${palette.glow} 0%, transparent 62%)`,
          filter: blur(10),
        }}
        animate={animated ? { scale: [1, state === 'speaking' ? 1.2 : 1.1, 1], opacity: [0.65, 1, 0.65] } : undefined}
        transition={{ duration: state === 'speaking' ? 1.6 : 4.2, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Rotating wisps just outside the orb */}
      {animated && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[14%]"
          animate={{ rotate: 360 }}
          transition={{ duration: 26 * speed, repeat: Infinity, ease: 'linear' }}
        >
          <span
            className="absolute left-[2%] top-[22%] h-[46%] w-[46%] rounded-full"
            style={{ background: palette.mid, opacity: 0.42, filter: blur(11) }}
          />
          <span
            className="absolute bottom-[4%] right-[4%] h-[42%] w-[42%] rounded-full"
            style={{ background: palette.strong, opacity: 0.3, filter: blur(12) }}
          />
        </motion.div>
      )}

      {/* Orb body */}
      <motion.div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: palette.background,
          boxShadow: `0 4cqmin 18cqmin ${palette.glow}`,
        }}
        animate={
          animated
            ? state === 'speaking'
              ? { scale: [1, 1.06, 1] }
              : state === 'listening'
                ? { scale: [1, 1.03, 1] }
                : { scale: [1, 1.015, 1] }
            : undefined
        }
        transition={{ duration: state === 'speaking' ? 1.15 : state === 'listening' ? 1.8 : 5, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Drifting fog */}
        {FOG_BLOBS.map((blob, index) => (
          <motion.span
            key={index}
            aria-hidden="true"
            className="absolute rounded-full"
            style={{
              width: `${blob.size}%`,
              height: `${blob.size}%`,
              left: `${blob.left}%`,
              top: `${blob.top}%`,
              background: `radial-gradient(circle, ${palette[blob.tone]} 0%, transparent 70%)`,
              opacity: blob.opacity,
              filter: blur(9),
            }}
            animate={
              animated
                ? {
                    x: ['0%', `${blob.dx}%`, `${-blob.dx * 0.4}%`],
                    y: ['0%', `${blob.dy}%`, `${-blob.dy * 0.4}%`],
                    scale: [1, 1.22, 0.9],
                  }
                : undefined
            }
            transition={loop(blob.duration, blob.delay)}
          />
        ))}

        {/* Soft white fog highlight */}
        <motion.span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            left: '12%',
            top: '6%',
            width: '52%',
            height: '40%',
            background: 'radial-gradient(ellipse, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 72%)',
            filter: blur(7),
          }}
          animate={animated ? { x: ['0%', '14%', '-6%'], opacity: [0.65, 0.95, 0.65] } : undefined}
          transition={loop(6, 0.4)}
        />

        {/* Depth shading + rim light */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 50% 118%, ${palette.strong} 0%, transparent 58%)`,
            opacity: 0.55,
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: 'inset 0 0 9cqmin rgba(255,255,255,0.35)' }}
        />
      </motion.div>
    </div>
  );
}
