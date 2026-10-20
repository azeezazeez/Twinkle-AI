import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import StormLogo from './StormLogo';


export const authRefInputClass =
  'h-[50px] w-full rounded-[10px] border border-black/10 bg-white px-4 text-[17px] text-[var(--text-main)] outline-none transition-[border-color,box-shadow] placeholder:text-[var(--text-muted)]/80 focus:border-[#1A73E8] focus:ring-[3px] focus:ring-[#1A73E8]/25 disabled:opacity-60 dark:border-white/15 dark:bg-[var(--bg-main)] dark:focus:border-[#7DA9E8] dark:focus:ring-[#7DA9E8]/25';

export const authRefPrimaryClass =
  'h-[50px] w-full rounded-[10px] bg-[#0B0B0B] text-[17px] font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#F5F4EE] dark:text-[#141413]';

export const authRefSecondaryClass =
  'flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-black/10 bg-white text-[17px] font-medium text-[var(--text-main)] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-transparent dark:hover:bg-white/[0.05]';

export const authRefLinkClass =
  'inline cursor-pointer border-0 bg-transparent p-0 text-[16px] text-[#1F4E96] underline decoration-[#1F4E96]/45 decoration-1 underline-offset-[5px] transition-colors hover:decoration-[#1F4E96] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#7DA9E8] dark:decoration-[#7DA9E8]/45 dark:hover:decoration-[#7DA9E8]';

export const authRefBodyClass =
  'text-[16px] leading-[1.6] text-[var(--text-main)]/75';

/* ---------- Hero video ---------- */

function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const sync = () => setReduced(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (reduced) video.pause();
    else void video.play().catch(() => undefined);
  }, [reduced]);

  // Save battery: pause while the tab is hidden, resume when it is visible.
  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video || reduced) return;
      if (document.hidden) video.pause();
      else void video.play().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [reduced]);

  return (
    <div
      aria-hidden="true"
      className="hidden shrink-0 self-center py-6 lg:block lg:pr-[clamp(24px,9.9vw,190px)]"
    >
      <video
        ref={videoRef}
        className="block aspect-[4/5] h-[min(792px,calc(100svh-150px))] w-auto rounded-3xl bg-[#1B1A33] object-cover shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
        poster="/login-hero-poster.jpg"
        autoPlay={!reduced}
        muted
        loop
        playsInline
        preload="auto"
        disablePictureInPicture
        tabIndex={-1}
      >
        <source src="/login-hero.webm" type="video/webm" />
        <source src="/login-hero.mp4" type="video/mp4" />
      </video>
    </div>
  );
}

/* ---------- Layout ---------- */

interface Props {
  children: React.ReactNode;
  /** Show the video on the right (Login and Email Login pages). */
  showVideo?: boolean;
}

export default function AuthSplitLayout({ children, showVideo = true }: Props) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--bg-main)] text-[var(--text-main)]">
      <header className="flex items-center gap-2 px-6 pt-7 sm:px-10 lg:pl-[clamp(40px,4.4vw,85px)]">
        <StormLogo className="h-7 w-7" />
        <span className="font-serif text-[26px] leading-none tracking-tight text-[var(--text-main)]">
          Twinkle
        </span>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row lg:items-stretch">
        <main className="flex min-w-0 flex-1 items-center justify-center px-4 pb-12 pt-8 sm:px-6 lg:py-8">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="flex w-full max-w-[660px] flex-col items-center"
          >
            <h1 className="text-center font-serif text-[42px] font-normal leading-[1.08] tracking-[-0.02em] text-[var(--text-main)] sm:text-[56px] xl:text-[68px] xl:whitespace-nowrap">
              Question what’s next
            </h1>
            <p className="mt-5 text-center font-serif text-[19px] leading-snug text-[var(--text-main)] sm:text-[22px]">
              Your thinking partner for big ambitions
            </p>

            <div className="mt-10 w-full max-w-[560px] rounded-[36px] border border-black/10 bg-white/70 p-5 shadow-[0_4px_28px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-[var(--surface)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.35)] sm:p-9">
              {children}
            </div>

          </motion.div>
        </main>

        {showVideo && <HeroVideo />}
      </div>
    </div>
  );
}
