import { numberDuplicateNames } from '../lib/docNames';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  AudioLines, BarChart3, Check, CornerDownLeft, FileText, HardDrive, Image as ImageIcon, Info, Keyboard,
  LoaderCircle, MessageCircle, MessagesSquare, Mic, MoreHorizontal, Paperclip, Plus, Trash2, Settings as SettingsIcon, ShieldCheck,
  SlidersHorizontal, UserRound, X, type LucideIcon,
} from 'lucide-react';
import type { Session } from '../types';
import { chatApi, fetchWithAuth } from '../lib/api';
import { serverTime } from '../lib/time';
import { dispatchShortcut, isMac } from '../lib/shortcuts';
import { attachLibraryFiles, forgetLibraryFile, prefetchLibraryFile } from '../lib/libraryAttach';
import { toast } from '../lib/toast';

/**
 * Command-style search dialog (Ctrl/⌘+K). Tabs: All, Chats, Library, Settings.
 * It only offers things Twinkle really has: chats, knowledge-base documents,
 * settings pages and a few quick actions.
 */

type TabId = 'all' | 'chats' | 'knowledge' | 'settings';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'chats', label: 'Chats' },
  { id: 'knowledge', label: 'Library' },
  { id: 'settings', label: 'Settings' },
];

interface PaletteItem {
  key: string;
  section: string;
  label: string;
  Icon: LucideIcon;
  /** Muted text on the right (e.g. a keyboard shortcut). */
  hint?: string;
  /** Labels that come from the user's own data are not auto-translated. */
  userContent?: boolean;
  run: () => void;
  /** Set for Library files: enables the 3-dot menu and multi-select. */
  doc?: KnowledgeDoc;
}

interface KnowledgeDoc {
  id: number;
  name: string;
  /** Real file name, used when the document is attached to the composer. */
  fileName: string;
  mimeType: string;
}

const mac = isMac();
const SHORTCUT_NEW_CHAT = mac ? '⇧⌘O' : 'Ctrl+Shift+O';
const SHORTCUT_LIVE_TALK = mac ? '⇧⌘L' : 'Ctrl+Shift+L';
const SHORTCUT_SETTINGS = mac ? '⇧⌘,' : 'Ctrl+Shift+,';
const SHORTCUT_SHORTCUTS = mac ? '⌘/' : 'Ctrl+/';

// Section ids match the Settings page (?tab=...). "account" opens the profile page.
const SETTINGS_PAGES: Array<{ id: string; label: string; Icon: LucideIcon; keywords: string }> = [
  { id: 'general', label: 'General', Icon: SettingsIcon, keywords: 'theme appearance language' },
  { id: 'account', label: 'Account', Icon: UserRound, keywords: 'profile name email password' },
  { id: 'voice', label: 'Voice', Icon: Mic, keywords: 'speech microphone read aloud' },
  { id: 'data', label: 'Data controls', Icon: ShieldCheck, keywords: 'privacy memory export import delete' },
  { id: 'shortcuts', label: 'Shortcuts', Icon: Keyboard, keywords: 'keyboard keys hotkeys' },
  { id: 'about', label: 'About', Icon: Info, keywords: 'version help' },
  { id: 'usage', label: 'Usage', Icon: BarChart3, keywords: 'limits messages' },
  { id: 'analytics', label: 'Analytics', Icon: BarChart3, keywords: 'stats insights' },
  { id: 'storage', label: 'Storage', Icon: HardDrive, keywords: 'files space' },
];

const matches = (query: string, ...parts: string[]) => {
  if (!query) return true;
  const haystack = parts.join(' ').toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
};

const updatedAt = (session: any) =>
  serverTime(session?.updatedAt ?? session?.updated_at ?? session?.createdAt ?? session?.created_at);

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-zinc-200 bg-white px-1.5 font-sans text-[12px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </kbd>
  );
}

