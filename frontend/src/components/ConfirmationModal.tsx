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

    requestAnimationFrame(() => {
      cancelButtonRef.current?.focus();
    });

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
          {/* Background overlay */}
          <motion.button
            type="button"
            aria-label="Close confirmation dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="
              absolute
              inset-0
              cursor-default
              border-0
              bg-black/30
              backdrop-blur-[1.5px]
            "
          />

          {/* Confirmation Modal */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmation-modal-title"
            initial={{
              opacity: 0,
              scale: 0.98,
              y: 5,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.98,
              y: 5,
            }}
            transition={{
              duration: 0.16,
              ease: 'easeOut',
            }}
            className="
              relative
              w-full
              max-w-[656px]
              rounded-[28px]
              border
              border-zinc-200
              bg-white
              px-8
              py-8
              shadow-[0_18px_50px_rgba(0,0,0,0.14)]
              dark:border-zinc-700
              dark:bg-zinc-900
              dark:shadow-[0_18px_50px_rgba(0,0,0,0.45)]
              sm:px-8
              sm:py-8
            "
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="
                absolute
                right-5
                top-5
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-full
                text-zinc-800
                transition-colors
                hover:bg-zinc-100
                focus:outline-none
                focus:ring-2
                focus:ring-zinc-400/40
                dark:text-zinc-200
                dark:hover:bg-zinc-800
              "
            >
              <X
                className="h-[20px] w-[20px]"
                strokeWidth={1.8}
              />
            </button>

            {/* Title */}
            <h2
              id="confirmation-modal-title"
              className="
                pr-12
                text-[28px]
                font-normal
                leading-[1.2]
                tracking-[-0.025em]
                text-zinc-900
                dark:text-zinc-100
              "
            >
              {title}
            </h2>

            {/* Message */}
            <div
              className="
                mt-4
                max-w-[560px]
                text-[17px]
                font-normal
                leading-[1.55]
                tracking-[-0.01em]
                text-zinc-500
                dark:text-zinc-400
              "
            >
              {message}
            </div>

            {/* Action buttons */}
            <div
              className="
                mt-7
                flex
                items-center
                justify-end
                gap-3
              "
            >
              {/* Cancel button */}
              <motion.button
                ref={cancelButtonRef}
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className="
                  min-w-[125px]
                  rounded-full
                  border
                  border-zinc-300
                  bg-white
                  px-6
                  py-3
                  text-[17px]
                  font-medium
                  text-zinc-900
                  transition-colors
                  hover:bg-zinc-50
                  focus:outline-none
                  focus:ring-2
                  focus:ring-zinc-400/40
                  dark:border-zinc-600
                  dark:bg-zinc-900
                  dark:text-zinc-100
                  dark:hover:bg-zinc-800
                "
              >
                {cancelText}
              </motion.button>

              {/* Delete button */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirm}
                className={`
                  min-w-[150px]
                  rounded-full
                  border
                  px-6
                  py-3
                  text-[17px]
                  font-medium
                  transition-colors
                  focus:outline-none
                  focus:ring-2
                  focus:ring-red-500/20

                  ${
                    isDestructive
                      ? `
                        border-zinc-300
                        bg-white
                        text-[#ff2d3f]
                        hover:bg-zinc-50
                        dark:border-zinc-600
                        dark:bg-zinc-900
                        dark:text-[#ff5c6c]
                        dark:hover:bg-zinc-800
                      `
                      : `
                        border-zinc-900
                        bg-zinc-900
                        text-white
                        hover:bg-zinc-800
                        dark:border-zinc-100
                        dark:bg-zinc-100
                        dark:text-zinc-900
                        dark:hover:bg-zinc-200
                      `
                  }
                `}
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
