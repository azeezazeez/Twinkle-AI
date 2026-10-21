import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle, Check, ChevronDown, ChevronLeft, ChevronRight, Globe, Link2, LoaderCircle, Lock,
  MessageSquarePlus, Settings as GearIcon, X,
} from 'lucide-react';
import { chatApi } from '../lib/api';
import { toast } from '../lib/toast';
import { useBackClose, useFocusTrap } from '../lib/mobileUi';

type AccessMode = 'INVITED' | 'LINK';

interface Invite {
  id: number;
  email: string;
}

interface SharingState {
  accessMode: AccessMode;
  shareToken: string | null;
  invites: Invite[];
}

interface ShareChatModalProps {
  isOpen: boolean;
  /** Saved chat to share. null / -1 means there is no saved conversation yet. */
  sessionId: number | null;
  /** The signed-in user, shown as "Owner". */
  owner: { name: string; email: string; avatarUrl?: string };
  /** Empty-chat state: closes the popup and focuses the message box. */
  onStartChat?: () => void;
  onClose: () => void;
}

const ACCESS_OPTIONS: Array<{ mode: AccessMode; label: string; hint: string }> = [
  { mode: 'INVITED', label: 'Only people invited', hint: 'Signed-in people on the list below can open it.' },
  { mode: 'LINK', label: 'Anyone with the link', hint: 'Anyone who has the link can read this chat.' },
];

const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const parseSharing = (response: any): SharingState => ({
  accessMode: response?.accessMode === 'LINK' ? 'LINK' : 'INVITED',
  shareToken: typeof response?.shareToken === 'string' && response.shareToken ? response.shareToken : null,
  invites: Array.isArray(response?.invites)
    ? response.invites
        .map((item: any) => ({ id: Number(item?.id), email: String(item?.email ?? '') }))
        .filter((item: Invite) => Number.isFinite(item.id) && item.email)
    : [],
});

const errorText = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

const buildShareUrl = (token: string) => `${window.location.origin}/shared/${encodeURIComponent(token)}`;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API blocked (insecure origin / permissions): fall back to a hidden textarea.
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Grey circle with the first letter (or the profile picture). */
function Avatar({ label, imageUrl }: { label: string; imageUrl?: string }) {
  const letter = (label.trim().charAt(0) || '?').toUpperCase();
  return (
    <span
      aria-hidden="true"
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-200 text-[15px] font-medium text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
    >
      {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : letter}
    </span>
  );
}

function AccessIcon({ mode, className = 'h-5 w-5' }: { mode: AccessMode; className?: string }) {
  return mode === 'LINK'
    ? <Globe className={className} strokeWidth={1.7} aria-hidden="true" />
    : <Lock className={className} strokeWidth={1.7} aria-hidden="true" />;
}

const ICON_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:text-zinc-300 dark:hover:bg-zinc-800';

