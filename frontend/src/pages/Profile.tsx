import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  CalendarDays,
  Check,
  Flame,
  ImageIcon,
  LogOut,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  UserCircle2,
  X,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { User } from '../types';
import { authApi, chatApi } from '../lib/api';
import UserAvatar from '../components/UserAvatar';
import ConfirmationModal from '../components/ConfirmationModal';
import { Btn, Row, Section, SettingsShell } from './Settings';

// ── Local avatar helpers ────────────────────────────────────────────────────
// The backend has no avatar-upload endpoint, so a photo chosen here is stored
// in this browser only (per user id) and layered over the account picture.
const avatarKey = (userId: string | number) => `twinkle_avatar_${userId}`;
const AVATAR_REMOVED = '__removed__';

const saveLocalAvatar = (userId: string | number, dataUrl: string) => {
  try {
    localStorage.setItem(avatarKey(userId), dataUrl);
  } catch {
    /* storage may be full or blocked */
  }
};

const removeLocalAvatar = (userId: string | number) => {
  try {
    localStorage.setItem(avatarKey(userId), AVATAR_REMOVED);
  } catch {
    /* ignore */
  }
};

const withLocalAvatar = (user: User): User => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(avatarKey(user.id));
  } catch {
    stored = null;
  }
  if (!stored) return user;
  if (stored === AVATAR_REMOVED) return { ...user, avatarUrl: undefined };
  return { ...user, avatarUrl: stored };
};

const AVATAR_COLORS = ['#C6613F', '#D97757', '#7C3AED', '#2563EB', '#0891B2', '#059669', '#CA8A04', '#DB2777'];