export default function SearchPalette({
  open,
  sessions,
  onClose,
  onSelectSession,
  onNewSession,
  onComposeChat,
  onPrefetchSession,
}: {
  open: boolean;
  sessions: Session[];
  onClose: () => void;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
  /** Tab: start a new chat with the typed text ready to send. */
  onComposeChat?: (text: string) => void;
  onPrefetchSession?: (id: number) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('all');
  const [activeIndex, setActiveIndex] = useState(0);
  const [serverResults, setServerResults] = useState<{ q: string; list: Session[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Library file actions: multi-select mode, the 3-dot menu and delete confirmation.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [menu, setMenu] = useState<{ doc: KnowledgeDoc; top: number; right: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeDoc[] | null>(null);
  const [busy, setBusy] = useState(false);

  const q = query.trim();

  // Reset every time the dialog opens, and load the knowledge-base documents.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setTab('all');
    setActiveIndex(0);
    setServerResults(null);
    setSearching(false);
    setSelectMode(false);
    setSelectedIds([]);
    setMenu(null);
    setConfirmDelete(null);
    inputRef.current?.focus();
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 40);

    let cancelled = false;
    const loadDocs = async () => {
      try {
        const data = await fetchWithAuth('/api/rag/documents');
        if (cancelled || !Array.isArray(data)) return;
        // Only files whose original is stored can be picked. The same file can be stored
        // more than once; number the copies 1, 2, 3.
        const cleaned = (data as any[])
          .filter(item => item?.hasFile)
          .map(item => ({
            id: Number(item?.id),
            name: String(item?.name ?? ''),
            mimeType: String(item?.mimeType ?? ''),
          }))
          .filter(item => Number.isFinite(item.id) && item.name);
        const numbered = numberDuplicateNames(cleaned);
        setDocs(cleaned.map(item => ({ ...item, fileName: item.name, name: numbered.get(item.id) ?? item.name })));
      } catch {
        /* keep what is already listed */
      }
    };
    void loadDocs();
    // Files attached in chat appear within a couple of seconds, without reopening the dialog.
    const refreshTimer = window.setInterval(() => { void loadDocs(); }, 2500);
    const onLibraryUpdated = () => { void loadDocs(); };
    window.addEventListener('twinkle-library-updated', onLibraryUpdated);

    return () => {
      cancelled = true;
      window.clearTimeout(focusTimer);
      window.clearInterval(refreshTimer);
      window.removeEventListener('twinkle-library-updated', onLibraryUpdated);
    };
  }, [open]);

  // Escape closes the dialog.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Close the innermost layer first: confirmation, then the 3-dot menu, then select mode.
        if (confirmDelete) { setConfirmDelete(null); return; }
        if (menu) { setMenu(null); return; }
        if (selectMode) { setSelectMode(false); setSelectedIds([]); return; }
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, confirmDelete, menu, selectMode]);

  // Clicking anywhere outside the 3-dot menu closes it.
  useEffect(() => {
    if (!menu) return;
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement | null)?.closest('[data-doc-menu]')) setMenu(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menu]);

  // Chat search: instant local matches, replaced by the server's answer when it arrives.
  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    if (!q) {
      setServerResults(null);
      setSearching(false);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await chatApi.searchSessions(q);
        if (requestId !== requestRef.current) return;
        const raw = Array.isArray((response as any)?.sessions) ? (response as any).sessions : [];
        const list = raw
          .map((item: any) => ({
            ...item,
            id: Number(item.id ?? item.sessionId ?? item.session_id),
            sessionName: String(item.sessionName ?? item.name ?? item.title ?? 'New Chat'),
          }))
          .filter((item: any) => Number.isFinite(item.id));
        setServerResults({ q, list });
      } catch {
        if (requestId === requestRef.current) setServerResults(null); // keep the local matches
      } finally {
        if (requestId === requestRef.current) setSearching(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, q]);

  const go = useCallback((action: () => void) => {
    onClose();
    action();
  }, [onClose]);

  // Picking Library files puts them in the chat composer. The dialog closes at once; the composer
  // shows its loading spinner while the files download (usually instant: rows prefetch on hover).
  const attachDocs = useCallback((list: KnowledgeDoc[]) => {
    if (!list.length) return;
    onClose();
    // Not on a chat page (Settings, Profile...): open the chat; it picks the files up on load.
    if (!/^\/(chat\/|$)/.test(window.location.pathname)) navigate('/');
    attachLibraryFiles(list.map(doc => ({ id: doc.id, name: doc.fileName }))).catch(error => {
      toast.error(error instanceof Error ? error.message : 'This file could not be opened from your Library.');
    });
  }, [onClose, navigate]);

  const deleteDocs = useCallback(async (list: KnowledgeDoc[]) => {
    if (!list.length || busy) return;
    setBusy(true);
    const removed: number[] = [];
    try {
      for (const doc of list) {
        try {
          await fetchWithAuth(`/api/rag/documents/${doc.id}`, { method: 'DELETE' });
          removed.push(doc.id);
          forgetLibraryFile(doc.id);
        } catch { /* reported below */ }
      }
      setDocs(prev => prev.filter(doc => !removed.includes(doc.id)));
      setSelectedIds(prev => prev.filter(id => !removed.includes(id)));
      if (removed.length === list.length) {
        toast.success(list.length === 1 ? 'File deleted from your Library' : `${list.length} files deleted from your Library`);
        setSelectMode(false);
      } else {
        toast.error(removed.length ? 'Some files could not be deleted. Please try again.' : 'The file could not be deleted. Please try again.');
      }
    } finally {
      setConfirmDelete(null);
      setBusy(false);
    }
  }, [busy]);

  const toggleSelected = useCallback((id: number) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  }, []);

  const openDocMenu = (event: React.MouseEvent<HTMLElement>, doc: KnowledgeDoc) => {
    event.stopPropagation();
    if (menu?.doc.id === doc.id) { setMenu(null); return; }
    const button = event.currentTarget.getBoundingClientRect();
    const dialog = dialogRef.current?.getBoundingClientRect();
    if (!dialog) return;
    prefetchLibraryFile(doc.id, doc.fileName);
    const menuHeight = 96;
    const below = button.bottom - dialog.top + 4;
    const top = below + menuHeight > dialog.height ? button.top - dialog.top - menuHeight - 4 : below;
    setMenu({ doc, top, right: dialog.right - button.right });
  };

  // ── Build the result list for the current tab and query ───────────────────
  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];

    if (tab === 'all') {
      const actions: Array<PaletteItem & { keywords: string }> = [
        { key: 'a-new', section: 'Actions', label: 'New chat', Icon: Plus, hint: SHORTCUT_NEW_CHAT, keywords: 'new start conversation', run: () => go(onNewSession) },
        { key: 'a-live', section: 'Actions', label: 'Live Talk', Icon: AudioLines, hint: SHORTCUT_LIVE_TALK, keywords: 'voice speak talk', run: () => go(() => dispatchShortcut('live-talk')) },
        { key: 'a-chats', section: 'Actions', label: 'All chats', Icon: MessagesSquare, keywords: 'history list view', run: () => go(() => navigate('/chats')) },
        { key: 'a-settings', section: 'Actions', label: 'Settings', Icon: SettingsIcon, hint: SHORTCUT_SETTINGS, keywords: 'preferences options', run: () => go(() => navigate('/settings')) },
        { key: 'a-keys', section: 'Actions', label: 'Keyboard shortcuts', Icon: SlidersHorizontal, hint: SHORTCUT_SHORTCUTS, keywords: 'keys hotkeys', run: () => go(() => navigate('/settings?tab=shortcuts')) },
      ];
      actions.forEach(({ keywords, ...item }) => {
        if (matches(q, item.label, keywords)) out.push(item);
      });
    }

    if (tab === 'all' || tab === 'chats') {
      const source: Session[] = q
        ? (serverResults?.q === q
            ? serverResults.list
            : sessions.filter(session => matches(q, String(session.sessionName ?? ''))))
        : sessions;
      const limit = tab === 'all' ? (q ? 6 : 5) : 30;
      [...source]
        .sort((a, b) => updatedAt(b) - updatedAt(a))
        .slice(0, limit)
        .forEach(session => {
          out.push({
            key: `c-${session.id}`,
            section: q ? 'Chats' : 'Recent chats',
            label: String(session.sessionName || 'New chat'),
            Icon: MessageCircle,
            userContent: true,
            run: () => go(() => onSelectSession(session.id)),
          });
        });
    }

    if (tab === 'all' || tab === 'knowledge') {
      // On "All" with no query the list stays short: actions and recent chats only.
      const showDocs = tab === 'knowledge' || !!q;
      (showDocs ? docs : [])
        .filter(doc => matches(q, doc.name))
        .slice(0, tab === 'all' ? 4 : 30)
        .forEach(doc => {
          out.push({
            key: `d-${doc.id}`,
            section: 'Library',
            label: doc.name,
            Icon: doc.mimeType.startsWith('image/') ? ImageIcon : FileText,
            userContent: true,
            doc,
            run: () => { if (selectMode) { toggleSelected(doc.id); prefetchLibraryFile(doc.id, doc.fileName); } else attachDocs([doc]); },
          });
        });
    }

    if (tab === 'settings' || (tab === 'all' && q)) {
      SETTINGS_PAGES
        .filter(page => matches(q, page.label, page.keywords))
        .slice(0, tab === 'all' ? 4 : 30)
        .forEach(page => {
          out.push({
            key: `s-${page.id}`,
            section: 'Settings',
            label: page.label,
            Icon: page.Icon,
            run: () => go(() => navigate(page.id === 'account' ? '/profile' : `/settings?tab=${page.id}`)),
          });
        });
    }

    return out;
  }, [tab, q, sessions, serverResults, docs, go, navigate, onNewSession, onSelectSession, attachDocs, selectMode, toggleSelected]);

  // Keep the highlighted row valid and in view.
  useEffect(() => {
    setActiveIndex(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  }, [tab, q]);

  useEffect(() => {
    if (activeIndex >= items.length && items.length > 0) setActiveIndex(items.length - 1);
  }, [items.length, activeIndex]);

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, items]);

  const changeTab = (direction: 1 | -1) => {
    const index = TABS.findIndex(item => item.id === tab);
    setTab(TABS[(index + direction + TABS.length) % TABS.length].id);
  };

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const input = event.currentTarget;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (items.length) setActiveIndex(index => (index + 1) % items.length);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (items.length) setActiveIndex(index => (index - 1 + items.length) % items.length);
        break;
      case 'Enter': {
        event.preventDefault();
        items[activeIndex]?.run();
        break;
      }
      case 'ArrowRight':
        // Only when the caret is at the end, so editing the text still works.
        if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
          event.preventDefault();
          changeTab(1);
        }
        break;
      case 'ArrowLeft':
        if (input.selectionStart === 0 && input.selectionEnd === 0) {
          event.preventDefault();
          changeTab(-1);
        }
        break;
      case 'Tab':
        if (event.shiftKey) break;
        event.preventDefault();
        if (q && onComposeChat) go(() => onComposeChat(q));
        break;
      default:
    }
  };

  // Group consecutive items by section for the headings.
  const sections: Array<{ title: string; rows: Array<{ item: PaletteItem; index: number }> }> = [];
  items.forEach((item, index) => {
    const last = sections[sections.length - 1];
    if (last && last.title === item.section) last.rows.push({ item, index });
    else sections.push({ title: item.section, rows: [{ item, index }] });
  });

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-[10020] flex items-start justify-center bg-black/30 px-3 pt-[max(1rem,8vh)] backdrop-blur-[1px] sm:px-6"
    >
      <button type="button" aria-label="Close search" tabIndex={-1} onClick={onClose} className="absolute inset-0 cursor-default" />

      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        initial={{ opacity: 0, scale: 0.985, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.985, y: -6 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className="relative z-10 flex h-[min(600px,82dvh)] w-full max-w-[640px] flex-col overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-[0_24px_70px_rgba(0,0,0,0.18)] dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
      >
        {/* Search field */}
        <div className="flex shrink-0 items-center gap-3 px-6 pb-3 pt-5">
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="search-palette-list"
            aria-activedescendant={items[activeIndex] ? `search-item-${items[activeIndex].key}` : undefined}
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[20px] font-normal text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
          />
          {searching && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-zinc-400" strokeWidth={2} aria-label="Searching" />}
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>

        {/* Type tabs */}
        <div role="tablist" aria-label="Search type" className="flex shrink-0 gap-1.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
          {TABS.map(item => {
            const selected = item.id === tab;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                tabIndex={-1}
                onClick={() => { setTab(item.id); inputRef.current?.focus(); }}
                className={`h-9 shrink-0 rounded-full px-4 text-[15px] transition-colors ${
                  selected
                    ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Results */}
        {tab === 'knowledge' && docs.length > 0 && (
          <div className="flex shrink-0 items-center justify-between px-6 pb-1 pt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
            <span>{selectMode ? `${selectedIds.length} selected` : `${docs.length} ${docs.length === 1 ? 'file' : 'files'}`}</span>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => { setSelectMode(on => !on); setSelectedIds([]); setMenu(null); }}
              className="h-8 rounded-full px-3.5 text-[13px] font-medium text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        )}

        <div ref={listRef} id="search-palette-list" role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-[15px] text-zinc-500 dark:text-zinc-400">
              {searching
                ? 'Searching…'
                : q
                  ? <>No results for “<span data-twinkle-user-content>{q}</span>”</>
                  : tab === 'chats' ? 'No chats yet' : tab === 'knowledge' ? 'No files in your library yet. Files you attach in chat appear here.' : 'Nothing to show'}
            </p>
          ) : (
            sections.map(section => (
              <div key={section.title} role="group" aria-label={section.title}>
                <div className="px-3 pb-1.5 pt-3 text-[13px] text-zinc-500 dark:text-zinc-400">{section.title}</div>
                {section.rows.map(({ item, index }) => {
                  const active = index === activeIndex;
                  const Icon = item.Icon;
                  return (
                    <div
                      key={item.key}
                      id={`search-item-${item.key}`}
                      role="option"
                      aria-selected={active}
                      data-active={active}
                      tabIndex={-1}
                      onClick={item.run}
                      onMouseMove={() => { if (!active) setActiveIndex(index); }}
                      onMouseEnter={() => {
                        if (item.key.startsWith('c-')) onPrefetchSession?.(Number(item.key.slice(2)));
                        if (item.doc && !selectMode) prefetchLibraryFile(item.doc.id, item.doc.fileName);
                      }}
                      className={`group flex h-11 w-full cursor-pointer items-center gap-3.5 rounded-xl px-3 text-left transition-colors ${
                        active ? 'bg-zinc-100 dark:bg-zinc-800' : ''
                      }`}
                    >
                      {item.doc && selectMode ? (
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            selectedIds.includes(item.doc.id)
                              ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                              : 'border-zinc-300 text-transparent dark:border-zinc-600'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      ) : (
                        <Icon className="h-5 w-5 shrink-0 text-zinc-800 dark:text-zinc-200" strokeWidth={1.7} aria-hidden="true" />
                      )}
                      <span
                        {...(item.userContent ? { 'data-twinkle-user-content': true } : {})}
                        className="min-w-0 flex-1 truncate text-[16px] text-zinc-900 dark:text-zinc-100"
                      >
                        {item.label}
                      </span>
                      {item.doc && !selectMode ? (
                        <button
                          type="button"
                          data-doc-menu
                          tabIndex={-1}
                          aria-label={`Options for ${item.label}`}
                          aria-haspopup="menu"
                          onClick={event => openDocMenu(event, item.doc!)}
                          onMouseDown={event => event.stopPropagation()}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-100 ${
                            active || menu?.doc.id === item.doc.id ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
                          }`}
                        >
                          <MoreHorizontal className="h-5 w-5" strokeWidth={1.8} />
                        </button>
                      ) : active && !selectMode ? (
                        <CornerDownLeft className="h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.8} aria-hidden="true" />
                      ) : item.hint ? (
                        <span className="hidden shrink-0 text-[12px] text-zinc-400 sm:inline dark:text-zinc-500">{item.hint}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Multi-select actions */}
        {tab === 'knowledge' && selectMode && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setSelectedIds(selectedIds.length === items.length ? [] : items.flatMap(item => (item.doc ? [item.doc.id] : [])))}
              className="h-10 shrink-0 rounded-full px-4 text-[14px] font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {selectedIds.length === items.length && items.length > 0 ? 'Clear selection' : 'Select all'}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                tabIndex={-1}
                disabled={!selectedIds.length || busy}
                onClick={() => setConfirmDelete(docs.filter(doc => selectedIds.includes(doc.id)))}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-zinc-300 bg-white px-4 text-[14px] font-medium text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-600 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                <Trash2 className="h-4 w-4 shrink-0" strokeWidth={1.9} /> Delete
              </button>
              <button
                type="button"
                tabIndex={-1}
                disabled={!selectedIds.length || busy}
                onClick={() => attachDocs(docs.filter(doc => selectedIds.includes(doc.id)))}
                className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-zinc-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {busy ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <Paperclip className="h-4 w-4 shrink-0" strokeWidth={1.9} />} Add to chat
              </button>
            </div>
          </div>
        )}

        {/* Key hints (hidden on phones) */}
        <div className="hidden shrink-0 items-center justify-between gap-4 border-t border-zinc-100 px-5 py-3 text-[13px] text-zinc-500 sm:flex dark:border-zinc-800 dark:text-zinc-400">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-2">Close <Kbd>Esc</Kbd></span>
            <span className="flex items-center gap-2">Navigate <Kbd>↑</Kbd><Kbd>↓</Kbd></span>
            <span className="flex items-center gap-2">Change type <Kbd>←</Kbd><Kbd>→</Kbd></span>
          </div>
          {onComposeChat && (
            <span className={`flex items-center gap-2 transition-opacity ${q ? '' : 'opacity-50'}`} title="Start a new chat with what you typed">
              Compose <Kbd>Tab</Kbd>
            </span>
          )}
        </div>

        {/* 3-dot menu for a Library file */}
        {menu && (
          <div
            data-doc-menu
            role="menu"
            style={{ top: menu.top, right: menu.right }}
            className="absolute z-30 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.16)] dark:border-zinc-700 dark:bg-zinc-800"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => { const doc = menu.doc; setMenu(null); attachDocs([doc]); }}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Paperclip className="h-4 w-4" strokeWidth={1.8} /> Add to chat
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setMenu(null); setSelectMode(true); setSelectedIds([menu.doc.id]); }}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Check className="h-4 w-4" strokeWidth={1.8} /> Select
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { const doc = menu.doc; setMenu(null); setConfirmDelete([doc]); }}
              className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-zinc-800 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-700"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.8} /> Delete
            </button>
          </div>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/30 px-6">
            <div role="alertdialog" aria-modal="true" aria-label="Delete from Library" className="w-full max-w-[380px] rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              <h3 className="text-[17px] font-semibold text-zinc-900 dark:text-zinc-100">
                {confirmDelete.length === 1 ? 'Delete this file?' : `Delete ${confirmDelete.length} files?`}
              </h3>
              <p className="mt-2 text-[14px] text-zinc-500 dark:text-zinc-400">
                {confirmDelete.length === 1 ? <>“<span data-twinkle-user-content>{confirmDelete[0].name}</span>” will be</> : 'These files will be'} removed from your Library. Chats that already used {confirmDelete.length === 1 ? 'it' : 'them'} are not changed.
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(null)}
                  className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 px-5 text-[14px] font-medium text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteDocs(confirmDelete)}
                  className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-zinc-900 px-5 text-[14px] font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {busy && <LoaderCircle className="h-4 w-4 animate-spin" />} Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body,
  );
}
