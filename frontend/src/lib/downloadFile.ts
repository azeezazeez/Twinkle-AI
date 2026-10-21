/** Removes characters that browsers/OSes reject, but keeps the original name and extension. */
export const safeDownloadName = (name: string, fallback = 'download'): string => {
  const cleaned = (name || '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '_')
    .replace(/^[.\s]+|[\s.]+$/g, '')
    .trim();
  return cleaned || fallback;
};

/**
 * Saves a file under its ORIGINAL filename.
 * `data:` and remote URLs are turned into a Blob first, because browsers ignore the
 * `download` name for some data URLs and cross-origin links.
 */
export const downloadFromUrl = async (url: string, filename: string): Promise<void> => {
  const name = safeDownloadName(filename);
  let href = url;
  let revoke: string | null = null;
  try {
    if (!url.startsWith('blob:')) {
      const blob = await (await fetch(url)).blob();
      href = URL.createObjectURL(blob);
      revoke = href;
    }
    const link = document.createElement('a');
    link.href = href;
    link.download = name;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    if (revoke) window.setTimeout(() => URL.revokeObjectURL(revoke as string), 4000);
  }
};
