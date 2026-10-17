import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Search, X } from 'lucide-react';
import { APP_LANGUAGES } from '../pages/Settings';

interface LanguageModalProps {
  isOpen: boolean;
  value: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, value, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return APP_LANGUAGES.filter(
      item =>
        !q ||
        item.label.toLowerCase().includes(q) ||
        item.native.toLowerCase().includes(q) ||
        item.code.toLowerCase() === q,
    );
  }, [query]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close language dialog"
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
            aria-labelledby="language-modal-title"
            initial={{ opacity: 0, scale: 0.98, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 5 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="relative flex max-h-[min(86dvh,640px)] w-full max-w-[900px] flex-col rounded-2xl bg-white p-6 shadow-[0_18px_45px_rgba(0,0,0,0.22)] dark:bg-[#30302E] sm:p-7"
          >
            <div className="flex items-center justify-between gap-4">
              <h2 id="language-modal-title" className="text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Choose your language
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-800 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-200 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </div>

            <label className="mt-5 flex h-11 items-center gap-2.5 rounded-xl border border-[#4a86e8] bg-white px-3.5 dark:bg-transparent">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" strokeWidth={1.8} />
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search languages"
                aria-label="Search languages"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100"
              />
            </label>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <div role="listbox" aria-label="Languages" className="grid grid-cols-1 gap-x-2 gap-y-1 sm:grid-cols-2 md:grid-cols-3">
                {items.map(item => {
                  const selected = item.code === value;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onSelect(item.code)}
                      className={`flex min-h-[58px] items-center justify-between gap-3 rounded-lg px-4 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
                        selected
                          ? 'bg-[#e8f0fb] dark:bg-[#4a86e8]/20'
                          : 'hover:bg-zinc-100 dark:hover:bg-white/5'
                      }`}
                    >
                      <span className="min-w-0">
                        <span data-no-translate className="block truncate text-[15px] font-medium leading-tight text-zinc-900 dark:text-zinc-50">
                          {item.native}
                        </span>
                        <span data-no-translate className="mt-0.5 block truncate text-[14px] leading-tight text-zinc-500 dark:text-zinc-400">
                          {item.label}
                        </span>
                      </span>
                      {selected && <Check className="h-4 w-4 shrink-0 text-[#2f6fd6]" strokeWidth={2.2} />}
                    </button>
                  );
                })}
              </div>
              {items.length === 0 && (
                <p className="px-2 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">No languages found</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export default LanguageModal;
