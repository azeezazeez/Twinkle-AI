import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom'; 
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface UploadFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Opens the native file picker. */
  onChooseFiles: () => void;
  /** Called with files dropped onto the drop zone. */
  onFilesDropped: (files: FileList) => void;
}

const UploadFilesModal = ({ isOpen, onClose, onChooseFiles, onFilesDropped }: UploadFilesModalProps) => {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDragging(false);
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close upload dialog"
            className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Upload or add files"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.16 }}
            className="relative flex w-full max-w-[640px] flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl dark:bg-zinc-900"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
              <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">Upload or add files</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
                </button>
              </div>
            </div>

            <div className="p-5">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (e.dataTransfer.files?.length) onFilesDropped(e.dataTransfer.files);
                }}
                className={`flex h-[446px] max-h-[60vh] flex-col items-center justify-center rounded-2xl border text-center transition-colors ${
                  dragging
                    ? 'border-zinc-400 bg-zinc-50 dark:border-zinc-500 dark:bg-zinc-800/60'
                    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                }`}
              >
                <p className="text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Drag files or photos here</p>
                <p className="mt-2.5 px-4 text-[13px] text-zinc-500 dark:text-zinc-400">
                  Documents, images, spreadsheets, and code files
                </p>
                <button
                  type="button"
                  onClick={onChooseFiles}
                  className="mt-4 rounded-lg border border-zinc-300 bg-white px-4 py-1.5 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Choose files
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default UploadFilesModal;
