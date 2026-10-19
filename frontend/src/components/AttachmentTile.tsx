import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';


export const ATTACHMENT_TILE_SIZE = 120;

/** Images whose longest side is below this (in px) get the "Low res" badge. */
export const LOW_RES_MAX_SIDE = 512;

export const LOW_RES_TOOLTIP = 'Attach a higher resolution image for better results';

type Props = {
  name: string;
  /** Short badge text such as ZIP, PDF, DOCX. */
  badge?: string;
  /** When set, the tile shows the picture full-bleed instead of the name + badge. */
  imageSrc?: string | null;
  /** Show the amber "Low res" badge when the image is small (composer only). */
  warnLowRes?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  title?: string;
  children?: ReactNode;
};

export default function AttachmentTile({
  name,
  badge,
  imageSrc,
  warnLowRes = false,
  onClick,
  onRemove,
  title,
  children,
}: Props) {
  const [lowRes, setLowRes] = useState(false);

  const body = imageSrc ? (
    <img
      src={imageSrc}
      alt={name}
      draggable={false}
      decoding="async"
      onLoad={(event) => {
        // Measured from the real pixels of the original file; never resampled.
        const { naturalWidth, naturalHeight } = event.currentTarget;
        setLowRes(
          naturalWidth > 0 &&
            naturalHeight > 0 &&
            Math.max(naturalWidth, naturalHeight) < LOW_RES_MAX_SIDE
        );
      }}
      className="h-full w-full object-cover transition-transform duration-200 group-hover/tile:scale-[1.03]"
    />
  ) : (
    <div className="flex h-full w-full flex-col justify-between p-3 text-left">
      <span
        className="line-clamp-3 break-words text-[13px] font-normal leading-snug text-zinc-900 dark:text-zinc-100"
        title={name}
      >
        {name}
      </span>
      <span className="w-fit rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        {badge || 'FILE'}
      </span>
    </div>
  );

  return (
    <div
      data-no-translate
      className="group/tile relative shrink-0"
      style={{ width: ATTACHMENT_TILE_SIZE, height: ATTACHMENT_TILE_SIZE }}
    >
      <button
        type="button"
        onClick={onClick}
        title={title || name}
        className="block h-full w-full overflow-hidden rounded-xl border border-zinc-300/80 bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500"
      >
        {body}
      </button>

      {warnLowRes && imageSrc && lowRes && (
        <span
          tabIndex={0}
          data-tooltip={LOW_RES_TOOLTIP}
          data-tooltip-side="top"
          className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-amber-200 px-1.5 py-1 text-[12px] font-medium leading-none text-amber-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
        >
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Low res
        </span>
      )}

      {children}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 opacity-0 shadow-sm transition-opacity hover:bg-zinc-100 focus:opacity-100 group-hover/tile:opacity-100 [@media(hover:none)]:opacity-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
