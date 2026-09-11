/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface Props {
  name?: string;
  className?: string;
}

// Stable colors: the same username always gets the same profile color.
const PROFILE_COLORS = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626',
  '#EA580C', '#CA8A04', '#059669', '#0891B2',
];

function getInitials(name: string): string {
  const words = name
    .trim()
    .split(/[\s_-]+/)
    .filter(Boolean);

  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();

  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}

function getProfileColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

export default function UserAvatar({ name, className = "" }: Props) {
  const safeName = (name || '?').trim() || '?';
  const initials = getInitials(safeName);
  const backgroundColor = getProfileColor(safeName);

  return (
    <div
      className={`flex items-center justify-center rounded-xl overflow-hidden font-black text-white shadow-lg ${className}`}
      style={{ backgroundColor }}
      aria-label={safeName}
      title={safeName}
    >
      {initials}
    </div>
  );
}
