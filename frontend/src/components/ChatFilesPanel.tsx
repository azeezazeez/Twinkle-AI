import { useEffect } from 'react';
import type { ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  Paperclip,
  Presentation,
  X,
} from 'lucide-react';
import FileDocIcon from './FileDocIcon';

/* ------------------------------------------------------------------ */
/*  File type helpers                                                  */
/* ------------------------------------------------------------------ */

export type FileKind = 'image' | 'pdf' | 'word' | 'sheet' | 'slides' | 'archive' | 'code' | 'text' | 'other';

export type ChatFileItem = {
  /** Stable unique key. */
  key: string;
  name: string;
  mime: string;
  /** data: URL of the file (used for image thumbnails). */
  url: string;
  /** Position of the owning message, used for "Go to message". */
  messageId: string | number;
  /** Index of the attachment inside its message. */
  index: number;
  /** Short label such as PDF, DOCX, PNG. */
  badge: string;
  kind: FileKind;
};

const CODE_EXT = /\.(js|jsx|ts|tsx|css|java|py|sql|json|xml|html?|yml|yaml|sh|c|cpp|cs|go|rb|php|rs|kt|swift)$/i;

export const detectFileKind = (name: string, mime: string): FileKind => {
  const m = (mime || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (m.includes('wordprocessingml') || m === 'application/msword' || /\.(docx?|odt|rtf)$/.test(n)) return 'word';
  if (m.includes('spreadsheetml') || m === 'application/vnd.ms-excel' || /\.(xlsx?|csv|tsv|ods)$/.test(n)) return 'sheet';
  if (m.includes('presentationml') || m === 'application/vnd.ms-powerpoint' || /\.(pptx?|odp|key)$/.test(n)) return 'slides';
  if (m.includes('zip') || m.includes('compressed') || m.includes('tar') || /\.(zip|rar|7z|tar|gz)$/.test(n)) return 'archive';
  if (CODE_EXT.test(n) || m.includes('json') || m.includes('javascript') || m.includes('xml')) return 'code';
  if (m.startsWith('text/') || /\.(txt|md|markdown|log)$/.test(n)) return 'text';
  return 'other';
};

type IconComponent = ComponentType<{ className?: string; strokeWidth?: number | string }>;

const KIND_STYLE: Record<FileKind, { icon: IconComponent; label: string; tint: string }> = {
  image: { icon: FileImage, label: 'Image', tint: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300' },
  pdf: { icon: FileDocIcon, label: 'PDF', tint: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300' },
  word: { icon: FileDocIcon, label: 'Document', tint: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' },
  sheet: { icon: FileSpreadsheet, label: 'Spreadsheet', tint: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  slides: { icon: Presentation, label: 'Presentation', tint: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300' },
  archive: { icon: Archive, label: 'Archive', tint: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  code: { icon: FileCode2, label: 'Code', tint: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
  text: { icon: FileDocIcon, label: 'Text', tint: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300' },
  other: { icon: FileDocIcon, label: 'File', tint: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300' },
};

/** Colour-coded icon tile for a file type (PDF = red, Word = blue, Excel = green, ...). */
export function FileTypeIcon({ kind, size = 'md' }: { kind: FileKind; size?: 'sm' | 'md' | 'lg' }) {
  const { icon: Icon, tint } = KIND_STYLE[kind];
  const box = size === 'lg' ? 'h-12 w-12 rounded-xl' : size === 'sm' ? 'h-8 w-8 rounded-lg' : 'h-10 w-10 rounded-lg';
  const glyph = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${tint}`} aria-hidden="true">
      <Icon className={glyph} strokeWidth={1.8} />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */

/** A file produced by the assistant in this chat (for example a generated image). */
export type ChatOutputItem = {
  key: string;
  name: string;
  /** data: / https: URL of the generated file. */
  src: string;
  badge: string;
  messageId: string | number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Files the user attached in this conversation ("Uploads"). */
  files: ChatFileItem[];
  /** Files the assistant produced in this conversation ("Outputs"). */
  outputs: ChatOutputItem[];
  /** Opens a generated file in the existing preview viewer. */
  onOpenOutput: (output: ChatOutputItem) => void;
  /** Opens the Uploads popup. */
  onOpenUploads: () => void;
};

export default function ChatFilesPanel({ open, onClose, files, outputs, onOpenOutput, onOpenUploads }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  const uploadsSummary =
    files.length === 0 ? 'None' : files.length === 1 ? files[0].name : `${files.length} files`;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="files-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={onClose}
            className="fixed inset-0 z-[11990]"
            aria-hidden="true"
          />
          <motion.aside
            key="files-panel"
            role="dialog"
            aria-label="Files in this chat"
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -6, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed right-[max(1rem,env(safe-area-inset-right))] top-[calc(max(0.75rem,env(safe-area-inset-top))+3rem)] z-[11991] flex max-h-[min(560px,calc(100vh-5rem))] w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/15 dark:border-white/10 dark:bg-[#262624]"
          >
            <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
              <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">Outputs</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close files panel"
                data-tooltip="Close"
                className="rounded-lg p-1 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-2">
              {outputs.length === 0 ? (
                <p className="px-2.5 py-3 text-[13px] text-zinc-500 dark:text-zinc-400">
                  Files Twinkle creates, such as generated images, will appear here.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {outputs.map(output => (
                    <li key={output.key}>
                      <button
                        type="button"
                        onClick={() => onOpenOutput(output)}
                        title={`Open ${output.name}`}
                        className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-white/10"
                      >
                        <FileImage className="h-5 w-5 shrink-0 text-zinc-700 dark:text-zinc-300" strokeWidth={1.7} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-100" data-no-translate>
                          {output.name.replace(/\.[^.]+$/, '')}
                        </span>
                        <span className="shrink-0 text-[12.5px] text-zinc-500 dark:text-zinc-400">{output.badge}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-zinc-200 px-5 pb-4 pt-3.5 dark:border-white/10">
              <p className="mb-1.5 text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">Used in this session</p>
              <button
                type="button"
                onClick={onOpenUploads}
                title="View uploaded files"
                className="-mx-2.5 flex w-[calc(100%+1.25rem)] items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-white/10"
              >
                <Paperclip className="h-5 w-5 shrink-0 text-zinc-700 dark:text-zinc-300" strokeWidth={1.7} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-zinc-900 dark:text-zinc-100">Uploads</span>
                <span className="max-w-[55%] shrink-0 truncate text-[12.5px] text-zinc-500 dark:text-zinc-400" data-no-translate>
                  {uploadsSummary}
                </span>
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
