export const COMPOSER_FILES_EVENT = 'twinkle-composer-files';
/** Fired while Library files are downloading so the composer can show its loading spinner. */
export const LIBRARY_DOWNLOAD_EVENT = 'twinkle-library-download';

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

const pending: File[] = [];

/** Downloads a Library document's original file. Throws an Error with a readable message. */
export async function fetchLibraryFile(id: number, name: string): Promise<File> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/rag/documents/${id}/file`, { credentials: 'include' });
  } catch {
    throw new Error('Could not reach the server. Please try again.');
  }
  if (!response.ok) {
    let message = 'This file could not be opened from your Library.';
    try {
      const data = await response.json();
      if (typeof data?.error === 'string' && data.error) message = data.error;
    } catch { /* keep the default message */ }
    throw new Error(message);
  }
  const blob = await response.blob();
  const type = blob.type || response.headers.get('content-type') || 'application/octet-stream';
  return new File([blob], name, { type, lastModified: Date.now() });
}

/** Hands files to the chat composer (now if the chat page is open, otherwise when it opens). */
export function sendFilesToComposer(files: File[]) {
  if (!files.length) return;
  pending.push(...files);
  window.dispatchEvent(new CustomEvent(COMPOSER_FILES_EVENT));
}

/** Files waiting for the composer. Returns them once and clears the queue. */
export function takeComposerFiles(): File[] {
  return pending.splice(0, pending.length);
}

// Downloads started early (hovering a row) so "Add to chat" is usually instant. Small cap: files can be up to 15 MB.
const cache = new Map<number, Promise<File>>();
const CACHE_LIMIT = 4;

function cachedFile(id: number, name: string): Promise<File> {
  let promise = cache.get(id);
  if (!promise) {
    promise = fetchLibraryFile(id, name);
    cache.set(id, promise);
    promise.catch(() => cache.delete(id)); // never keep a failed download
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }
  return promise;
}

/** Start downloading a Library file in the background (hover / menu open). Errors are ignored here. */
export function prefetchLibraryFile(id: number, name: string) {
  void cachedFile(id, name).catch(() => undefined);
}

/** Forget a deleted file. */
export function forgetLibraryFile(id: number) {
  cache.delete(id);
}

/**
 * Adds Library files to the composer. The composer shows its loading spinner while the
 * files download, so the caller can close the dialog straight away.
 */
export async function attachLibraryFiles(list: Array<{ id: number; name: string }>): Promise<void> {
  if (!list.length) return;
  window.dispatchEvent(new CustomEvent(LIBRARY_DOWNLOAD_EVENT, { detail: { active: true } }));
  try {
    const files = await Promise.all(list.map(item => cachedFile(item.id, item.name)));
    sendFilesToComposer(files);
  } finally {
    window.dispatchEvent(new CustomEvent(LIBRARY_DOWNLOAD_EVENT, { detail: { active: false } }));
  }
}
