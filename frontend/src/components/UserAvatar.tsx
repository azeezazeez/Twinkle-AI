import React from 'react';

interface Props {
  name?: string;
  avatarUrl?: string;
  className?: string;
}

const PROFILE_COLORS = [
  '#2563EB', '#7C3AED', '#DB2777', '#DC2626',
  '#EA580C', '#CA8A04', '#059669', '#0891B2',
];

function getInitials(name: string): string {
  const words = name.trim().split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}

function getProfileColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

export default function UserAvatar({ name, avatarUrl, className = '' }: Props) {
  const safeName = (name || '?').trim() || '?';
  const initials = getInitials(safeName);
  const backgroundColor = getProfileColor(safeName);

  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full font-black text-white shadow-lg ${className}`}
      style={{ backgroundColor }}
      aria-label={safeName}
      title={safeName}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials
      )}
    </div>
  );
}
