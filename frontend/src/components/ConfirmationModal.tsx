import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  closeOnConfirm?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete chat?',
  message,
  confirmText = 'Delete chat',
  cancelText = 'Cancel',
  isDestructive = true,
  isLoading = false,
  closeOnConfirm = true,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    requestAnimationFrame(() => cancelButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleConfirm = () => {
    if (isLoading) return;
    onConfirm();
    if (closeOnConfirm) onClose();
  };

  if (typeof document === 'undefined') return null;

  // Rendered in a portal above the composer (z-[9000]), mobile header and
  // share toast so the dialog is never covered by other UI.
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close confirmation dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-black/40"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-modal-title"
            initial={{ opacity: 0, scale: 0.98, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 5 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative w-full max-w-[500px] rounded-2xl bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)] dark:bg-[#30302E] dark:shadow-[0_18px_45px_rgba(0,0,0,0.5)]"
          >

            <h2
              id="confirmation-modal-title"
              className="text-[17px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50"
            >
              {title}
            </h2>

            <div className="mt-2 text-[15px] font-normal leading-[1.5] text-zinc-500 dark:text-zinc-400">
              {message}
            </div>

            <div className="mt-7 flex items-center justify-end gap-3">
              <motion.button
                ref={cancelButtonRef}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                disabled={isLoading}
                className="h-10 min-w-[84px] rounded-lg border border-zinc-300 bg-white px-5 text-[15px] font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/5"
              >
                {cancelText}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirm}
                disabled={isLoading}
                className={`h-10 min-w-[84px] rounded-lg border-0 px-5 text-[15px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-70 dark:focus-visible:ring-offset-[#30302E] ${
                  isDestructive
                    ? 'bg-[#C93C3C] text-white hover:bg-[#B63434] focus-visible:ring-[#C93C3C]'
                    : 'bg-zinc-900 text-white hover:bg-zinc-800 focus-visible:ring-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
                }`}
              >
                <span className="inline-flex items-center justify-center gap-2">
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {confirmText}
                </span>
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ConfirmationModal;
