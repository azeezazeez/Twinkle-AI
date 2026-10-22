export const COMPOSER_FILES_EVENT = 'twinkle-composer-files';

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

const pending: File[] = [];

/** Downloads a Library document's original file. Throws an Error with a readable message. */
export async function fetchLibraryFile(id: number, name: string): Promise<File> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/rag/documents/${id}/file`, { credentials: 'include', cache: 'no-store' });
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
