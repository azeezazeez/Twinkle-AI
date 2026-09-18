import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Edit3, RefreshCw, Save } from 'lucide-react';
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
      const next = await authApi.getProfileStats() as any;
      let activity = normalizeActivityCollection(next?.dailyActivity);

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
        dailyActivity: activity,
      });
    } catch (error) {
      console.error('Profile stats refresh failed:', error);
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

  return (
    <div className="h-[100dvh] w-full overflow-y-auto bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white">
      <div className="min-h-[100dvh] w-full">
        <main className="mx-auto flex min-h-[100dvh] w-full max-w-[1320px] flex-col px-5 pb-16 pt-6 sm:px-8 lg:px-12 xl:px-16">

          {/* TOP BAR */}
          <div className="flex items-center justify-between gap-4 text-sm">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate('/');
                }
              }}
              className="inline-flex items-center gap-2 text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
            >
              <ArrowLeft
                className="h-4 w-4"
                strokeWidth={1.8}
              />
              Back
            </button>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void refreshStats()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    refreshing ? 'animate-spin' : ''
                  }`}
                />
                Refresh
              </button>

              <button
                type="button"
                onClick={() =>
                  setEditing(value => !value)
                }
                className="inline-flex items-center gap-2 font-semibold text-zinc-900 transition hover:text-zinc-500 dark:text-white dark:hover:text-zinc-300"
              >
                <Edit3
                  className="h-4 w-4"
                  strokeWidth={1.8}
                />
                Edit
              </button>
            </div>
          </div>

          {/* PROFILE HEADER */}
          <section className="pt-7 text-center sm:pt-8">
            <UserAvatar
              name={user.username}
              avatarUrl={user.avatarUrl}
              className="mx-auto h-[118px] w-[118px] rounded-full border border-zinc-200 text-[31px] font-medium shadow-none dark:border-zinc-800"
            />

            <h1 className="mt-7 text-[34px] font-normal tracking-[-0.035em] text-zinc-950 dark:text-white sm:text-[36px]">
              {user.username}
            </h1>

            <div className="mt-2 text-[15px] text-zinc-500">
              @{user.username}
            </div>

            {editing && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="mx-auto mt-6 flex max-w-xl gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2 text-left dark:border-zinc-800 dark:bg-zinc-900"
              >
                <input
                  value={username}
                  onChange={event =>
                    setUsername(event.target.value)
                  }
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      void save();
                    }
                  }}
                  className="min-w-0 flex-1 rounded-xl bg-white px-4 py-2.5 text-sm outline-none ring-0 dark:bg-zinc-950"
                  aria-label="Username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={32}
                />

                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  <Save className="mr-1.5 inline h-4 w-4" />
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </motion.div>
            )}

            {error && (
              <p className="mt-2 text-xs text-red-500">
                {error}
              </p>
            )}
          </section>

          {/* SUMMARY CARDS */}
          <section className="mx-auto mt-10 grid w-full max-w-[1000px] grid-cols-2 divide-x divide-zinc-200 overflow-hidden rounded-[24px] border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-4">
            {[
              [
                'Lifetime tokens',
                formatNumber(
                  Number(stats.lifetimeTokens || 0)
                ),
              ],
              [
                'Peak tokens',
                formatNumber(
                  Number(stats.peakTokens || 0)
                ),
              ],
              [
                'Current streak',
                `${Number(
                  stats.currentStreak || 0
                )} days`,
              ],
              [
                'Longest streak',
                `${Number(
                  stats.longestStreak || 0
                )} days`,
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="px-4 py-4 text-center sm:px-5 sm:py-5"
              >
                <p className="text-[16px] font-normal text-zinc-950 dark:text-white">
                  {value}
                </p>

                <p className="mt-1 text-[13px] text-zinc-500 sm:text-[14px]">
                  {label}
                </p>
              </div>
            ))}
          </section>

          {/* TOKEN ACTIVITY */}
          <section className="mx-auto mt-12 w-full max-w-[1000px]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-[16px] font-semibold">
                Token activity
              </h2>

              <div className="flex items-center gap-4 text-[15px]">
                {(
                  [
                    'daily',
                    'weekly',
                    'cumulative',
                  ] as const
                ).map(range => (
                  <button
                    key={range}
                    type="button"
                    onClick={() =>
                      setActivityRange(range)
                    }
                    className={
                      activityRange === range
                        ? 'font-medium text-zinc-900 dark:text-white'
                        : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                    }
                  >
                    {range[0].toUpperCase() +
                      range.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 w-full overflow-x-auto pb-1">
              <div className="min-w-[760px]">
                <div className="relative ml-0 h-5 text-[14px] text-zinc-400">
                  {labels.map(item => (
                    <span
                      key={`${item.label}-${item.column}`}
                      className="absolute"
                      style={{
                        left: `${
                          (item.column /
                            Math.max(
                              1,
                              Math.floor(
                                heatmap.length / 7
                              ) - 1
                            )) *
                          100
                        }%`,
                      }}
                    >
                      {item.label}
                    </span>
                  ))}
                </div>

                <div className="mt-1 grid grid-flow-col grid-rows-7 gap-[5px]">
                  {heatmap.map(day => (
                    <motion.span
                      key={day.date}
                      title={`${day.date}: ${formatNumber(
                        day.tokens
                      )} tokens · ${
                        day.messages
                      } messages`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      className={`h-[15px] w-[15px] rounded-[4px] border transition ${
                        (day.messages > 0 || day.tokens > 0)
                          ? 'border-zinc-300 dark:border-zinc-700'
                          : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-transparent'
                      }`}
                      style={{
                        backgroundColor:
                          (day.messages > 0 || day.tokens > 0)
                            ? `rgba(0, 0, 0, ${Math.max(0.12, Math.min(1, day.intensity))})`
                            : undefined,
                        borderColor:
                          (day.messages > 0 || day.tokens > 0)
                            ? `rgba(0, 0, 0, ${Math.max(0.18, Math.min(1, day.intensity + 0.08))})`
                            : undefined,
                      }}
                    />
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-zinc-400" aria-label="Token response weight legend">
                  <span>Less</span>
                  {[0.12, 0.3, 0.5, 0.75, 1].map(weight => (
                    <span
                      key={weight}
                      className="h-[12px] w-[12px] rounded-[3px] border"
                      style={{
                        backgroundColor: `rgba(0, 0, 0, ${weight})`,
                        borderColor: `rgba(0, 0, 0, ${Math.min(1, weight + 0.08)})`,
                      }}
                    />
                  ))}
                  <span>More response weight</span>
                </div>

                <div className="mt-4 flex items-center justify-between gap-4 text-[14px] text-zinc-400">
                  <span>
                    {activityRange === 'daily'
                      ? 'Today'
                      : activityRange === 'weekly'
                        ? 'Last 7 days'
                        : 'Last 12 months'}
                  </span>

                  <span className="text-right">
                    {formatNumber(
                      activitySummary.messages
                    )}{' '}
                    messages ·{' '}
                    {formatNumber(
                      activitySummary.tokens
                    )}{' '}
                    tokens
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ACTIVITY INSIGHTS */}
          <section className="mx-auto mt-10 w-full max-w-[1000px]">
            <h2 className="text-[16px] font-semibold">
              Activity insights
            </h2>

            <div className="mt-5 w-full overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[620px] border-collapse text-sm">
                <thead className="bg-zinc-50 text-left text-xs uppercase tracking-[0.12em] text-zinc-400 dark:bg-zinc-900/60">
                  <tr>
                    <th className="w-2/3 px-5 py-3 font-semibold">
                      Metric
                    </th>
                    <th className="w-1/3 px-5 py-3 text-right font-semibold">
                      Value
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {[
                    [
                      'Total chats',
                      formatNumber(
                        Number(stats.totalChats || 0)
                      ),
                    ],
                    [
                      'Total messages',
                      formatNumber(
                        Number(stats.messageCount || 0)
                      ),
                    ],
                    [
                      'User messages',
                      formatNumber(
                        Number(stats.userMessages || 0)
                      ),
                    ],
                    [
                      'AI messages',
                      formatNumber(
                        Number(
                          stats.assistantMessages || 0
                        )
                      ),
                    ],
                    [
                      'Active days',
                      formatNumber(
                        Number(stats.activeDays || 0)
                      ),
                    ],
                    [
                      'Average messages per chat',
                      Number(stats.totalChats || 0)
                        ? (
                            Number(
                              stats.messageCount || 0
                            ) /
                            Number(
                              stats.totalChats || 1
                            )
                          ).toFixed(1)
                        : '0',
                    ],
                    [
                      'Peak daily tokens',
                      formatNumber(
                        Number(stats.peakTokens || 0)
                      ),
                    ],
                  ].map(([label, value]) => (
                    <tr
                      key={label}
                      className="bg-white dark:bg-zinc-950"
                    >
                      <td className="px-5 py-3 text-zinc-500">
                        {label}
                      </td>

                      <td className="px-5 py-3 text-right font-semibold text-zinc-900 dark:text-zinc-100">
                        {value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* FOOTER */}
          <div className="mt-12 flex items-center justify-center gap-2 text-center text-xs text-zinc-400">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>
              Live account data · Updated automatically every 30 seconds.
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}
