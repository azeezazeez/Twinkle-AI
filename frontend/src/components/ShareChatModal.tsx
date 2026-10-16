import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, X, Link2, Globe } from 'lucide-react';

interface ShareChatModalProps {
  isOpen: boolean;
  shareUrl: string | null;
  chatName?: string;
  shareDescription?: string;
  promptText?: string;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
}

const ShareChatModal: React.FC<ShareChatModalProps> = ({
  isOpen,
  shareUrl,
  chatName,
  shareDescription,
  promptText = '',
  isLoading = false,
  error = null,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const title = 'Share prompt';
  const description = shareDescription || 'Anyone with this link can open Twinkle AI with this prompt ready to send.';

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => closeButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      console.error('Could not copy share link:', copyError);
      // Fallback for browsers where Clipboard API is unavailable.
      const input = document.querySelector<HTMLInputElement>('[data-share-url-input="true"]');
      input?.focus();
      input?.select();
    }
  };

  const openShareUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const shareToX = () => {
    if (!shareUrl) return;
    openShareUrl(`https://twitter.com/intent/tweet?text=${encodeURIComponent(promptText.trim() || title)}&url=${encodeURIComponent(shareUrl)}`);
  };

  const shareToLinkedIn = () => {
    if (!shareUrl) return;
    openShareUrl(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`);
  };

  const shareToReddit = () => {
    if (!shareUrl) return;
    openShareUrl(`https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(promptText.trim() || title)}`);
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5">
          <motion.button
            type="button"
            aria-label="Close share dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-white/30 backdrop-blur-[2px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-chat-title"
            initial={{ opacity: 0, scale: 0.985, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative flex max-h-[min(90dvh,760px)] w-full max-w-[760px] flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white p-4 shadow-[0_18px_50px_rgba(0,0,0,0.14)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_18px_50px_rgba(0,0,0,0.45)] sm:rounded-[28px] sm:p-6 md:p-7"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:text-zinc-200 dark:hover:bg-zinc-800 sm:right-5 sm:top-5"
            >
              <X className="h-5 w-5" strokeWidth={1.8} />
            </button>

            <h2 id="share-chat-title" className="pr-12 text-[24px] font-semibold leading-tight tracking-[-0.025em] text-zinc-900 dark:text-zinc-100 sm:text-[26px]">
              Share prompt
            </h2>

            {/* Prompt preview, styled like the requested ChatGPT share dialog. */}
            <div className="mt-4 min-h-[150px] max-h-[42dvh] flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-[#fcfcfc] p-3 dark:border-zinc-700 dark:bg-zinc-950/30 sm:mt-5 sm:min-h-[230px] sm:p-5">
              <div className="ml-auto max-w-[min(100%,560px)] rounded-[22px] bg-[#f0f0f0] px-4 py-3 text-[14px] leading-6 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100 sm:px-5 sm:text-[15px] sm:leading-7">
                <p className="whitespace-pre-wrap break-words">{promptText.trim() || 'Your shared prompt preview will appear here.'}</p>
              </div>
            </div>

            <div className="mt-4 flex items-start gap-3 sm:mt-5">
              <Globe className="mt-0.5 h-5 w-5 shrink-0 text-zinc-900 dark:text-zinc-100" strokeWidth={1.8} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Share a public link to this prompt</p>
                <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">Anyone with this link can open Twinkle AI with this prompt ready to send.</p>
              </div>
            </div>

            {isLoading ? (
              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400" role="status">
                Creating share link…
              </div>        
                  ) : error ? (
                   <div
                  className="mt-5 rounded-xl border border-red-200 !bg-white px-4 py-4 text-sm !text-red-600 dark:border-red-900/50 dark:!bg-white dark:!text-red-600"
                   role="alert"
                      >
                       {error}
                        </div>
                     ) : shareUrl ? (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:mt-5 sm:gap-x-12 sm:pt-5">
                <button type="button" onClick={handleCopy} className="group flex min-w-[72px] flex-col items-center gap-2 text-sm text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-100">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:group-hover:bg-zinc-700">
                    {copied ? <Check className="h-6 w-6 text-emerald-600" /> : <Link2 className="h-6 w-6" strokeWidth={1.8} />}
                  </span>
                  <span>{copied ? 'Copied!' : 'Copy link'}</span>
                </button>
                <button type="button" onClick={shareToX} className="group flex min-w-[72px] flex-col items-center gap-2 text-sm text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-100" aria-label="Share on X">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:group-hover:bg-zinc-700">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" aria-hidden="true"><path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.25l-4.9-7.42L5.56 22H2.43l7.25-8.29L1.8 2h6.4l4.43 6.76L18.9 2Zm-1.1 18h1.73L7.27 3.89H5.41L17.8 20Z" /></svg>
                  </span>
                  <span>X</span>
                </button>
                <button type="button" onClick={shareToLinkedIn} className="group flex min-w-[72px] flex-col items-center gap-2 text-sm text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-100" aria-label="Share on LinkedIn">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:group-hover:bg-zinc-700">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true"><path fill="#0A66C2" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.35V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 .001-4.124 2.062 2.062 0 0 1-.001 4.124zM7.119 20.452H3.554V9h3.565v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" /></svg>
                  </span>
                  <span>LinkedIn</span>
                </button>
                <button type="button" onClick={shareToReddit} className="group flex min-w-[72px] flex-col items-center gap-2 text-sm text-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-100" aria-label="Share on Reddit">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 transition-colors group-hover:bg-zinc-200 dark:bg-zinc-800 dark:group-hover:bg-zinc-700">
                    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true"><path fill="#FF4500" d="M24 12.25a3.1 3.1 0 0 0-5.27-2.2 15.2 15.2 0 0 0-5.83-1.8l1-4.7 3.27.7a2.1 2.1 0 1 0 .22-1.2l-4-.86a.62.62 0 0 0-.74.47l-1.17 5.5a15.3 15.3 0 0 0-6 1.83A3.1 3.1 0 1 0 1.3 14.8a5.4 5.4 0 0 0-.1 1c0 4.05 4.84 7.33 10.8 7.33s10.8-3.28 10.8-7.33a5.4 5.4 0 0 0-.1-1A3.1 3.1 0 0 0 24 12.25ZM6.6 14.3a1.55 1.55 0 1 1 3.1 0 1.55 1.55 0 0 1-3.1 0Zm8.75 4.3a5.1 5.1 0 0 1-6.7 0 .62.62 0 0 1 .83-.92 3.9 3.9 0 0 0 5.04 0 .62.62 0 0 1 .83.92Zm.5-2.75a1.55 1.55 0 1 1 0-3.1 1.55 1.55 0 0 1 0 3.1Z" /></svg>
                  </span>
                  <span>Reddit</span>
                </button>
              </div>
            ) : null}

            <input
              data-share-url-input="true"
              aria-label="Shared chat URL"
              readOnly
              value={shareUrl || ''}
              tabIndex={shareUrl ? 0 : -1}
              onFocus={event => event.currentTarget.select()}
              className="sr-only"
            />
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ShareChatModal;