// Simple preset avatars (coloured circle + initial) used by "Choose an avatar".
const presetAvatars = (name: string): string[] => {
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return AVATAR_COLORS.map(color => {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">` +
      `<rect width="128" height="128" fill="${color}"/>` +
      `<text x="64" y="66" dominant-baseline="central" text-anchor="middle" ` +
      `font-family="Inter,Arial,sans-serif" font-size="60" font-weight="600" fill="#fff">${letter}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat('en-US', {
    notation: value >= 1000000 ? 'compact' : 'standard', 
    maximumFractionDigits: 1,
  }).format(value); 

type ActivityPoint = { date: string; tokens: number; messages: number };

type HeatmapDay = ActivityPoint & { intensity: number };

const HEATMAP_DAYS = 364;

/**
 * Converts every supported backend date shape into the user's LOCAL calendar
 * date. Date-only strings are preserved; timestamps are converted through the
 * browser timezone so a late-night UTC message does not land on the wrong day.
 */
function toLocalDateKey(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  // Backend date-only values are already calendar dates. Do not run them
  // through Date/toISOString because that can shift the day by timezone.
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return raw;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeActivityCollection(value: unknown): ActivityPoint[] {
  const rows: any[] = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value as Record<string, any>).map(([date, point]) => ({
          ...(point && typeof point === 'object' ? point : {}),
          date: (point as any)?.date ?? date,
        }))
      : [];

  const byDate = new Map<string, ActivityPoint>();

  rows.forEach(item => {
    const date = toLocalDateKey(
      item?.date ?? item?.day ?? item?.activityDate ?? item?.createdAt ?? item?.created_at
    );
    if (!date) return;

    const tokens = Math.max(
      0,
      Number(
        item?.tokens ?? item?.tokenCount ?? item?.token_count ?? item?.responseWeight ?? item?.weight ?? 0
      ) || 0
    );
    const messages = Math.max(
      0,
      Number(
        item?.messages ?? item?.messageCount ?? item?.message_count ?? item?.count ?? 0
      ) || 0
    );

    const previous = byDate.get(date);
    byDate.set(date, {
      date,
      tokens: (previous?.tokens ?? 0) + tokens,
      messages: (previous?.messages ?? 0) + messages,
    });
  });

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function mergeSessionActivity(activity: ActivityPoint[], sessions: unknown): ActivityPoint[] {
  const merged = normalizeActivityCollection(activity);
  const byDate = new Map(merged.map(item => [item.date, { ...item }]));

  const rows = Array.isArray(sessions)
    ? sessions
    : Array.isArray((sessions as any)?.sessions)
      ? (sessions as any).sessions
      : [];

  rows.forEach((session: any) => {
    const date = toLocalDateKey(
      session?.updatedAt ?? session?.updated_at ?? session?.createdAt ?? session?.created_at
    );
    if (!date) return;

    const previous = byDate.get(date);
    byDate.set(date, {
      date,
      // Session existence is a reliable activity fallback even when the
      // stats endpoint has no token row for that day.
      tokens: previous?.tokens ?? 0,
      messages: Math.max(1, previous?.messages ?? 0),
    });
  });

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildHeatmap(activity: ActivityPoint[]): HeatmapDay[] {
  const byDate = new Map(
    normalizeActivityCollection(activity).map(item => [item.date, item])
  );

  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - (HEATMAP_DAYS - 1));
  // Sunday-first grid, matching the visual layout.
  start.setDate(start.getDate() - start.getDay());

  const days: Array<{ date: string; tokens: number; messages: number }> = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    const date = localDateKey(cursor);
    const item = byDate.get(date);
    days.push({
      date,
      tokens: item?.tokens ?? 0,
      messages: item?.messages ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Response weight is primarily token usage. If token usage is unavailable,
  // message count still marks the day as active.
  const weights = days.map(day =>
    Math.max(Number(day.tokens || 0), Number(day.messages || 0))
  );
  const maxWeight = Math.max(1, ...weights);

  return days.map(day => {
    const weight = Math.max(Number(day.tokens || 0), Number(day.messages || 0));
    return {
      ...day,
      intensity: weight > 0 ? Math.max(0.22, Math.min(1, weight / maxWeight)) : 0,
    };
  });
}
function monthLabels(days: ReturnType<typeof buildHeatmap>) {
  const labels: Array<{ label: string; column: number }> = [];

  days.forEach((day, index) => {
    const date = new Date(`${day.date}T00:00:00`);

    if (date.getDate() <= 7 && date.getDay() === 0) {
      labels.push({
        label: date.toLocaleDateString('en-US', { month: 'short' }),
        column: Math.floor(index / 7),
      });
    }
  });

  return labels;
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const OUTPUT_SIZE = 256;

/** "Crop photo" dialog: drag / arrow keys to reposition, slider or wheel to zoom. */
function CropPhotoModal({
  src,
  onCancel,
  onSave,
}: {
  src: string;
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const box = Math.min(360, typeof window === 'undefined' ? 360 : window.innerWidth - 96);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const dims = useMemo(() => {
    if (!natural) return { w: box, h: box };
    const base = Math.max(box / natural.w, box / natural.h);
    return { w: natural.w * base * zoom, h: natural.h * base * zoom };
  }, [natural, zoom, box]);

  const clamp = (x: number, y: number, d = dims) => {
    const maxX = Math.max(0, (d.w - box) / 2);
    const maxY = Math.max(0, (d.h - box) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  };

  useEffect(() => {
    setOffset(current => clamp(current.x, current.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dims.w, dims.h]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setOffset(clamp(drag.current.ox + event.clientX - drag.current.x, drag.current.oy + event.clientY - drag.current.y));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = 12;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setOffset(current => clamp(current.x + move[0], current.y + move[1]));
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const save = () => {
    const img = imgRef.current;
    if (!img || !natural) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const ratio = OUTPUT_SIZE / box;
    const left = (box - dims.w) / 2 + offset.x;
    const top = (box - dims.h) / 2 + offset.y;
    ctx.drawImage(img, left * ratio, top * ratio, dims.w * ratio, dims.h * ratio);
    onSave(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Crop photo"
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-[500px] rounded-2xl bg-white p-[30px] shadow-2xl dark:bg-[#30302E]"
      >
        <h3 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Crop photo</h3>
        <p className="mt-2 text-[14px] leading-5 text-zinc-600 dark:text-zinc-400">
          Drag or use the arrow keys to reposition. Use the slider or scroll to zoom.
        </p>

        <div className="mt-5 flex justify-center">
          <div
            tabIndex={0}
            role="application"
            aria-label="Photo crop area"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            onWheel={event => setZoom(z => Math.min(3, Math.max(1, z - event.deltaY * 0.002)))}
            className="relative touch-none cursor-grab select-none overflow-hidden rounded-xl bg-zinc-100 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 active:cursor-grabbing dark:bg-black/30"
            style={{ width: box, height: box }}
          >
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              onLoad={event => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
              className="pointer-events-none absolute max-w-none"
              style={{
                width: dims.w,
                height: dims.h,
                left: (box - dims.w) / 2 + offset.x,
                top: (box - dims.h) / 2 + offset.y,
              }}
            />
            {/* Circular guide: what sits outside the circle is dimmed */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ boxShadow: '0 0 0 9999px rgba(255,255,255,0.45)' }}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <button
            type="button"
            onClick={() => setZoom(z => Math.max(1, z - 0.2))}
            aria-label="Zoom out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            <Minus className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={event => setZoom(Number(event.target.value))}
            aria-label="Zoom"
            className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900 dark:bg-white/15 dark:accent-white"
          />
          <button
            type="button"
            onClick={() => setZoom(z => Math.min(3, z + 0.2))}
            aria-label="Zoom in"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10"
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={1.7} />
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg px-2 py-1.5 text-[14px] text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          >
            Reset
          </button>
          <div className="flex gap-2">
            <Btn onClick={onCancel}>Cancel</Btn>
            <Btn variant="primary" onClick={save} disabled={!natural}>
              Save
            </Btn>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** "Choose an avatar": a grid of simple preset avatars. */
function AvatarPickerModal({
  name,
  onCancel,
  onPick,
}: {
  name: string;
  onCancel: () => void;
  onPick: (dataUrl: string) => void;
}) {
  const options = useMemo(() => presetAvatars(name), [name]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Choose an avatar"
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.16 }}
        className="w-full max-w-[420px] rounded-2xl bg-white p-[30px] shadow-2xl dark:bg-[#30302E]"
      >
        <h3 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">Choose an avatar</h3>
        <div className="mt-5 grid grid-cols-4 gap-4">
          {options.map((url, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onPick(url)}
              aria-label={`Avatar ${index + 1}`}
              className="overflow-hidden rounded-full ring-offset-2 ring-offset-white transition hover:ring-2 hover:ring-zinc-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 dark:ring-offset-[#30302E]"
            >
              <img src={url} alt="" className="h-full w-full" />
            </button>
          ))}
        </div>
        <div className="mt-6 flex justify-end">
          <Btn onClick={onCancel}>Cancel</Btn>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Profile({
  user,
  onUserUpdate,
}: {
  user: User;
  onUserUpdate: (user: User) => void;
}) {

  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.name?.trim() || '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSaved, setNameSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [confirmAccount, setConfirmAccount] = useState<'logoutAll' | 'delete' | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const photoMenuRef = useRef<HTMLDivElement | null>(null);

  const [activityRange, setActivityRange] =
    useState<'daily' | 'weekly' | 'cumulative'>('daily');

  const [stats, setStats] = useState<any>({
    lifetimeTokens: 0,
    peakTokens: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalChats: 0,
    messageCount: 0,
    userMessages: 0,
    assistantMessages: 0,
    activeDays: 0,
    dailyActivity: [],
  });

  const refreshStats = async () => {
    setRefreshing(true);

    try {
      const response = await authApi.getProfileStats() as any;
      // Accept both the direct stats payload and common wrapped API shapes.
      const next = response?.data ?? response?.stats ?? response?.profileStats ?? response ?? {};
      let activity = normalizeActivityCollection(next?.dailyActivity ?? next?.activity ?? next?.daily_activity);

      // Merge successful chat usage recorded by Chat.tsx. The backend remains
      // authoritative when it reports larger totals; local data fills missing stats.
      let localUsage: any = {};
      try {
        localUsage = JSON.parse(localStorage.getItem('twinkle_token_usage_v1') || '{}');
      } catch {
        localUsage = {};
      }
      const localActivity = normalizeActivityCollection(localUsage?.dailyActivity ?? localUsage?.daily_activity);
      const activityByDate = new Map(activity.map(point => [point.date, { ...point }]));
      localActivity.forEach(point => {
        const existing = activityByDate.get(point.date);
        activityByDate.set(point.date, {
          date: point.date,
          // Use the greater value rather than adding, since backend and local
          // activity may describe the same conversation.
          tokens: Math.max(existing?.tokens ?? 0, point.tokens),
          messages: Math.max(existing?.messages ?? 0, point.messages),
        });
      });
      activity = Array.from(activityByDate.values()).sort((a, b) => a.date.localeCompare(b.date));

      // The profile graph must remain useful even if a backend stats row is
      // missing. Existing chat sessions are therefore merged as a fallback.
      try {
        const sessionsResponse = await chatApi.getSessions() as any;
        activity = mergeSessionActivity(activity, sessionsResponse);
      } catch (sessionError) {
        console.warn('Profile session activity fallback failed:', sessionError);
      }

      setStats({
        ...next,
        totalChats: Number(next?.totalChats ?? next?.totalSessions ?? next?.total_chats ?? 0),
        messageCount: Number(next?.messageCount ?? next?.totalMessages ?? next?.total_messages ?? 0),
        userMessages: Number(next?.userMessages ?? next?.user_messages ?? 0),
        assistantMessages: Number(next?.assistantMessages ?? next?.aiMessages ?? next?.ai_messages ?? 0),
        activeDays: Number(next?.activeDays ?? next?.active_days ?? activity.filter(point => point.messages > 0).length),
        currentStreak: Number(next?.currentStreak ?? next?.current_streak ?? 0),
        longestStreak: Number(next?.longestStreak ?? next?.longest_streak ?? 0),
        lifetimeTokens: Math.max(
          0,
          Number(next?.lifetimeTokens ?? next?.lifetime_tokens ?? 0) || 0,
          Number(localUsage?.lifetimeTokens ?? localUsage?.lifetime_tokens ?? 0) || 0,
        ),
        peakTokens: Math.max(
          0,
          Number(next?.peakTokens ?? next?.peak_tokens ?? 0) || 0,
          Number(localUsage?.peakTokens ?? localUsage?.peak_tokens ?? 0) || 0,
        ),
        dailyActivity: activity,
      });
    } catch (error) {
      console.error('Profile stats refresh failed:', error);
      // Keep valid locally persisted usage visible when the stats endpoint is
      // temporarily unavailable; never replace a known value with an empty one.
      let localUsage: any = {};
      try {
        localUsage = JSON.parse(localStorage.getItem('twinkle_token_usage_v1') || '{}');
      } catch {
        localUsage = {};
      }
      const localActivity = normalizeActivityCollection(localUsage?.dailyActivity ?? localUsage?.daily_activity);
      setStats((previous: any) => ({
        ...previous,
        lifetimeTokens: Math.max(
          Number(previous?.lifetimeTokens || 0) || 0,
          Number(localUsage?.lifetimeTokens ?? localUsage?.lifetime_tokens ?? 0) || 0,
        ),
        peakTokens: Math.max(
          Number(previous?.peakTokens || 0) || 0,
          Number(localUsage?.peakTokens ?? localUsage?.peak_tokens ?? 0) || 0,
        ),
        dailyActivity: localActivity.length ? localActivity : previous.dailyActivity,
      }));
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshStats();

    const interval = window.setInterval(
      () => void refreshStats(),
      30_000
    );

    const refreshFromChat = () => void refreshStats();
    window.addEventListener('twinkle-chat-activity-updated', refreshFromChat);
    window.addEventListener('twinkle-live-session-updated', refreshFromChat);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('twinkle-chat-activity-updated', refreshFromChat);
      window.removeEventListener('twinkle-live-session-updated', refreshFromChat);
    };
  }, []);

  useEffect(() => {
    setUsername(user.username);
  }, [user.username]);

  useEffect(() => {
    setFullName(user.name?.trim() || '');
  }, [user.name]);

  const heatmap = useMemo(
    () =>
      buildHeatmap(
        Array.isArray(stats.dailyActivity)
          ? stats.dailyActivity
          : []
      ),
    [stats.dailyActivity]
  );

  const labels = useMemo(
    () => monthLabels(heatmap),
    [heatmap]
  );

  const activitySummary = useMemo(() => {
    const days =
      activityRange === 'daily'
        ? 1
        : activityRange === 'weekly'
          ? 7
          : HEATMAP_DAYS;

    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (days - 1));

    const points = heatmap.filter(item => {
      const date = new Date(`${item.date}T00:00:00`);
      return !Number.isNaN(date.getTime()) && date >= cutoff;
    });

    return {
      tokens: points.reduce((sum, item) => sum + Number(item.tokens || 0), 0),
      messages: points.reduce((sum, item) => sum + Number(item.messages || 0), 0),
    };
  }, [activityRange, heatmap]);

  const save = async () => {
    const nextUsername = username.trim();

    if (!nextUsername) {
      setError('Username cannot be empty.');
      return;
    }

    if (
      nextUsername ===
      String(user.username || '').trim()
    ) {
      setError('');
      return;
    }

    setError('');
    setSaving(true);

    try {
      const res: any =
        await authApi.updateProfile({
          username: nextUsername,
        });

      onUserUpdate(withLocalAvatar(res.user));
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1800);
    } catch (e: any) {
      const status = Number(e?.status || 0);
      const message = String(e?.message || '');

      if (
        status === 409 ||
        /username.*(taken|exist|available|already)/i.test(
          message
        )
      ) {
        setError(
          'That username is already taken. Please choose another username.'
        );
      } else {
        setError(
          message || 'Unable to update profile.'
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const saveFullName = async () => {
    const next = fullName.trim().replace(/\s+/g, ' ');
    if (next === (user.name?.trim() || '')) {
      setNameError('');
      return;
    }
    if (next.length < 2) {
      setNameError('Full name must be at least 2 characters.');
      return;
    }
    setNameError('');
    setNameSaving(true);
    try {
      const res: any = await authApi.updateProfile({ name: next });
      onUserUpdate(withLocalAvatar(res.user));
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 1800);
    } catch (e: any) {
      setNameError(String(e?.message || '') || 'Unable to update name.');
    } finally {
      setNameSaving(false);
    }
  };

  const displayName = user.name?.trim() || user.username;
  const providerLabel =
    user.authProvider === 'GOOGLE' ? 'Google' : user.authProvider === 'APPLE' ? 'Apple' : 'Email & password';
  const memberSince = user.createdAt ? new Date(user.createdAt) : null;
  const memberSinceLabel =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? memberSince.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

  const summaryCards = [
    { label: 'Lifetime tokens', value: formatNumber(Number(stats.lifetimeTokens || 0)), icon: Zap },
    { label: 'Peak tokens', value: formatNumber(Number(stats.peakTokens || 0)), icon: Trophy },
    { label: 'Current streak', value: `${Number(stats.currentStreak || 0)} days`, icon: Flame },
    { label: 'Longest streak', value: `${Number(stats.longestStreak || 0)} days`, icon: CalendarDays },
  ];

  const insightRows: Array<[string, string]> = [
    ['Total chats', formatNumber(Number(stats.totalChats || 0))],
    ['Total messages', formatNumber(Number(stats.messageCount || 0))],
    ['User messages', formatNumber(Number(stats.userMessages || 0))],
    ['AI messages', formatNumber(Number(stats.assistantMessages || 0))],
    ['Active days', formatNumber(Number(stats.activeDays || 0))],
    [
      'Average messages per chat',
      Number(stats.totalChats || 0)
        ? (Number(stats.messageCount || 0) / Number(stats.totalChats || 1)).toFixed(1)
        : '0',
    ],
    ['Peak daily tokens', formatNumber(Number(stats.peakTokens || 0))],
  ];

  const columnCount = Math.max(1, Math.floor(heatmap.length / 7) - 1);

  // A photo chosen here is kept in this browser (the backend has no upload
  // endpoint) and layered over the account picture.
  useEffect(() => {
    const layered = withLocalAvatar(user);
    if (layered.avatarUrl !== user.avatarUrl) onUserUpdate(layered);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, user.avatarUrl]);

  useEffect(() => {
    if (!photoMenu) return;
    const onPointer = (event: MouseEvent) => {
      if (!photoMenuRef.current?.contains(event.target as Node)) setPhotoMenu(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPhotoMenu(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [photoMenu]);

  const onFileChosen = (file: File | undefined) => {
    if (!file) return;
    setPhotoError('');
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) {
      setPhotoError('Please choose a PNG, JPEG, or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('That image is larger than 10MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSrc(String(reader.result));
    reader.onerror = () => setPhotoError('Could not read that image.');
    reader.readAsDataURL(file);
  };

  const applyAvatar = (dataUrl: string) => {
    saveLocalAvatar(user.id, dataUrl);
    onUserUpdate({ ...user, avatarUrl: dataUrl });
    setCropSrc(null);
    setPickingAvatar(false);
  };

  const removePhoto = () => {
    removeLocalAvatar(user.id);
    onUserUpdate({ ...user, avatarUrl: undefined });
    setPhotoMenu(false);
  };

  const logOut = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await authApi.logout();
      // A full navigation clears all in-memory session state.
      window.location.assign('/login');
    } catch (e: any) {
      setLogoutError(String(e?.message || 'Could not log out. Please try again.'));
      setLoggingOut(false);
    }
  };

  // "Log out of all devices": ends every session of this account, including this one.
  const logOutEverywhere = async () => {
    setAccountBusy(true);
    setAccountError('');
    try {
      await authApi.logoutAll();
      window.location.assign('/login');
    } catch (e: any) {
      setAccountError(String(e?.message || 'Could not log out of all devices. Please try again.'));
      setAccountBusy(false);
      setConfirmAccount(null);
    }
  };

  // "Delete your account": permanently removes the account and all its data.
  const deleteAccount = async () => {
    setAccountBusy(true);
    setAccountError('');
    try {
      await authApi.deleteAccount();
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch { /* storage may be blocked */ }
      window.location.assign('/login');
    } catch (e: any) {
      setAccountError(String(e?.message || 'Could not delete your account. Please try again.'));
      setAccountBusy(false);
      setConfirmAccount(null);
    }
  };

  const inputClass =
    'h-9 w-full rounded-lg border border-zinc-300/70 bg-white px-3 text-[14px] text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-500 dark:border-white/15 dark:bg-transparent dark:text-white dark:focus:border-white/40';

  const refreshAction = (
    <Btn onClick={() => void refreshStats()} disabled={refreshing} label="Refresh activity">
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
      Refresh
    </Btn>
  );

  return (
    <SettingsShell activeId="account">
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={event => {
          onFileChosen(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {/* PROFILE */}
      <Section title="Profile" first>
        <Row title="Profile photo" desc="PNG, JPEG, or WebP, up to 10MB.">
          <div ref={photoMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setPhotoMenu(open => !open)}
              aria-haspopup="menu"
              aria-expanded={photoMenu}
              aria-label="Change profile photo"
              className="group relative block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60"
            >
              <UserAvatar
                name={displayName}
                avatarUrl={user.avatarUrl}
                className="h-[50px] w-[50px] text-lg font-semibold !shadow-none"
              />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <Pencil className="h-4 w-4" strokeWidth={1.8} />
              </span>
            </button>

            <AnimatePresence>
              {photoMenu && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-[calc(100%+8px)] z-20 w-[212px] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-[#3A3A38]"
                >
                  {[
                    { label: 'Replace photo', icon: ImageIcon, action: () => { setPhotoMenu(false); fileInput.current?.click(); } },
                    { label: 'Choose an avatar', icon: UserCircle2, action: () => { setPhotoMenu(false); setPickingAvatar(true); } },
                  ].map(item => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={item.action}
                      className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] text-zinc-900 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-white/10"
                    >
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
                      {item.label}
                    </button>
                  ))}
                  {user.avatarUrl && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={removePhoto}
                      className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[14px] text-[#b3261e] transition-colors hover:bg-[#fdf1f0] dark:text-[#f2b8b5] dark:hover:bg-[#2a0f12]"
                    >
                      <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.6} />
                      Remove
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Row>
        {photoError && (
          <p role="alert" className="-mt-2 pb-3 text-sm text-[#b3261e] dark:text-[#f2b8b5]">
            {photoError}
          </p>
        )}

        <Row title="Full name">
          <div className="w-full sm:w-[280px]">
            <div className="relative">
              <input
                id="profile-full-name"
                value={fullName}
                placeholder={displayName}
                onChange={event => {
                  setFullName(event.target.value);
                  if (nameError) setNameError('');
                }}
                onBlur={() => void saveFullName()}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    setFullName(user.name?.trim() || '');
                    setNameError('');
                    event.currentTarget.blur();
                  }
                }}
                aria-label="Full name"
                aria-invalid={Boolean(nameError)}
                className={`${inputClass} pr-9 ${nameError ? '!border-[#d9534f]' : ''}`}
                autoComplete="name"
                maxLength={100}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-live="polite">
                {nameSaving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : nameSaved ? (
                  <Check className="h-4 w-4 text-[#2e7d32] dark:text-[#81c784]" strokeWidth={2.2} />
                ) : null}
              </span>
            </div>
          </div>
        </Row>
        {nameError && (
          <p role="alert" className="-mt-2 pb-3 text-sm text-[#b3261e] dark:text-[#f2b8b5] sm:text-right">
            {nameError}
          </p>
        )}

        <Row title="What should Twinkle call you?">
          <div className="w-full sm:w-[280px]">
            <div className="relative">
              <input
                id="profile-username"
                value={username}
                onChange={event => {
                  setUsername(event.target.value);
                  if (error) setError('');
                }}
                onBlur={() => {
                  if (username.trim() !== String(user.username || '').trim()) void save();
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    setUsername(user.username);
                    setError('');
                    event.currentTarget.blur();
                  }
                }}
                aria-label="What should Twinkle call you?"
                aria-invalid={Boolean(error)}
                className={`${inputClass} pr-9 ${error ? '!border-[#d9534f]' : ''}`}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-live="polite">
                {saving ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : savedFlash ? (
                  <Check className="h-4 w-4 text-[#2e7d32] dark:text-[#81c784]" strokeWidth={2.2} />
                ) : null}
              </span>
            </div>
          </div>
        </Row>
        {error && (
          <p role="alert" className="-mt-2 pb-3 text-sm text-[#b3261e] dark:text-[#f2b8b5] sm:text-right">
            {error}
          </p>
        )}
      </Section>

      {/* ACCOUNT */}
      <Section title="Account">
        {user.email && (
          <Row title="Email">
            <span className="break-all text-[14px] text-zinc-700 dark:text-zinc-300">{user.email}</span>
          </Row>
        )}
        <Row title="Signed in with">
          <span className="text-[14px] text-zinc-700 dark:text-zinc-300">{providerLabel}</span>
        </Row>
        {memberSinceLabel && (
          <Row title="Member since">
            <span className="text-[14px] text-zinc-700 dark:text-zinc-300">{memberSinceLabel}</span>
          </Row>
        )}
        <Row title="Log out" desc="Sign out of Twinkle on this device.">
          <Btn onClick={() => void logOut()} disabled={loggingOut}>
            {loggingOut ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
            Log out
          </Btn>
        </Row>
        {logoutError && (
          <p role="alert" className="-mt-2 pb-3 text-sm text-[#b3261e] dark:text-[#f2b8b5] sm:text-right">
            {logoutError}
          </p>
        )}
        <Row title="Log out of all devices" desc="Sign out of Twinkle everywhere you are logged in, including this device.">
          <Btn onClick={() => setConfirmAccount('logoutAll')} disabled={accountBusy}>
            Log out
          </Btn>
        </Row>
        <Row title="Delete your account" desc="Permanently delete your account, chats and knowledge-base files. This cannot be undone.">
          <Btn variant="primary" onClick={() => setConfirmAccount('delete')} disabled={accountBusy}>
            Delete account
          </Btn>
        </Row>
        {accountError && (
          <p role="alert" className="-mt-2 pb-3 text-sm text-[#b3261e] dark:text-[#f2b8b5] sm:text-right">
            {accountError}
          </p>
        )}
      </Section>

      {/* ACTIVITY */}
      <Section title="Activity" action={refreshAction}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-transparent"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
                <Icon className="h-4 w-4 text-zinc-400" strokeWidth={1.6} />
              </div>
              <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-900 dark:text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-transparent">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-medium text-zinc-900 dark:text-white">Token activity</h3>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                Darker squares mean heavier responses that day.
              </p>
            </div>

            <div role="radiogroup" aria-label="Activity range" className="inline-flex gap-0.5 rounded-xl bg-zinc-100 p-[3px] dark:bg-white/5">
              {(['daily', 'weekly', 'cumulative'] as const).map(range => {
                const selected = activityRange === range;
                return (
                  <button
                    key={range}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setActivityRange(range)}
                    className={`h-8 rounded-[9px] border px-3.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 ${
                      selected
                        ? 'border-zinc-200 bg-white text-zinc-900 shadow-[0_1px_2px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-white/15 dark:text-white'
                        : 'border-transparent text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                    }`}
                  >
                    {range[0].toUpperCase() + range.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 w-full overflow-x-auto pb-1">
            <div className="min-w-[760px]">
              <div className="relative h-5 text-xs text-zinc-500 dark:text-zinc-400">
                {labels.map(item => (
                  <span
                    key={`${item.label}-${item.column}`}
                    className="absolute"
                    style={{ left: `${(item.column / columnCount) * 100}%` }}
                  >
                    {item.label}
                  </span>
                ))}
              </div>

              <div className="mt-1 grid grid-flow-col grid-rows-7 gap-[5px]">
                {heatmap.map(day => {
                  const active = day.messages > 0 || day.tokens > 0;
                  return (
                    <span
                      key={day.date}
                      title={`${day.date}: ${formatNumber(day.tokens)} tokens · ${day.messages} messages`}
                      className={`h-[15px] w-[15px] rounded-[4px] ${active ? '' : 'bg-zinc-100 dark:bg-white/10'}`}
                      style={
                        active
                          ? { backgroundColor: `rgba(198, 97, 63, ${Math.max(0.2, Math.min(1, day.intensity))})` }
                          : undefined
                      }
                    />
                  );
                })}
              </div>

              <div
                className="mt-4 flex items-center justify-end gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
                aria-label="Token response weight legend"
              >
                <span>Less</span>
                <span className="h-[12px] w-[12px] rounded-[3px] bg-zinc-100 dark:bg-white/10" />
                {[0.25, 0.5, 0.75, 1].map(weight => (
                  <span
                    key={weight}
                    className="h-[12px] w-[12px] rounded-[3px]"
                    style={{ backgroundColor: `rgba(198, 97, 63, ${weight})` }}
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 border-t border-zinc-200/70 pt-4 text-sm text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            <span className="text-zinc-800 dark:text-zinc-200">
              {activityRange === 'daily' ? 'Today' : activityRange === 'weekly' ? 'Last 7 days' : 'Last 12 months'}
            </span>
            <span className="text-right">
              {formatNumber(activitySummary.messages)} messages · {formatNumber(activitySummary.tokens)} tokens
            </span>
          </div>
        </div>
      </Section>

      {/* INSIGHTS */}
      <Section title="Activity insights">
        {insightRows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 border-b border-zinc-200/70 py-4 last:border-0 dark:border-white/10"
          >
            <p className="text-[14px] text-zinc-900 dark:text-zinc-50">{label}</p>
            <p className="text-[14px] text-zinc-600 dark:text-zinc-300">{value}</p>
          </div>
        ))}
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Check className="h-3.5 w-3.5 shrink-0" />
          Live account data · Updates automatically every 30 seconds.
        </p>
      </Section>

      <ConfirmationModal
        isOpen={confirmAccount === 'logoutAll'}
        onClose={() => setConfirmAccount(null)}
        onConfirm={() => void logOutEverywhere()}
        isLoading={accountBusy}
        closeOnConfirm={false}
        title="Log out of all devices?"
        message="You will be signed out of Twinkle on every device, including this one, and will need to log in again."
        confirmText="Log out everywhere"
        isDestructive={false}
      />
      <ConfirmationModal
        isOpen={confirmAccount === 'delete'}
        onClose={() => setConfirmAccount(null)}
        onConfirm={() => void deleteAccount()}
        isLoading={accountBusy}
        closeOnConfirm={false}
        title="Delete your account?"
        message="This permanently deletes your account, all of your chats and your knowledge-base files. This action cannot be undone."
        confirmText="Delete account"
      />

      <AnimatePresence>
        {cropSrc && <CropPhotoModal key="crop" src={cropSrc} onCancel={() => setCropSrc(null)} onSave={applyAvatar} />}
        {pickingAvatar && (
          <AvatarPickerModal key="avatars" name={displayName} onCancel={() => setPickingAvatar(false)} onPick={applyAvatar} />
        )}
      </AnimatePresence>
    </SettingsShell>
  );
}
