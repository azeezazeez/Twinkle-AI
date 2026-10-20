import { useEffect, useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  ArrowUpRight,
  FileCode2,
  FileImage,
  FileSpreadsheet,
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

type Tab = 'all' | 'images' | 'documents';

type Props = {
  open: boolean;
  onClose: () => void;
  files: ChatFileItem[];
  /** Opens the file in the existing preview viewer. */
  onOpenFile: (file: ChatFileItem) => void;
  /** Scrolls the conversation to the message that contains the file. */
  onGoToMessage?: (file: ChatFileItem) => void;
};

export default function ChatFilesPanel({ open, onClose, files, onOpenFile, onGoToMessage }: Props) {
  const [tab, setTab] = useState<Tab>('all');

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const images = useMemo(() => files.filter(f => f.kind === 'image'), [files]);
  const documents = useMemo(() => files.filter(f => f.kind !== 'image'), [files]);

  const showImages = tab === 'all' || tab === 'images';
  const showDocuments = tab === 'all' || tab === 'documents';

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: 'All', count: files.length },
    { id: 'images', label: 'Images', count: images.length },
    { id: 'documents', label: 'Documents', count: documents.length },
  ];

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="files-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-[11990] bg-black/30 backdrop-blur-[1px]"
            aria-hidden="true"
          />
          <motion.aside
            key="files-panel"
            role="dialog"
            aria-label="Files in this chat"
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-[11991] flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-black/20 dark:border-white/10 dark:bg-[#262624]"
          >
            <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold text-zinc-900 dark:text-zinc-50">Files in this chat</h2>
                <p className="mt-0.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">
                  {files.length === 0
                    ? 'Nothing attached yet'
                    : `${files.length} ${files.length === 1 ? 'file' : 'files'} shared in this conversation`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close files panel"
                className="rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
              >
                <X className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </header>

            <div className="flex gap-1.5 px-5 pb-3" role="tablist" aria-label="File filter">
              {tabs.map(item => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${
                    tab === item.id
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15'
                  }`}
                >
                  {item.label} <span className="opacity-60">{item.count}</span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {files.length === 0 && (
                <div className="flex h-full min-h-[220px] flex-col items-center justify-center text-center">
                  <FileTypeIcon kind="other" size="lg" />
                  <p className="mt-3 text-[14px] font-medium text-zinc-800 dark:text-zinc-100">No files yet</p>
                  <p className="mt-1 max-w-[240px] text-[12.5px] text-zinc-500 dark:text-zinc-400">
                    Images and documents you attach to messages will appear here.
                  </p>
                </div>
              )}

              {showImages && images.length > 0 && (
                <section className="mb-5">
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                    Images
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {images.map(file => (
                      <button
                        key={file.key}
                        type="button"
                        onClick={() => onOpenFile(file)}
                        title={file.name}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-white/10 dark:bg-zinc-800"
                      >
                        <img
                          src={file.url}
                          alt={file.name}
                          loading="lazy"
                          draggable={false}
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {showDocuments && documents.length > 0 && (
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 dark:text-zinc-500">
                    Documents
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {documents.map(file => (
                      <li key={file.key}>
                        <div className="group flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:border-white/10 dark:hover:bg-white/5">
                          <button
                            type="button"
                            onClick={() => onOpenFile(file)}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
                            title={`Open ${file.name}`}
                          >
                            <FileTypeIcon kind={file.kind} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-medium text-zinc-900 dark:text-zinc-100">
                                {file.name}
                              </span>
                              <span className="block text-[11.5px] text-zinc-500 dark:text-zinc-400">
                                {KIND_STYLE[file.kind].label} · {file.badge}
                              </span>
                            </span>
                          </button>
                          {onGoToMessage && (
                            <button
                              type="button"
                              onClick={() => onGoToMessage(file)}
                              aria-label={`Go to the message with ${file.name}`}
                              title="Go to message"
                              className="rounded-md p-1.5 text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-800 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 dark:hover:bg-white/10 dark:hover:text-zinc-100"
                            >
                              <ArrowUpRight className="h-4 w-4" strokeWidth={1.9} />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
