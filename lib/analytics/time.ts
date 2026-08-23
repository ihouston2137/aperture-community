/**
 * Every analytics bucket is a wall-clock bucket in one configured zone.
 *
 * "Yesterday" is a question about a place, not about UTC: a visit at 9pm Eastern
 * on the 3rd is UTC the 4th, and filing it under the 4th would put the evening's
 * traffic on the wrong day in every report an editor reads. So the day, hour,
 * month and year a hit belongs to are all derived in the configured zone, and
 * the log file it lands in is named for that zone's date too.
 *
 * `Intl` does the conversion. It knows the daylight-saving history of every
 * zone, which is the part hand-rolled offset arithmetic always gets wrong.
 */

export const DEFAULT_ANALYTICS_TIMEZONE = "America/New_York";

/**
 * Zones offered in the admin. Any IANA name works — this is the shortlist the
 * picker shows, not a limit on what can be stored.
 */
export const ANALYTICS_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (America/New_York)" },
  { value: "America/Chicago", label: "Central Time (America/Chicago)" },
  { value: "America/Denver", label: "Mountain Time (America/Denver)" },
  { value: "America/Phoenix", label: "Arizona (America/Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (America/Los_Angeles)" },
  { value: "America/Anchorage", label: "Alaska (America/Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Pacific/Honolulu)" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London (Europe/London)" },
  { value: "Europe/Paris", label: "Central Europe (Europe/Paris)" },
  { value: "Australia/Sydney", label: "Sydney (Australia/Sydney)" },
] as const;

/** A zone the runtime cannot resolve would throw on every hit. */
export function isValidTimezone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function safeTimezone(zone: string | undefined | null): string {
  return zone && isValidTimezone(zone) ? zone : DEFAULT_ANALYTICS_TIMEZONE;
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

/** Formatters are expensive to build and are reused across every hit. */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    // `h23` rather than `hour12: false`: some ICU builds render midnight as
    // "24" under the latter, which would produce an hour bucket that cannot
    // exist and sort after every real one.
    hourCycle: "h23",
  });

  formatterCache.set(timeZone, formatter);
  return formatter;
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const read = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
  };
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

/* ------------------------------------------------------------------- Keys */

/**
 * Bucket keys sort lexicographically in chronological order, which is what lets
 * a range query be a plain string comparison rather than a date computation.
 */
export function yearKey(parts: ZonedParts): string {
  return String(parts.year);
}

export function monthKey(parts: ZonedParts): string {
  return `${parts.year}-${pad(parts.month)}`;
}

export function dayKey(parts: ZonedParts): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function hourKey(parts: ZonedParts): string {
  return `${dayKey(parts)}T${pad(parts.hour)}`;
}

export function dayKeyOf(date: Date, timeZone: string): string {
  return dayKey(zonedParts(date, timeZone));
}

export const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The day before a `YYYY-MM-DD` key, by calendar arithmetic on the parts. */
export function previousDayKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  // Built as UTC purely as a calendar: no zone conversion happens here, the
  // parts go in and come back out shifted by one day.
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(
    date.getUTCDate()
  )}`;
}

/**
 * The instant a bucket starts, as a real `Date`.
 *
 * Stored alongside each summary so charts can sort and label by time without
 * every reader having to parse the key. Found by search rather than by offset
 * arithmetic: the offset at a given wall-clock time is what we are trying to
 * discover, so assuming one would be circular.
 */
export function bucketStart(key: string, timeZone: string): Date {
  const [datePart, hourPart] = key.split("T");
  const [year, month = 1, day = 1] = datePart.split("-").map(Number);
  const hour = hourPart ? Number(hourPart) : 0;

  // The same wall clock read as UTC, then corrected by the zone's actual offset
  // at that moment. One correction is enough everywhere except within the hour
  // a DST transition lands in, so it is applied twice.
  let guess = Date.UTC(year, month - 1, day, hour);
  for (let pass = 0; pass < 2; pass += 1) {
    const seen = zonedParts(new Date(guess), timeZone);
    const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour);
    const drift = seenAsUtc - Date.UTC(year, month - 1, day, hour);
    if (drift === 0) break;
    guess -= drift;
  }

  return new Date(guess);
}

/** Every day key from `from` to `to`, inclusive. Bounded so a bad pair cannot spin. */
export function dayKeyRange(from: string, to: string, limit = 400): string[] {
  const keys: string[] = [];
  let cursor = to;
  while (cursor >= from && keys.length < limit) {
    keys.push(cursor);
    cursor = previousDayKey(cursor);
  }
  return keys.reverse();
}
