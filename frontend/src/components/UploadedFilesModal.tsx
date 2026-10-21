import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, ArrowLeft, Download, FileCode2, FileImage, FileSpreadsheet, Presentation, X } from 'lucide-react';
import FileDocIcon from './FileDocIcon';
import type { ChatFileItem, FileKind } from './ChatFilesPanel';
import { downloadFromUrl } from '../lib/downloadFile';

type Props = {
  open: boolean;
  onClose: () => void;
  files: ChatFileItem[];
  /** Renders the PDF viewer already used elsewhere in the chat page. */
  renderPdfPreview?: (src: string, fileName: string) => ReactNode;
  /** Extracts readable text from a DOCX file (same helper as the chat preview). */
  readDocxText?: (file: File) => Promise<string | null>;
};

const KIND_ICON: Record<FileKind, (props: { className?: string; strokeWidth?: number }) => ReactNode> = {
  image: props => <FileImage {...props} />,
  pdf: props => <FileDocIcon {...props} />,
  word: props => <FileDocIcon {...props} />,
  sheet: props => <FileSpreadsheet {...props} />,
  slides: props => <Presentation {...props} />,
  archive: props => <Archive {...props} />,
  code: props => <FileCode2 {...props} />,
  text: props => <FileDocIcon {...props} />,
  other: props => <FileDocIcon {...props} />,
};

const MAX_TEXT_PREVIEW_BYTES = 400_000;

