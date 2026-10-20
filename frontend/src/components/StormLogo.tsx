/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface Props {
  className?: string;
}

/** Twinkle star, drawn in Claude's signature orange (#D97757). */
export const TWINKLE_LOGO_COLOR = '#D97757';

export default function StormLogo({ className = "" }: Props) {
  return (
    <svg
      className={className}
      viewBox="56 56 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Twinkle"
      role="img"
    >
      <path
        d="M120 56c6 36 20 50 56 56-36 6-50 20-56 56-6-36-20-50-56-56 36-6 50-20 56-56z"
        fill={TWINKLE_LOGO_COLOR}
      />
    </svg>
  );
}
