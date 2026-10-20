import React from 'react';
import { motion } from 'motion/react';
import StormLogo from './StormLogo';

interface Props {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}


export default function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[var(--bg-main)] text-[var(--text-main)]">
      <header className="flex items-center gap-2 px-6 pt-6 sm:px-10 sm:pt-8">
        <StormLogo className="h-7 w-7" />
        <span className="font-serif text-[24px] leading-none tracking-tight text-[var(--text-main)]">
          Twinkle
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
          className="flex w-full max-w-[420px] flex-col items-center"
        >
          {title && (
            <h1 className="text-center font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.02em] text-[var(--text-main)] sm:text-[40px]">
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="mt-3 text-center font-serif text-[17px] leading-snug text-[var(--text-main)]/80">
              {subtitle}
            </p>
          )}

          <div className="mt-8 w-full rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-[var(--surface)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] sm:p-8">
            {children}
          </div>

          {footer && (
            <div className="mt-6 text-center text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              {footer}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}

/* Shared control styles, so every sign-in page looks identical. */
export const authInputClass =
  'h-12 w-full rounded-[10px] border border-black/15 bg-white px-4 text-[16px] text-[var(--text-main)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-black/50 focus:ring-4 focus:ring-black/5 disabled:opacity-60 dark:border-white/15 dark:bg-[var(--bg-main)] dark:focus:border-white/50 dark:focus:ring-white/10';

export const authPrimaryButtonClass =
  'h-12 w-full rounded-[10px] bg-[#141413] text-[16px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#F5F4EE] dark:text-[#141413]';

export const authSecondaryButtonClass =
  'flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] border border-black/15 bg-white text-[16px] font-medium text-[var(--text-main)] transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/[0.05]';

export const authLinkClass =
  'text-[16px] text-[#2A5DB0] underline underline-offset-4 transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#7DA9E8]';