/** "Twinkle-AI-main.zip" -> "Twinkle AI main" (the original name is kept for downloads). */
const prettyName = (name: string): string => {
  const base = name.replace(/\.[^./\\]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return base || name;
};

const dataUrlByteSize = (url: string): number => {
  const base64 = url.slice(url.indexOf('base64,') + 7).replace(/\s/g, '');
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const TEXT_LIKE = /\.(txt|csv|tsv|json|xml|html?|md|markdown|log|js|jsx|ts|tsx|css|java|py|sql|yml|yaml|sh|c|cpp|cs|go|rb|php|rs|kt|swift)$/i;

type Loaded = { key: string; objectUrl: string; file: File; text: string | null };

export default function UploadedFilesModal({ open, onClose, files, renderPdfPreview, readDocxText }: Props) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // Wide screens: the X on the preview pane collapses the dialog to the file list only.
  const [collapsed, setCollapsed] = useState(false);
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // Kept in a ref so a new function identity from the parent never reloads the preview.
  const readDocxRef = useRef(readDocxText);
  readDocxRef.current = readDocxText;

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Every time the dialog opens it starts expanded again.
  useEffect(() => {
    if (open) setCollapsed(false);
  }, [open]);

  // Wide screens open with the first file selected; narrow screens open on the list.
  useEffect(() => {
    if (!open) return;
    if (wide && collapsed) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(current => {
      if (current && files.some(file => file.key === current)) return current;
      return wide && files.length > 0 ? files[0].key : null;
    });
  }, [open, wide, files, collapsed]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const selected = useMemo(() => files.find(file => file.key === selectedKey) ?? null, [files, selectedKey]);

  // Rebuild the selected file from its saved bytes so it can be previewed and downloaded.
  useEffect(() => {
    setLoaded(null);
    if (!open || !selected) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const blob = await (await fetch(selected.url)).blob();
        const file = new File([blob], selected.name, { type: selected.mime || blob.type });
        objectUrl = URL.createObjectURL(file);
        let text: string | null = null;
        const isDocx = /\.docx$/i.test(selected.name) || selected.mime.includes('wordprocessingml');
        if (isDocx && readDocxRef.current) {
          text = (await readDocxRef.current(file)) || 'No readable text was found in this DOCX file.';
        } else if (selected.kind === 'text' || selected.kind === 'code' || TEXT_LIKE.test(selected.name) || selected.mime.startsWith('text/')) {
          text = await file.slice(0, MAX_TEXT_PREVIEW_BYTES).text();
        }
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setLoaded({ key: selected.key, objectUrl, file, text });
      } catch {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, selected]);

  const download = (file: ChatFileItem) => {
    void downloadFromUrl(file.url, file.name).catch(() => undefined);
  };

  if (typeof document === 'undefined') return null;

  // `split` = list + preview side by side. Collapsed (or narrow) = one pane at a time.
  const split = wide && !collapsed;
  const showList = split || !selected;
  const showDetail = split || !!selected;

  const selectFile = (key: string) => {
    setCollapsed(false);
    setSelectedKey(key);
  };

  // The X on the preview pane: wide screens fall back to the list-only dialog,
  // narrow screens already have a Back arrow so X closes the dialog.
  const collapseOrClose = () => {
    if (wide) {
      setCollapsed(true);
      setSelectedKey(null);
    } else {
      onClose();
    }
  };
  const ready = loaded && selected && loaded.key === selected.key ? loaded : null;

  const renderBody = (file: ChatFileItem): ReactNode => {
    if (file.kind === 'image') {
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6">
          <img src={file.url} alt={file.name} draggable={false} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      );
    }
    if (file.kind === 'pdf' && ready && renderPdfPreview) {
      return <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">{renderPdfPreview(ready.objectUrl, file.name)}</div>;
    }
    if (ready?.text != null) {
      return (
        <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
          <pre className="min-h-full whitespace-pre-wrap break-words rounded-xl bg-zinc-50 p-4 font-mono text-[13px] leading-relaxed text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">{ready.text}</pre>
        </div>
      );
    }
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-6 pb-16 text-center">
        <FileDocIcon className="h-24 w-24 text-zinc-900 dark:text-zinc-100" strokeWidth={1.2} />
        <p className="mt-6 text-[20px] font-medium text-zinc-900 dark:text-zinc-100" data-no-translate>{prettyName(file.name)}</p>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
          {file.badge}
          {' · '}
          {formatSize(ready ? ready.file.size : dataUrlByteSize(file.url))}
        </p>
        <p className="mt-3 text-[14px] text-zinc-600 dark:text-zinc-400">No preview available</p>
      </div>
    );
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[12010] flex items-center justify-center p-4">
          <motion.div
            key="uploads-backdrop"
            aria-hidden="true"
            className="absolute inset-0 bg-black/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
          />
          <motion.div
            key="uploads-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Uploads"
            initial={{ opacity: 0, scale: 0.98, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: 0.16 }}
            className={`relative flex overflow-hidden rounded-[22px] bg-white shadow-2xl dark:bg-[#262624] ${
              split
                ? 'h-[min(760px,calc(100vh-32px))] w-[min(1100px,calc(100vw-32px))]'
                : wide
                  ? 'h-[min(760px,calc(100vh-32px))] w-[min(640px,calc(100vw-32px))]'
                  : 'max-h-[calc(100vh-32px)] min-h-[min(480px,calc(100vh-32px))] w-[min(460px,calc(100vw-32px))]'
            }`}
          >
            {showList && (
              <section className={`flex min-h-0 flex-col ${split ? 'w-[34%] min-w-[260px] max-w-[380px] border-r border-zinc-200 dark:border-white/10' : 'w-full'}`}>
                <header className="flex items-center justify-between px-7 pb-3 pt-7">
                  <h2 className="text-[26px] font-semibold leading-none tracking-tight text-zinc-900 dark:text-zinc-50">Uploads</h2>
                  {!split && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close uploads"
                      data-tooltip="Close"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                    >
                      <X className="h-5 w-5" strokeWidth={1.8} />
                    </button>
                  )}
                </header>
                <ul className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3">
                  {files.length === 0 && (
                    <li className="px-4 py-3 text-[14px] text-zinc-500 dark:text-zinc-400">No uploads in this chat yet.</li>
                  )}
                  {files.map(file => {
                    const Icon = KIND_ICON[file.kind];
                    const active = split && selectedKey === file.key;
                    return (
                      <li key={file.key} className="group/row relative">
                        <button
                          type="button"
                          onClick={() => selectFile(file.key)}
                          title={file.name}
                          aria-current={active ? 'true' : undefined}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 pr-12 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 ${
                            active ? 'bg-zinc-200/70 dark:bg-white/10' : 'hover:bg-zinc-100 dark:hover:bg-white/5'
                          }`}
                        >
                          <span className="shrink-0 text-zinc-700 dark:text-zinc-300">{Icon({ className: 'h-5 w-5', strokeWidth: 1.7 })}</span>
                          <span className="min-w-0 flex-1 truncate text-[15px] text-zinc-900 dark:text-zinc-100" data-no-translate>{prettyName(file.name)}</span>
                          <span className="shrink-0 text-[12px] font-medium uppercase text-zinc-500 dark:text-zinc-400">{file.badge}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => download(file)}
                          aria-label={`Download ${file.name}`}
                          data-tooltip="Download"
                          className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-600 opacity-0 transition hover:bg-zinc-200 focus:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 dark:text-zinc-300 dark:hover:bg-white/10"
                        >
                          <Download className="h-4 w-4" strokeWidth={1.8} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {showDetail && (
              <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#FAF9F5] dark:bg-[#1F1E1D]">
                <header className="flex shrink-0 items-center justify-between gap-3 px-7 pb-3 pt-6">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {!wide && (
                      <button
                        type="button"
                        onClick={() => setSelectedKey(null)}
                        aria-label="Back to uploads"
                        data-tooltip="Back"
                        className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
                      >
                        <ArrowLeft className="h-5 w-5" strokeWidth={1.8} />
                      </button>
                    )}
                    {selected && (
                      <h3 className="min-w-0 truncate text-[17px] font-medium text-zinc-900 dark:text-zinc-100" data-no-translate title={selected.name}>
                        {prettyName(selected.name)}
                        <span className="ml-2 text-[12px] font-normal uppercase text-zinc-500 dark:text-zinc-400">{selected.badge}</span>
                      </h3>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {selected && (
                      <button
                        type="button"
                        onClick={() => download(selected)}
                        aria-label={`Download ${selected.name}`}
                        data-tooltip="Download"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-white/10"
                      >
                        <Download className="h-5 w-5" strokeWidth={1.8} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={collapseOrClose}
                      aria-label={wide ? 'Collapse preview' : 'Close uploads'}
                      data-tooltip={wide ? 'Collapse' : 'Close'}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-200/70 dark:text-zinc-300 dark:hover:bg-white/10"
                    >
                      <X className="h-5 w-5" strokeWidth={1.8} />
                    </button>
                  </div>
                </header>
                {selected ? (
                  renderBody(selected)
                ) : (
                  <div className="flex flex-1 items-center justify-center px-6 text-[14px] text-zinc-500 dark:text-zinc-400">
                    Select a file to see its details.
                  </div>
                )}
              </section>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
