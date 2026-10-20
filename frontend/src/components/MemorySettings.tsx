import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { memoryApi, type MemorySnapshot } from '../lib/api';
import { toast } from '../lib/toast';

const MAX_LENGTH = 300;

export default function MemorySettings() {
  const [data, setData] = useState<MemorySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await memoryApi.get());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load memory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<MemorySnapshot>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try {
      setData(await action());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const enabled = data?.enabled ?? true;
  const memories = data?.memories ?? [];

  const addDraft = async () => {
    const content = draft.trim();
    if (!content) return;
    setDraft('');
    await run(() => memoryApi.add(content), 'Could not save memory.');
  };

  return (
    <div className="mt-10">
      <div className="flex min-h-[36px] items-center justify-between gap-3">
        <h2 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Memory</h2>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Use memory"
          disabled={busy || loading}
          onClick={() => void run(() => memoryApi.setEnabled(!enabled), 'Could not update memory setting.')}
          className={`relative mr-11 h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-60 md:mr-12 ${
            enabled
              ? 'border-[#2C84DB] bg-[#2C84DB]'
              : 'border-zinc-300 bg-zinc-200 dark:border-white/15 dark:bg-white/10'
          }`}
        >
          <span
            className={`absolute left-0.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? 'translate-x-[20px]' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
        When on, Twinkle remembers useful details you share (like your work or preferences) and uses them in future chats.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          value={draft}
          maxLength={MAX_LENGTH}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') void addDraft();
          }}
          placeholder="Add something for Twinkle to remember…"
          className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-transparent px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/10 dark:text-zinc-50 dark:focus:border-white/30"
        />
        <button
          type="button"
          onClick={() => void addDraft()}
          disabled={busy || !draft.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-900 hover:bg-zinc-100 disabled:opacity-50 dark:border-white/10 dark:text-zinc-50 dark:hover:bg-white/5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-500">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : memories.length === 0 ? (
          <p className="py-4 text-sm text-zinc-500 dark:text-zinc-400">Nothing saved yet.</p>
        ) : (
          <ul>
            {memories.map(item => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-zinc-200/70 py-3 last:border-0 dark:border-white/10"
              >
                <span className="min-w-0 break-words text-[14px] text-zinc-900 dark:text-zinc-50">{item.content}</span>
                <button
                  type="button"
                  aria-label="Delete memory"
                  disabled={busy}
                  onClick={() => void run(() => memoryApi.remove(item.id), 'Could not delete memory.')}
                  className="shrink-0 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-white/10 dark:hover:text-zinc-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {memories.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (window.confirm('Delete all saved memories? This cannot be undone.')) {
              void run(() => memoryApi.clear(), 'Could not clear memory.');
            }
          }}
          className="mt-2 text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
        >
          Clear all memory
        </button>
      )}
    </div>
  );
}
