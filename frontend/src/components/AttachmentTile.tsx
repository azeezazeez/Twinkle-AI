import { X } from 'lucide-react';
import type { ReactNode } from 'react';


export const ATTACHMENT_TILE_SIZE = 150;

type Props = {
  name: string;
  /** Short badge text such as ZIP, PDF, DOCX. */
  badge?: string;
  /** When set, the tile shows the picture full-bleed instead of the name + badge. */
  imageSrc?: string | null;
  onClick?: () => void;
  onRemove?: () => void;
  title?: string;
  children?: ReactNode;
};

export default function AttachmentTile({ name, badge, imageSrc, onClick, onRemove, title, children }: Props) {
  const body = imageSrc ? (
    <img
      src={imageSrc}
      alt={name}
      draggable={false}
      className="h-full w-full object-cover transition-transform duration-200 group-hover/tile:scale-[1.03]"
    />
  ) : (
    <div className="flex h-full w-full flex-col justify-between p-3.5 text-left">
      <span
        className="line-clamp-3 break-words text-[14px] font-medium leading-snug text-zinc-900 dark:text-zinc-100"
        title={name}
      >
        {name}
      </span>
      <span className="w-fit rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
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
        className="block h-full w-full overflow-hidden rounded-2xl border border-zinc-300/80 bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-500"
      >
        {body}
      </button>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 opacity-0 shadow-sm transition-opacity hover:bg-zinc-100 focus:opacity-100 group-hover/tile:opacity-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
