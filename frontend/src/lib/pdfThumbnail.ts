const PDFJS_MODULE_URL: string = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs';
const PDFJS_WORKER_URL: string = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';

const cache = new Map<string, Promise<string | null>>();

/** Renders page 1 of a PDF (object URL or data URL) into a small JPEG data URL, or null if it cannot. */
export const renderPdfThumbnail = (src: string, width = 240): Promise<string | null> => {
  const key = `${width}:${src}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const task = (async (): Promise<string | null> => {
    let pdf: any = null;
    try {
      const pdfjs: any = await import(/* @vite-ignore */ PDFJS_MODULE_URL);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      pdf = await pdfjs.getDocument({ url: src, disableAutoFetch: true, disableStream: true }).promise;
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.max(0.1, width / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return null;
      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch {
      return null;
    } finally {
      try { await pdf?.destroy?.(); } catch { /* ignore */ }
    }
  })();

  cache.set(key, task);
  void task.then(result => { if (!result) cache.delete(key); });
  return task;
};

export type PdfCardPreview = { thumbnail: string | null; pages: number };

const cardCache = new Map<string, Promise<PdfCardPreview | null>>();

/**
 * Renders page 1 of a PDF at a larger size together with the page count. Used by the
 * compact file preview dialog ("1 page" under the thumbnail).
 */
export const renderPdfCardPreview = (src: string, width = 480): Promise<PdfCardPreview | null> => {
  const key = `${width}:${src}`;
  const cached = cardCache.get(key);
  if (cached) return cached;

  const task = (async (): Promise<PdfCardPreview | null> => {
    let pdf: any = null;
    try {
      const pdfjs: any = await import(/* @vite-ignore */ PDFJS_MODULE_URL);
      pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      pdf = await pdfjs.getDocument({ url: src, disableAutoFetch: true, disableStream: true }).promise;
      const pages = Math.max(1, Number(pdf.numPages) || 1);
      const page = await pdf.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.max(0.1, width / base.width) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return { thumbnail: null, pages };
      await page.render({ canvasContext: context, viewport }).promise;
      return { thumbnail: canvas.toDataURL('image/jpeg', 0.9), pages };
    } catch {
      return null;
    } finally {
      try { await pdf?.destroy?.(); } catch { /* ignore */ }
    }
  })();

  cardCache.set(key, task);
  void task.then(result => { if (!result) cardCache.delete(key); });
  return task;
};
