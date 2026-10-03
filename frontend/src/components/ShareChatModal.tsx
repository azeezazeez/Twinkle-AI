import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, X } from 'lucide-react';

interface ShareChatModalProps {
  isOpen: boolean;
  shareUrl: string | null;
  chatName?: string;
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
}

const ShareChatModal: React.FC<ShareChatModalProps> = ({
  isOpen,
  shareUrl,
  chatName,
  isLoading = false,
  error = null,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close share dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-black/30 backdrop-blur-[1.5px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-chat-title"
            initial={{ opacity: 0, scale: 0.98, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 5 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative w-full max-w-[560px] rounded-[28px] border border-zinc-200 bg-white px-7 py-7 shadow-[0_18px_50px_rgba(0,0,0,0.14)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_18px_50px_rgba(0,0,0,0.45)] sm:px-8 sm:py-8"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-800 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <X className="h-5 w-5" strokeWidth={1.8} />
            </button>

            <h2
              id="share-chat-title"
              className="pr-10 text-[26px] font-normal leading-tight tracking-[-0.025em] text-zinc-900 dark:text-zinc-100"
            >
              Share chat
            </h2>

            <p className="mt-3 max-w-[470px] text-[15px] leading-6 text-zinc-500 dark:text-zinc-400">
              Anyone with this link can view this conversation.
              {chatName ? ` Chat: ${chatName}` : ''}
            </p>

            {isLoading ? (
              <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-400">
                Creating share link…
              </div>
            ) : error ? (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            ) : shareUrl ? (
              <div className="mt-6 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/60">
                <input
                  readOnly
                  value={shareUrl}
                  aria-label="Shared chat link"
                  onFocus={event => event.currentTarget.select()}
                  className="min-w-0 flex-1 bg-transparent px-2 text-sm text-zinc-700 outline-none dark:text-zinc-200"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 shadow-sm ring-1 ring-zinc-200 transition-colors hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 dark:hover:bg-zinc-800"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" strokeWidth={2} />
                  ) : (
                    <Copy className="h-4 w-4" strokeWidth={1.8} />
                  )}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ShareChatModal;
