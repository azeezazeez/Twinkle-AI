import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Edit3,
  Flame,
  Mail,
  MessagesSquare,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { User } from '../types';
import { authApi, chatApi } from '../lib/api';
import UserAvatar from '../components/UserAvatar';

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

export default function Profile({
  user,
  onUserUpdate,
}: {
  user: User;
  onUserUpdate: (user: User) => void;
}) {
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user.username);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

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
      setEditing(false);
      return;
    }

    setError('');
    setSaving(true);

    try {
      const res: any =
        await authApi.updateProfile({
          username: nextUsername,
        });

      onUserUpdate(res.user);
      setEditing(false);
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

  const displayName = user.name?.trim() || user.username;
  const providerLabel =
    user.authProvider === 'GOOGLE' ? 'Google' : user.authProvider === 'APPLE' ? 'Apple' : 'Email & password';
  const memberSince = user.createdAt ? new Date(user.createdAt) : null;
  const memberSinceLabel =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? memberSince.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

  const cancelEdit = () => {
    setUsername(user.username);
    setError('');
    setEditing(false);
  };

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

  return (
    <div className="h-[100dvh] w-full overflow-y-auto bg-zinc-50/60 text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-[960px] flex-col px-5 pb-16 pt-5 sm:px-8 sm:pt-8">
        {/* TOP BAR */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else navigate('/');
            }}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshStats()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Settings
            </button>
          </div>
        </div>

        {/* PROFILE HEADER */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mt-6 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div
            className="h-24 w-full sm:h-28"
            style={{
              background:
                'radial-gradient(circle at 12% 30%, rgba(244,114,182,.55) 0%, transparent 46%), radial-gradient(circle at 55% 0%, rgba(139,92,246,.55) 0%, transparent 50%), radial-gradient(circle at 92% 60%, rgba(56,189,248,.5) 0%, transparent 48%)',
            }}
            aria-hidden="true"
          />

          <div className="px-6 pb-6">
            <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
              <UserAvatar
                name={displayName}
                avatarUrl={user.avatarUrl}
                className="h-24 w-24 rounded-full border-4 border-white text-[28px] font-semibold shadow-md dark:border-zinc-950 sm:h-28 sm:w-28"
              />

              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex w-fit items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                >
                  <Edit3 className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Edit profile
                </button>
              )}
            </div>

            <div className="mt-4 min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
                {displayName}
              </h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">@{user.username}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                {user.email && (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900">
                  Signed in with {providerLabel}
                </span>
                {memberSinceLabel && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 dark:bg-zinc-900">
                    <CalendarDays className="h-3 w-3 shrink-0" />
                    Member since {memberSinceLabel}
                  </span>
                )}
              </div>
            </div>

            {editing && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <label
                  htmlFor="profile-username"
                  className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400"
                >
                  Username
                </label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="profile-username"
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') void save();
                      if (event.key === 'Escape') cancelEdit();
                    }}
                    className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={32}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 sm:flex-none"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void save()}
                      disabled={saving}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 sm:flex-none"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
                {error && (
                  <p role="alert" className="mt-2 px-1 text-xs font-medium text-[#dc2626] dark:text-[#f87171]">
                    {error}
                  </p>
                )}
              </motion.div>
            )}
          </div>
        </motion.section>

        {/* SUMMARY CARDS */}
        <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon }, index) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.04 * index, ease: 'easeOut' }}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:p-5"
            >
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                  {label}
                </p>
                <Icon className="h-4 w-4 text-zinc-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white">{value}</p>
            </motion.div>
          ))}
        </section>

        {/* TOKEN ACTIVITY */}
        <section className="mt-4 rounded-3xl border border-zinc-200 bg-white px-5 py-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-zinc-900 dark:text-white">Token activity</h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Darker squares mean heavier responses that day.
              </p>
            </div>

            <div role="radiogroup" aria-label="Activity range" className="inline-flex rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
              {(['daily', 'weekly', 'cumulative'] as const).map(range => {
                const selected = activityRange === range;
                return (
                  <button
                    key={range}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setActivityRange(range)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/50 ${
                      selected
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                        : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
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
              <div className="relative h-5 text-[12px] text-zinc-500 dark:text-zinc-400">
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
                    <motion.span
                      key={day.date}
                      title={`${day.date}: ${formatNumber(day.tokens)} tokens · ${day.messages} messages`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      className={`h-[15px] w-[15px] rounded-[4px] ${
                        active ? '' : 'bg-zinc-100 dark:bg-zinc-900'
                      }`}
                      style={
                        active
                          ? { backgroundColor: `rgba(124, 58, 237, ${Math.max(0.2, Math.min(1, day.intensity))})` }
                          : undefined
                      }
                    />
                  );
                })}
              </div>

              <div
                className="mt-4 flex items-center justify-end gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400"
                aria-label="Token response weight legend"
              >
                <span>Less</span>
                <span className="h-[12px] w-[12px] rounded-[3px] bg-zinc-100 dark:bg-zinc-900" />
                {[0.25, 0.5, 0.75, 1].map(weight => (
                  <span
                    key={weight}
                    className="h-[12px] w-[12px] rounded-[3px]"
                    style={{ backgroundColor: `rgba(124, 58, 237, ${weight})` }}
                  />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              {activityRange === 'daily' ? 'Today' : activityRange === 'weekly' ? 'Last 7 days' : 'Last 12 months'}
            </span>
            <span className="text-right">
              {formatNumber(activitySummary.messages)} messages · {formatNumber(activitySummary.tokens)} tokens
            </span>
          </div>
        </section>

        {/* ACTIVITY INSIGHTS */}
        <section className="mt-4 rounded-3xl border border-zinc-200 bg-white px-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2 pt-6">
            <MessagesSquare className="h-4 w-4 text-zinc-400" />
            <h2 className="font-semibold text-zinc-900 dark:text-white">Activity insights</h2>
          </div>

          <div className="mt-2">
            {insightRows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 border-b border-zinc-100 py-4 last:border-0 dark:border-zinc-800"
              >
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER */}
        <div className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span>Live account data · Updates automatically every 30 seconds.</span>
        </div>
      </main>
    </div>
  );
}
