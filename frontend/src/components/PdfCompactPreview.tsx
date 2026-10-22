import { useEffect, useState } from 'react';
import { CircleArrowDown, X } from 'lucide-react';
import { motion } from 'motion/react';
import { renderPdfCardPreview } from '../lib/pdfThumbnail';

type Props = {
  /** Object URL or data URL of the PDF. */
  src: string;
  fileName: string;
  onClose: () => void;
};


export default function PdfCompactPreview({ src, fileName, onClose }: Props) {
  const [card, setCard] = useState<{ thumbnail: string | null; pages: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCard(null);
    setFailed(false);
    void renderPdfCardPreview(src, 480).then(result => {
      if (cancelled) return;
      if (result) setCard(result);
      else setFailed(true);
    });
    return () => { cancelled = true; };
  }, [src]);

  const pagesLabel = card ? `${card.pages} ${card.pages === 1 ? 'page' : 'pages'}` : '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 6 }}
      transition={{ duration: 0.15 }}
      className="relative flex h-[523px] max-h-[calc(100vh-32px)] w-[500px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_12px_48px_rgba(0,0,0,0.18)] dark:bg-[#262624]"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-8 pb-3 pt-7">
        <h2
          className="min-w-0 flex-1 truncate text-[26px] font-semibold leading-9 tracking-tight text-zinc-900 dark:text-zinc-50"
          data-no-translate
          title={fileName}
        >
          {fileName}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          data-tooltip="Close"
          className="-mr-2 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
        >
          <X className="h-5 w-5" strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 pb-8">
        <a
          href={src}
          download={fileName}
          aria-label={`Download ${fileName}`}
          className="group/pdf flex flex-col items-center gap-4 focus:outline-none"
        >
          <span className="block h-[333px] w-[236px] origin-center overflow-hidden rounded-[10px] border transition-transform duration-200 ease-out group-hover/pdf:-rotate-[2deg] group-hover/pdf:scale-[1.03] group-focus-visible/pdf:-rotate-[2deg] group-focus-visible/pdf:scale-[1.03] border border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] transition-all group-hover/pdf:border-[#4A83DD] group-hover/pdf:shadow-[0_0_0_2px_rgba(74,131,221,0.35)] group-focus-visible/pdf:border-[#4A83DD] group-focus-visible/pdf:shadow-[0_0_0_2px_rgba(74,131,221,0.35)] dark:border-zinc-700">
            {card?.thumbnail ? (
              <img
                src={card.thumbnail}
                alt={`First page of ${fileName}`}
                draggable={false}
                className="h-full w-full object-cover object-top"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[13px] text-zinc-400">
                {failed ? 'Preview unavailable' : 'Loading preview…'}
              </span>
            )}
          </span>

          {/* Page count by default; "Download" replaces it while hovering (or focusing) the file.
              Touch screens have no hover, so they always show "Download". */}
          <span className="relative flex h-6 min-w-[120px] items-center justify-center whitespace-nowrap text-[15px]">
            <span
              aria-hidden={failed || !pagesLabel ? undefined : true}
              className={`absolute inset-0 flex items-center justify-center gap-1.5 font-medium text-[#2F6FDE] transition-opacity duration-150 dark:text-[#6BA2F5] ${
                failed || !pagesLabel
                  ? 'opacity-100'
                  : 'opacity-0 group-hover/pdf:opacity-100 group-focus-visible/pdf:opacity-100 [@media(hover:none)]:opacity-100'
              }`}
            >
              <CircleArrowDown className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden="true" />
              Download
            </span>
            {!failed && pagesLabel && (
              <span
                className="absolute inset-0 flex items-center justify-center font-medium text-zinc-800 transition-opacity duration-150 group-hover/pdf:opacity-0 group-focus-visible/pdf:opacity-0 dark:text-zinc-100 [@media(hover:none)]:opacity-0"
              >
                {pagesLabel}
              </span>
            )}
          </span>
        </a>
      </div>
    </motion.div>
  );
}
