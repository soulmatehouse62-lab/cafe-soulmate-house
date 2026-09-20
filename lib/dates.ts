// Pure date helpers. The cafe operates in India, so every "day" boundary,
// report period and displayed time uses Asia/Kolkata (UTC+05:30, no DST).

export const CAFE_TZ = "Asia/Kolkata";
const IST_OFFSET = "+05:30";
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const keyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAFE_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAFE_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: CAFE_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortDayFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});

/** YYYY-MM-DD of the given instant, in cafe time. */
export function toDateKey(d: Date): string {
  return keyFormatter.format(d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_KEY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The instant a cafe day starts. */
export function startOfDay(key: string): Date {
  return new Date(`${key}T00:00:00.000${IST_OFFSET}`);
}

export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of day keys from `from` to `to`. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function formatDateTime(d: Date | string): string {
  return dateTimeFormatter.format(new Date(d));
}

export function formatDate(d: Date | string): string {
  return dateFormatter.format(new Date(d));
}

/** "19 Sep" from a YYYY-MM-DD key. */
export function formatDayKey(key: string): string {
  return shortDayFormatter.format(new Date(`${key}T00:00:00Z`));
}

export function formatAge(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export type PeriodKey = "today" | "week" | "month" | "custom";

export interface ResolvedPeriod {
  period: PeriodKey;
  fromKey: string;
  toKey: string;
  /** inclusive start instant */
  start: Date;
  /** exclusive end instant */
  end: Date;
  label: string;
}

const MAX_CUSTOM_DAYS = 366;

export function resolvePeriod(period: string | undefined, from?: string, to?: string): ResolvedPeriod {
  const today = todayKey();
  let p: PeriodKey = period === "week" || period === "month" || period === "custom" ? period : "today";
  let fromKey = today;
  let toKey = today;
  let label = "Today";

  if (p === "week") {
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    fromKey = addDays(today, -((weekday + 6) % 7)); // week starts Monday
    label = "This week";
  } else if (p === "month") {
    fromKey = `${today.slice(0, 8)}01`;
    label = "This month";
  } else if (p === "custom") {
    if (isDateKey(from) && isDateKey(to)) {
      fromKey = from <= to ? from : to;
      toKey = from <= to ? to : from;
      if (eachDay(fromKey, toKey).length > MAX_CUSTOM_DAYS) fromKey = addDays(toKey, -(MAX_CUSTOM_DAYS - 1));
      label = `${formatDayKey(fromKey)} – ${formatDayKey(toKey)}`;
    } else {
      p = "today";
    }
  }

  return { period: p, fromKey, toKey, start: startOfDay(fromKey), end: startOfDay(addDays(toKey, 1)), label };
}
