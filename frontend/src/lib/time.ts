// The backend serialises LocalDateTime without a timezone ("2026-10-17T14:55:00").
// Browsers parse such strings as LOCAL time, which skews every "x minutes ago"
// label by the user's UTC offset. Server timestamps are UTC, so tag them as such.
const ZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

export const parseServerDate = (value: string | number | Date | undefined | null): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let text = String(value).trim();
  if (!text) return null;
  text = text.replace(' ', 'T');
  // Zone-less date-time strings are UTC. Date-only strings are left alone.
  if (/T\d{2}:\d{2}/.test(text) && !ZONE_SUFFIX.test(text)) text += 'Z';
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const serverTime = (value: string | number | Date | undefined | null): number =>
  parseServerDate(value)?.getTime() ?? 0;
