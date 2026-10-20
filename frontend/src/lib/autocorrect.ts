import { useCallback, useEffect, useRef, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { requestAutocorrect } from './api';

const STORAGE_KEY = 'Twinkle_autocorrect';

export function isAutocorrectEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutocorrectEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    /* storage unavailable */
  }
}

const BOUNDARY = /[\s.,!?;:)\]}"”’]/;
const DEBOUNCE_MS = 450;
const MAX_SEGMENT_CHARS = 160;
const MAX_CACHE = 300;
const UNDO_WINDOW_MS = 20_000;

function insideCode(text: string, index: number): boolean {
  const before = text.slice(0, index);
  const fences = (before.match(/```/g) || []).length;
  if (fences % 2 === 1) return true;
  const ticks = (before.replace(/```/g, '').match(/`/g) || []).length;
  return ticks % 2 === 1;
}

type Applied = {
  start: number;
  original: string;
  corrected: string;
  caretAfter: number;
  at: number;
};

export function useComposerAutocorrect(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  setValue: (next: string) => void,
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const composing = useRef(false);
  const pausedUntil = useRef(0);
  const applied = useRef<Applied | null>(null);
  const cache = useRef<Map<string, string>>(new Map());
  const rejected = useRef<Set<string>>(new Set());

  const remember = (snippet: string, corrected: string) => {
    const map = cache.current;
    if (map.size >= MAX_CACHE) map.delete(map.keys().next().value as string);
    map.set(snippet, corrected);
  };

  const placeCaret = useCallback(
    (pos: number) => {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) el.setSelectionRange(pos, pos);
      });
    },
    [textareaRef],
  );

  const apply = useCallback(
    (snippet: string, corrected: string, hintStart: number) => {
      const el = textareaRef.current;
      if (!el || corrected === snippet) return;

      const current = el.value;
      let index = current.slice(hintStart, hintStart + snippet.length) === snippet ? hintStart : current.lastIndexOf(snippet);
      if (index < 0) return; // the user edited this text meanwhile

      const caret = el.selectionStart;
      const collapsed = el.selectionStart === el.selectionEnd;
      const oldEnd = index + snippet.length;
      const delta = corrected.length - snippet.length;

      let newCaret = caret;
      if (!collapsed) return;
      if (caret >= oldEnd) newCaret = caret + delta;
      else if (caret > index) newCaret = index + corrected.length;

      setValue(current.slice(0, index) + corrected + current.slice(oldEnd));
      placeCaret(newCaret);
      applied.current = { start: index, original: snippet, corrected, caretAfter: newCaret, at: Date.now() };
    },
    [placeCaret, setValue, textareaRef],
  );

  const run = useCallback(
    async (attempt = 0) => {
      const el = textareaRef.current;
      if (!el || !isAutocorrectEnabled() || Date.now() < pausedUntil.current) return;
      if (composing.current) {
        if (attempt < 3) timer.current = setTimeout(() => void run(attempt + 1), 300);
        return;
      }
      if (el.selectionStart !== el.selectionEnd) return;

      const value = el.value;
      const caret = el.selectionStart;

      // Only text up to the last finished word is checked; the word being typed is left alone.
      let end = -1;
      for (let i = caret - 1; i >= 0; i--) {
        if (BOUNDARY.test(value[i])) {
          end = i + 1;
          break;
        }
      }
      if (end < 3) return;

      let start = Math.max(0, end - MAX_SEGMENT_CHARS);
      while (start > 0 && start < end && !/\s/.test(value[start - 1])) start++;

      const snippet = value.slice(start, end);
      if (snippet.trim().length < 3 || !/[A-Za-z]/.test(snippet)) return;
      if (snippet.includes('`') || insideCode(value, start)) return;
      if (rejected.current.has(snippet)) return;

      const cached = cache.current.get(snippet);
      if (cached !== undefined) {
        if (cached !== snippet) apply(snippet, cached, start);
        return;
      }

      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const mine = ++sequence.current;

      try {
        const corrected = await requestAutocorrect(snippet, abort.signal);
        if (mine !== sequence.current || corrected == null) return;
        remember(snippet, corrected);
        apply(snippet, corrected, start);
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') return;
        pausedUntil.current = Date.now() + 30_000; // back off after a failure
      }
    },
    [apply, textareaRef],
  );

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
  }, [run]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const el = event.target;
      const native = event.nativeEvent as InputEvent;
      composing.current = Boolean(native.isComposing);
      setValue(el.value);

      const inputType = native.inputType || '';
      if (!el.value) {
        if (timer.current) clearTimeout(timer.current);
        controller.current?.abort();
        return;
      }

      const caret = el.selectionStart;
      if (!inputType.startsWith('delete') && caret > 0 && BOUNDARY.test(el.value[caret - 1])) {
        schedule();
      }
    },
    [schedule, setValue],
  );

  const undo = useCallback(
    (el: HTMLTextAreaElement): boolean => {
      const last = applied.current;
      if (!last || Date.now() - last.at > UNDO_WINDOW_MS) return false;

      const endNew = last.start + last.corrected.length;
      if (el.value.slice(last.start, endNew) !== last.corrected) return false;

      rejected.current.add(last.original);
      remember(last.original, last.original);
      applied.current = null;

      const restored = el.value.slice(0, last.start) + last.original + el.value.slice(endNew);
      const delta = last.original.length - last.corrected.length;
      const caret = el.selectionStart;
      setValue(restored);
      placeCaret(caret >= endNew ? caret + delta : last.start + last.original.length);
      return true;
    },
    [placeCaret, setValue],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const el = event.currentTarget;

      if (event.key === 'Enter' && !event.shiftKey) {
        // Message is being sent: drop any pending correction.
        if (timer.current) clearTimeout(timer.current);
        controller.current?.abort();
        return;
      }

      const last = applied.current;
      if (!last) return;

      const isUndoShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
      const isBackspaceUndo =
        event.key === 'Backspace' &&
        el.selectionStart === el.selectionEnd &&
        el.selectionStart === last.caretAfter;

      if ((isUndoShortcut || isBackspaceUndo) && undo(el)) {
        event.preventDefault();
      }
    },
    [undo],
  );

  return { onChange, onKeyDown };
}
