import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Delete chat?',
  message,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  isDestructive = true,
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
    onConfirm();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4">
          <motion.button
            type="button"
            aria-label="Close confirmation dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-black/45 backdrop-blur-[2px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-modal-title"
            initial={{ opacity: 0, scale: 0.97, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="relative w-full max-w-[500px] rounded-[20px] border border-zinc-300 bg-white px-5 py-5 shadow-[0_16px_40px_rgba(0,0,0,0.16)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)] sm:px-6 sm:py-5"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full text-zinc-900 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>

            <h2
              id="confirmation-modal-title"
              className="pr-9 text-[21px] font-normal leading-tight tracking-[-0.02em] text-zinc-900 dark:text-zinc-100 sm:text-[22px]"
            >
              {title}
            </h2>

            <div className="mt-5 max-w-[460px] text-[16px] font-normal leading-[1.45] tracking-[-0.01em] text-zinc-900 dark:text-zinc-100 sm:text-[17px]">
              {message}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5 sm:gap-3">
              <motion.button
                ref={cancelButtonRef}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="min-w-[82px] rounded-full border border-zinc-300 bg-white px-4 py-2 text-[15px] font-semibold text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:min-w-[88px] sm:px-5 sm:py-2.5 sm:text-[16px]"
              >
                {cancelText}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirm}
                className={`min-w-[82px] rounded-full border-[2.5px] px-4 py-[7px] text-[15px] font-semibold text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-black/20 sm:min-w-[88px] sm:px-5 sm:py-2 sm:text-[16px] ${
                  isDestructive
                    ? 'border-black bg-[#ff1734] hover:bg-[#e9102c] dark:border-zinc-950'
                    : 'border-black bg-black hover:bg-zinc-800'
                }`}
              >
                {confirmText}
              </motion.button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ConfirmationModal;
