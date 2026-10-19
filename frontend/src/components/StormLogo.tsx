/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId } from 'react';

interface Props {
  className?: string;
}

export default function StormLogo({ className = "" }: Props) {
  const gradientId = `stellume-${useId().replace(/:/g, '')}`;

  return (
    <svg
      className={className}
      viewBox="56 56 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Stellume"
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F472B6" />
          <stop offset="1" stopColor="#6366F1" />
        </linearGradient>
      </defs>
      <path
        d="M120 56c6 36 20 50 56 56-36 6-50 20-56 56-6-36-20-50-56-56 36-6 50-20 56-56z"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}
