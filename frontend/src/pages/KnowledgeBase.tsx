import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Check, FileText, LoaderCircle, Search, Send, Trash2, UploadCloud, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../lib/api';
import { toast } from '../lib/toast';
import ConfirmationModal from '../components/ConfirmationModal';
import { numberDuplicateNames } from '../lib/docNames';

type Doc = { id: number; name: string; status: string; size: number; chunkCount: number; createdAt?: string };
type Source = { citation: string; documentId: number; documentName: string; chunk: number; excerpt: string };
type Answer = { answer: string; sources: Source[] };

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = '.pdf,.doc,.docx,.txt,.md,.rtf,.html,.csv,.ppt,.pptx,.odt';

const fmt = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function Library() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState('');
  const [dragging, setDragging] = useState(false);
  const [filter, setFilter] = useState('');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Doc | null>(null);
  // Documents the next question is limited to. Empty means "search everything".
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await fetchWithAuth('/api/rag/documents');
      setDocs(Array.isArray(data) ? (data as Doc[]) : []);
    } catch {
      setError('Could not load your library. Please sign in again or check the backend.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Keep the list fresh: documents attached in chat are indexed in the background,
  // so reload when the tab regains focus, when chat reports an upload, and every
  // few seconds while anything is still being processed.
  useEffect(() => {
    const refresh = () => { void load(); };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('twinkle-library-updated', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('twinkle-library-updated', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const hasProcessing = useMemo(() => docs.some(d => d.status === 'PROCESSING'), [docs]);
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => { void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [hasProcessing, load]);

  // Copies of the same file are shown as "Name (1)", "Name (2)", ...
  const displayNames = useMemo(() => numberDuplicateNames(docs), [docs]);
  const nameOf = (doc: Doc) => displayNames.get(doc.id) ?? doc.name;

  useEffect(() => {
    setSelectedIds(ids => {
      const valid = ids.filter(id => docs.some(d => d.id === id && d.status === 'READY'));
      return valid.length === ids.length ? ids : valid;
    });
  }, [docs]);

  const toggleSelected = (id: number) =>
    setSelectedIds(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));

  const visibleDocs = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? docs.filter(d => (displayNames.get(d.id) ?? d.name).toLowerCase().includes(q)) : docs;
  }, [docs, filter, displayNames]);

  const uploadOne = async (file: File): Promise<'ok' | 'failed'> => {
    if (file.size > MAX_BYTES) { toast.error(`${file.name} is larger than 15 MB.`); return 'failed'; }
    if (file.size === 0) { toast.error(`${file.name} is empty.`); return 'failed'; }
    try {
      const form = new FormData();
      form.append('file', file);
      const uploaded = (await fetchWithAuth('/api/rag/documents', { method: 'POST', body: form })) as Partial<Doc>;
      if (uploaded.status && uploaded.status !== 'READY') {
        toast.info(`${file.name} finished with status ${uploaded.status}`);
        return 'failed';
      }
      return 'ok';
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not upload ${file.name}.`);
      return 'failed';
    }
  };

  const upload = async (files: File[]) => {
    if (!files.length || uploading) return;
    setError('');
    setAnswer(null);
    setUploading(true);
    let added = 0;
    try {
      for (let i = 0; i < files.length; i += 1) {
        setUploadLabel(files.length > 1 ? `Processing ${i + 1} of ${files.length}…` : 'Processing and indexing…');
        const result = await uploadOne(files[i]);
        if (result === 'ok') added += 1;
      }
      await load();
      if (added) toast.success(added === 1 ? 'Document added to your library' : `${added} documents added to your library`);
    } finally {
      setUploading(false);
      setUploadLabel('');
    }
  };

  const remove = async (doc: Doc) => {
    try {
      await fetchWithAuth(`/api/rag/documents/${doc.id}`, { method: 'DELETE' });
      setDocs(list => list.filter(x => x.id !== doc.id));
      setAnswer(null);
      toast.success('Document deleted');
    } catch {
      toast.error('Could not delete that document.');
    }
  };

  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true);
    setError('');
    try {
      const result = await fetchWithAuth('/api/rag/ask', { method: 'POST', body: JSON.stringify({ question: question.trim(), documentIds: selectedIds.length ? selectedIds : undefined }) });
      setAnswer(result as Answer);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not answer that question.';
      setError(message);
      toast.error(message);
    } finally {
      setAsking(false);
    }
  };

  // Drag and drop (depth counter avoids flicker when crossing child elements).
  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    void upload(Array.from(e.dataTransfer.files));
  };

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 md:px-8">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-2 rounded-xl border border-zinc-300/70 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5"
        >
          <ArrowLeft size={16} /> Back to chat
        </button>

        <header className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#C6613F]/30 bg-[#C6613F]/10 px-3 py-1 text-xs text-[#C6613F]">
            <BookOpen size={14} /> TWINKLE · LIBRARY
          </div>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Chat with your documents</h1>
          <p className="mt-2 max-w-2xl text-zinc-500 dark:text-zinc-400">
            Upload your own material and ask questions grounded in its contents. Your documents are private to your account.
          </p>
        </header>

        <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-white/[0.035]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-medium">Your documents</h2>
              <span className="text-xs text-zinc-500">{docs.length} uploaded</span>
            </div>

            <div
              onDragEnter={onDragEnter}
              onDragOver={e => { if (dragging) e.preventDefault(); }}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) { e.preventDefault(); fileInputRef.current?.click(); } }}
              aria-label="Upload documents"
              className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed px-4 py-7 text-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C6613F]/60 ${
                dragging
                  ? 'border-[#C6613F] bg-[#C6613F]/15'
                  : 'border-[#C6613F]/40 bg-[#C6613F]/[0.05] hover:bg-[#C6613F]/[0.10]'
              } ${uploading ? 'pointer-events-none opacity-80' : ''}`}
            >
              {uploading ? (
                <LoaderCircle className="mb-3 animate-spin text-[#C6613F]" size={25} />
              ) : (
                <UploadCloud className="mb-3 text-[#C6613F]" size={25} />
              )}
              <span className="font-medium">
                {uploading ? uploadLabel : dragging ? 'Drop to upload' : 'Upload or drop documents'}
              </span>
              <span className="mt-1 text-xs text-zinc-500">PDF, DOCX, TXT and text-based files · 15 MB max each</span>
              {uploading && (
                <span className="absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-[#C6613F]/15" aria-hidden="true">
                  <span className="block h-full w-1/3 animate-[librarySlide_1.2s_ease-in-out_infinite] rounded-full bg-[#C6613F]" />
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept={ACCEPT}
                disabled={uploading}
                onChange={e => { const picked = Array.from(e.target.files ?? []); e.currentTarget.value = ''; void upload(picked); }}
              />
            </div>
            <style>{'@keyframes librarySlide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'}</style>

            {docs.length > 4 && (
              <div className="relative mt-4">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  placeholder="Search your documents"
                  aria-label="Search your documents"
                  className="h-9 w-full rounded-xl border border-zinc-300/70 bg-white pl-9 pr-8 text-sm outline-none placeholder:text-zinc-400 focus:border-[#C6613F]/60 dark:border-white/10 dark:bg-black/20"
                />
                {filter && (
                  <button onClick={() => setFilter('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
                    <X size={14} />
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 space-y-2">
              {loading ? (
                <p className="py-5 text-center text-sm text-zinc-500">Loading documents…</p>
              ) : docs.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-500">Your library is empty. Upload a document to get started.</div>
              ) : visibleDocs.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-500">No documents match “{filter}”.</div>
              ) : (
                visibleDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/[0.07] dark:bg-black/10">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selectedIds.includes(doc.id)}
                      aria-label={`Only search ${nameOf(doc)}`}
                      title={doc.status === 'READY' ? 'Limit questions to this document' : 'Available once processing finishes'}
                      disabled={doc.status !== 'READY'}
                      onClick={() => toggleSelected(doc.id)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        selectedIds.includes(doc.id)
                          ? 'border-[#C6613F] bg-[#C6613F] text-white'
                          : 'border-zinc-300 bg-white text-transparent hover:border-[#C6613F]/60 dark:border-white/20 dark:bg-transparent'
                      }`}
                    >
                      <Check size={13} strokeWidth={3} />
                    </button>
                    <FileText className="shrink-0 text-[#C6613F]" size={20} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{nameOf(doc)}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {doc.status === 'READY' ? `${doc.chunkCount || 0} chunks · ${fmt(doc.size || 0)}` : doc.status}
                      </div>
                    </div>
                    <button
                      title="Delete document"
                      aria-label={`Delete ${nameOf(doc)}`}
                      onClick={() => setPendingDelete(doc)}
                      className="rounded-lg p-2 text-zinc-500 hover:bg-red-400/10 hover:text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 dark:border-white/10 dark:bg-white/[0.035]">
            <h2 className="mb-1 font-medium">Ask your library</h2>
            <p className="mb-2 text-sm text-zinc-500">Answers use relevant passages from your indexed documents.</p>
            <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500">
              <span className="rounded-full border border-[#C6613F]/30 bg-[#C6613F]/10 px-2.5 py-1 text-[#C6613F]">
                {selectedIds.length === 0
                  ? 'Searching all documents'
                  : `Searching ${selectedIds.length} selected document${selectedIds.length === 1 ? '' : 's'}`}
              </span>
              {selectedIds.length > 0 && (
                <button type="button" onClick={() => setSelectedIds([])} className="underline-offset-2 hover:underline">
                  Search all
                </button>
              )}
              {selectedIds.length === 0 && docs.length > 1 && (
                <span>Tick a document to limit your question to it.</span>
              )}
            </div>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }}
              placeholder="What are the main ideas in my notes?"
              rows={4}
              maxLength={4000}
              className="w-full resize-y rounded-xl border border-zinc-300/70 bg-white p-4 text-sm outline-none placeholder:text-zinc-400 focus:border-[#C6613F]/60 dark:border-white/10 dark:bg-black/20 dark:placeholder:text-zinc-600"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-zinc-500">Enter to ask · Shift+Enter for a new line</span>
              <button
                disabled={asking || !question.trim() || docs.length === 0}
                onClick={() => void ask()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#C6613F] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#D97757] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {asking ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={15} />} Ask
              </button>
            </div>

            {answer && (
              <div className="mt-6 border-t border-zinc-200 pt-5 dark:border-white/10">
                <h3 className="mb-3 text-sm font-semibold text-[#C6613F]">Twinkle's answer</h3>
                <div className="whitespace-pre-wrap text-sm leading-7 text-zinc-800 dark:text-zinc-200">{answer.answer}</div>
                {answer.sources?.length > 0 && (
                  <div className="mt-5">
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Retrieved sources</h4>
                    <div className="space-y-2">
                      {answer.sources.map((s, i) => (
                        <div key={`${s.documentId}-${s.chunk}-${i}`} className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/[0.08] dark:bg-black/10">
                          <div className="text-xs font-medium text-[#C6613F]">{s.citation} {s.documentName} · chunk {s.chunk}</div>
                          <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{s.excerpt}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/5 p-3 text-sm text-red-600 dark:text-red-200">
            <span>{error}</span>
            <button onClick={() => setError('')} aria-label="Dismiss" className="ml-auto text-red-400">×</button>
          </div>
        )}
        <p className="mt-6 text-xs leading-5 text-zinc-500">
          AI-generated answers can be incorrect. Check the cited source excerpts before relying on important information.
        </p>
      </div>

      <ConfirmationModal
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
        title="Delete document?"
        message={<>“{pendingDelete ? nameOf(pendingDelete) : ''}” and its indexed passages will be permanently removed from your library.</>}
        confirmText="Delete"
      />
    </main>
  );
}