const ShareChatModal: React.FC<ShareChatModalProps> = ({ isOpen, sessionId, owner, onStartChat, onClose }) => {
  const hasChat = sessionId !== null && sessionId > 0;

  const [view, setView] = useState<'main' | 'settings'>('main');
  const [sharing, setSharing] = useState<SharingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);

  const [draftMode, setDraftMode] = useState<AccessMode>('INVITED');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const loadRequest = useRef(0);
  const copiedTimer = useRef<number | null>(null);

  // ── Load the current sharing settings every time the popup opens ───────────
  const load = useCallback(async () => {
    if (sessionId === null || sessionId <= 0) return;
    const requestId = ++loadRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const response = await chatApi.getSharing(sessionId);
      if (requestId !== loadRequest.current) return;
      const next = parseSharing(response);
      setSharing(next);
      setDraftMode(next.accessMode);
    } catch (error) {
      if (requestId !== loadRequest.current) return;
      setLoadError(errorText(error, 'Could not load the sharing settings.'));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!isOpen) {
      loadRequest.current += 1;
      return;
    }
    setView('main');
    setSharing(null);
    setLoadError(null);
    setEmail('');
    setInviteError(null);
    setSettingsError(null);
    setDropdownOpen(false);
    setCopied(false);
    void load();
  }, [isOpen, load]);

  useEffect(() => () => {
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
  }, []);

  // Escape closes the open dropdown first, then the popup. Tab stays inside.
  const handleEscape = useCallback(() => {
    if (dropdownOpen) setDropdownOpen(false);
    else onClose();
  }, [dropdownOpen, onClose]);
  useFocusTrap(panelRef, isOpen, handleEscape);
  useBackClose(isOpen, onClose);

  // ── Actions ────────────────────────────────────────────────────────────────
  const emailValue = email.trim();
  const canInvite = hasChat && !!sharing && !inviting && EMAIL_RE.test(emailValue);

  const submitInvite = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canInvite || sessionId === null) return;
    setInviting(true);
    setInviteError(null);
    try {
      const response = await chatApi.inviteToChat(sessionId, emailValue);
      setSharing(parseSharing(response));
      setEmail('');
      toast.success(`Invited ${emailValue}`);
    } catch (error) {
      setInviteError(errorText(error, 'Could not send the invite. Please try again.'));
    } finally {
      setInviting(false);
    }
  };

  const removeInvite = async (invite: Invite) => {
    if (sessionId === null || removingId !== null) return;
    setRemovingId(invite.id);
    try {
      const response = await chatApi.removeChatInvite(sessionId, invite.id);
      setSharing(parseSharing(response));
      toast.success(`Removed ${invite.email}`);
    } catch (error) {
      toast.error(errorText(error, 'Could not remove that person. Please try again.'));
    } finally {
      setRemovingId(null);
    }
  };

  const copyLink = async () => {
    if (sessionId === null || sessionId <= 0 || copying) return;
    setCopying(true);
    try {
      let state = sharing;
      let token = state?.shareToken ?? null;
      if (!token) {
        // First time: create the link, then copy it.
        state = parseSharing(await chatApi.createShareLink(sessionId));
        setSharing(state);
        setDraftMode(state.accessMode);
        token = state.shareToken;
      }
      if (!token) throw new Error('Could not create the link.');
      const ok = await copyText(buildShareUrl(token));
      if (!ok) throw new Error('Could not copy the link. Please copy it from the address bar after opening it.');
      setCopied(true);
      toast.success(state?.accessMode === 'LINK' ? 'Link copied' : 'Link copied — only invited people can open it');
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      toast.error(errorText(error, 'Could not copy the link. Please try again.'));
    } finally {
      setCopying(false);
    }
  };

  const openSettings = () => {
    setDraftMode(sharing?.accessMode ?? 'INVITED');
    setSettingsError(null);
    setDropdownOpen(false);
    setView('settings');
  };

  const closeSettings = () => {
    setDropdownOpen(false);
    setView('main');
  };

  const saveSettings = async () => {
    if (sessionId === null || sessionId <= 0 || saving) return;
    setSaving(true);
    setSettingsError(null);
    try {
      const response = await chatApi.setShareAccess(sessionId, draftMode);
      const next = parseSharing(response);
      setSharing(next);
      toast.success(next.accessMode === 'LINK' ? 'Anyone with the link can now view this chat' : 'Only invited people can view this chat');
      setView('main');
    } catch (error) {
      setSettingsError(errorText(error, 'Could not save. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const settingsChanged = !!sharing && draftMode !== sharing.accessMode;
  const currentMode: AccessMode = sharing?.accessMode ?? 'INVITED';
  const currentLabel = ACCESS_OPTIONS.find(option => option.mode === currentMode)!.label;
  const draftLabel = ACCESS_OPTIONS.find(option => option.mode === draftMode)!.label;
  const ownerName = owner.name || owner.email || 'You';

  const closeButton = (
    <button type="button" onClick={onClose} aria-label="Close" className={ICON_BUTTON}>
      <X className="h-5 w-5" strokeWidth={1.8} />
    </button>
  );

  // ── Views ──────────────────────────────────────────────────────────────────
  const mainView = !hasChat ? (
    <div key="empty">
      <div className="flex items-start justify-between gap-3">
        <h2 id="share-session-title" className="text-[20px] font-semibold leading-8 tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">Share session</h2>
        {closeButton}
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-700 dark:bg-zinc-800/60" role="status">
        <MessageSquarePlus className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500 dark:text-zinc-400" strokeWidth={1.8} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Nothing to share yet</p>
          <p className="mt-0.5 text-sm leading-5 text-zinc-600 dark:text-zinc-400">Send a message first, then come back to share this chat.</p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onStartChat ?? onClose}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-[15px] font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Start chatting
        </button>
      </div>
    </div>
  ) : (
    <div key="main">
      <div className="flex items-start justify-between gap-3">
        <h2 id="share-session-title" className="text-[20px] font-semibold leading-8 tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">Share session</h2>
        {closeButton}
      </div>
      <p className="-mt-0.5 text-[14px] text-zinc-500 dark:text-zinc-400">Only messages up until now will be shared</p>

      <form onSubmit={event => void submitInvite(event)} className="mt-4 flex items-center gap-2" noValidate>
        <input
          type="email"
          value={email}
          onChange={event => { setEmail(event.target.value); if (inviteError) setInviteError(null); }}
          placeholder="Add people by email"
          aria-label="Add people by email"
          aria-invalid={!!inviteError}
          autoComplete="off"
          spellCheck={false}
          disabled={!sharing}
          className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 text-[15px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-500"
        />
        <button
          type="submit"
          disabled={!canInvite}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-[15px] font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          {inviting && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />}
          Invite
        </button>
      </form>
      {inviteError && <p role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-zinc-700 dark:text-zinc-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />{inviteError}</p>}

      <p className="mt-5 text-[14px] text-zinc-500 dark:text-zinc-400">Who has access</p>

      {loading && !sharing ? (
        <div className="mt-3 flex items-center gap-3 py-2 text-[14px] text-zinc-500 dark:text-zinc-400" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
          Loading…
        </div>
      ) : loadError && !sharing ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200" role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void load()} className="mt-2 text-[13px] font-medium underline underline-offset-2">Try again</button>
        </div>
      ) : (
        <ul className="mt-2 max-h-[240px] space-y-0.5 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={openSettings}
              aria-label={`${currentLabel}. Change who has access`}
              className="flex w-full items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:hover:bg-zinc-800/70"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
                <AccessIcon mode={currentMode} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-zinc-900 dark:text-zinc-100">{currentLabel}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-zinc-400" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </li>
          <li className="flex items-center gap-3 px-1.5 py-1.5">
            <Avatar label={ownerName} imageUrl={owner.avatarUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[16px] font-medium text-zinc-900 dark:text-zinc-100">
                <span data-no-translate>{ownerName}</span> <span className="font-normal text-zinc-500 dark:text-zinc-400">(you)</span>
              </span>
              {owner.email && <span className="block truncate text-[14px] text-zinc-500 dark:text-zinc-400" data-no-translate>{owner.email}</span>}
            </span>
            <span className="shrink-0 text-[14px] text-zinc-500 dark:text-zinc-400">Owner</span>
          </li>
          {sharing?.invites.map(invite => (
            <li key={invite.id} className="flex items-center gap-3 px-1.5 py-1.5">
              <Avatar label={invite.email} />
              <span className="min-w-0 flex-1 truncate text-[16px] text-zinc-900 dark:text-zinc-100" data-no-translate title={invite.email}>{invite.email}</span>
              <span className="shrink-0 text-[14px] text-zinc-500 dark:text-zinc-400">Viewer</span>
              <button
                type="button"
                onClick={() => void removeInvite(invite)}
                disabled={removingId !== null}
                aria-label={`Remove ${invite.email}`}
                title="Remove"
                className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                {removingId === invite.id
                  ? <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} />
                  : <X className="h-4 w-4" strokeWidth={1.8} />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">
        Don’t share personal information or third-party content without permission.{' '}
        <a href="/learn-more" target="_blank" rel="noopener noreferrer" className="text-zinc-900 underline underline-offset-2 hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300">Learn more</a>
      </p>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <button
          type="button"
          onClick={openSettings}
          disabled={!sharing}
          aria-label="Share settings"
          title="Share settings"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-800 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 disabled:opacity-50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <GearIcon className="h-[18px] w-[18px]" strokeWidth={1.7} />
        </button>
        <button
          type="button"
          onClick={() => void copyLink()}
          disabled={copying || (loading && !sharing)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-[15px] font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 disabled:cursor-wait disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {copying
            ? <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />
            : copied
              ? <Check className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
              : <Link2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />}
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );

  const settingsView = (
    <div key="settings">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={closeSettings} aria-label="Back" className={`${ICON_BUTTON} -ml-1.5`}>
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
          <h2 id="share-session-title" className="truncate text-[18px] font-semibold leading-8 tracking-[-0.01em] text-zinc-900 dark:text-zinc-100">Share chat settings</h2>
        </div>
        {closeButton}
      </div>

      <p className="mt-4 text-[14px] text-zinc-500 dark:text-zinc-400">Who has access</p>
      <div className="relative mt-2">
        <button
          type="button"
          onClick={() => setDropdownOpen(open => !open)}
          aria-haspopup="listbox"
          aria-expanded={dropdownOpen}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-zinc-200 bg-zinc-100/80 px-3 text-left text-[15px] text-zinc-900 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <AccessIcon mode={draftMode} className="h-[18px] w-[18px] shrink-0" />
          <span className="min-w-0 flex-1 truncate">{draftLabel}</span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} strokeWidth={1.8} aria-hidden="true" />
        </button>

        <AnimatePresence>
          {dropdownOpen && (
            <>
              <button type="button" aria-label="Close menu" tabIndex={-1} onClick={() => setDropdownOpen(false)} className="fixed inset-0 z-10 cursor-default" />
              <motion.div
                role="listbox"
                aria-label="Who has access"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.12)] dark:border-zinc-700 dark:bg-zinc-900"
              >
                {ACCESS_OPTIONS.map(option => {
                  const selected = option.mode === draftMode;
                  return (
                    <button
                      key={option.mode}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => { setDraftMode(option.mode); setDropdownOpen(false); }}
                      className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[15px] text-zinc-900 transition-colors hover:bg-zinc-100 focus:outline-none focus-visible:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800 dark:focus-visible:bg-zinc-800"
                    >
                      <AccessIcon mode={option.mode} className="h-[18px] w-[18px] shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {selected && <Check className="h-[18px] w-[18px] shrink-0 text-zinc-900 dark:text-zinc-100" strokeWidth={2} aria-hidden="true" />}
                    </button>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-3 text-[13px] leading-5 text-zinc-500 dark:text-zinc-400">
        {ACCESS_OPTIONS.find(option => option.mode === draftMode)!.hint}
      </p>
      {settingsError && <p role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] leading-5 text-zinc-700 dark:text-zinc-300"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />{settingsError}</p>}

      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={closeSettings}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-[15px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={!settingsChanged || saving}
          className="inline-flex h-10 min-w-[76px] items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-[15px] font-medium text-white transition-colors hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 disabled:cursor-not-allowed disabled:bg-zinc-400 disabled:text-white dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:bg-zinc-600 dark:disabled:text-zinc-300"
        >
          {saving && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden="true" />}
          Save
        </button>
      </div>
    </div>
  );

  const content = view === 'settings' && hasChat ? settingsView : mainView;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999]">
          {/* Transparent click-catcher: clicking outside the popup closes it. */}
          <button
            type="button"
            aria-label="Close share dialog"
            tabIndex={-1}
            onClick={onClose}
            className="absolute inset-0 cursor-default border-0 bg-transparent"
          />

          <div className="pointer-events-none absolute right-[max(1rem,env(safe-area-inset-right,0px))] top-[calc(max(0.75rem,env(safe-area-inset-top,0px))+46px)] max-sm:left-3 max-sm:right-3 sm:w-[480px]">
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-session-title"
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.98, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -6 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              style={{ transformOrigin: 'top right' }}
              className="pointer-events-auto max-h-[calc(100dvh-72px)] w-full overflow-y-auto rounded-[20px] border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.14)] outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
            >
              {content}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ShareChatModal;
