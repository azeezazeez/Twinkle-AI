/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface Props {
  className?: string;
}

/**
 * Shared Twinkle mark.
 * This is the exact monochrome mark used in the center of the Chat screen.
 * Keeping it in one component ensures Chat, Sidebar, Login, Signup,
 * OTP verification, password recovery, and loading states all use the same logo.
 */
export default function StormLogo({ className = "" }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Twinkle"
      role="img"
    >
      <path
        d="M24 3.5C26.6 11.2 31.1 16.1 38.8 18.7C31.1 21.3 26.6 26.2 24 33.9C21.4 26.2 16.9 21.3 9.2 18.7C16.9 16.1 21.4 11.2 24 3.5Z"
        fill="currentColor"
      />
      <path
        d="M24 14.1C25.7 18.9 29 22 33.9 23.7C29 25.4 25.7 28.5 24 33.3C22.3 28.5 19 25.4 14.1 23.7C19 22 22.3 18.9 24 14.1Z"
        fill="white"
        fillOpacity=".96"
      />
      <circle cx="24" cy="23.7" r="3.1" fill="currentColor" />
    </svg>
  );
}
