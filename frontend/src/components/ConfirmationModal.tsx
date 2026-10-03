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
  confirmText = 'Delete chat',
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close confirmation dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-black/30 backdrop-blur-[1.5px]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-modal-title"
            initial={{ opacity: 0, scale: 0.98, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 5 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative w-full max-w-[540px] rounded-[22px] border border-zinc-200 bg-white px-6 py-6 shadow-[0_18px_45px_rgba(0,0,0,0.14)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_18px_45px_rgba(0,0,0,0.45)] sm:px-7 sm:py-6"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-zinc-800 transition-colors hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </button>

            <h2
              id="confirmation-modal-title"
              className="pr-10 text-[23px] font-normal leading-tight tracking-[-0.025em] text-zinc-900 dark:text-zinc-100"
            >
              {title}
            </h2>

            <div className="mt-3.5 max-w-[470px] text-[16px] font-normal leading-[1.5] tracking-[-0.01em] text-zinc-500 dark:text-zinc-400">
              {message}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <motion.button
                ref={cancelButtonRef}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="min-w-[92px] rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-[15px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400/40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {cancelText}
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirm}
                className={`min-w-[108px] rounded-full border-0 px-5 py-2.5 text-[15px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                  isDestructive
                    ? 'bg-[#fbe5e7] text-[#e62f3d] hover:bg-[#f8dadd] dark:bg-[#3a2023] dark:text-[#ff6672] dark:hover:bg-[#48272b]'
                    : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
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
