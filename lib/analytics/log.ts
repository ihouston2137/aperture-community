import { appendFile, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

import { DAY_KEY_PATTERN } from "./time";

/**
 * The raw hit log: one JSON object per line, one file per day.
 *
 * A file per day is the rotation. It is also what makes reprocessing cheap and
 * exact — "rebuild the 12th" opens one file and needs no filtering, and a day
 * whose file is gone is simply a day with no traffic. The file is named for the
 * date in the configured zone, so the boundary between two files is the same
 * boundary the reports use.
 *
 * Append-only, never rewritten. The summaries in Mongo are derived data and can
 * be rebuilt from these at any time; these are the record.
 */

export const LOG_DIR =
  process.env.ANALYTICS_LOG_DIR || path.join(process.cwd(), "logs", "analytics");

const FILE_PREFIX = "analytics-";
const FILE_SUFFIX = ".log";

/**
 * What a hit is.
 *
 * A page view is someone arriving somewhere. An image view is someone opening a
 * collection picture full screen, which happens without changing the address —
 * so it would be invisible if page views were the only thing counted. A download
 * is them taking a copy away. They are reported apart because they answer
 * different questions, and adding them together would answer none of them.
 */
export const HIT_KINDS = ["page", "image", "download"] as const;
export type HitKind = (typeof HIT_KINDS)[number];

/** One hit. Keys are short because this is written once per event. */
export type HitRecord = {
  /** ISO timestamp of the hit, in UTC. */
  t: string;
  /** Visitor id. */
  v: string;
  /** Visit id. */
  s: string;
  /** Path, without the query. */
  p: string;
  /** Full referring URL, as the browser reported it. */
  r: string;
  /** Source name, e.g. `facebook`. */
  src: string;
  /** Medium, e.g. `social`. */
  med: string;
  /** Campaign, from `utm_campaign`. */
  cmp: string;
  /** Client address. */
  ip: string;
  /** User agent, truncated. */
  ua: string;
  /** Absent on records written before kinds existed; those are page views. */
  k?: HitKind;
  /**
   * What an image or download event is reported as: `Collection - Image`.
   * Built on the server from stored records, never from the client, so a
   * forged request cannot write an arbitrary row into a report.
   */
  lbl?: string;
  /**
   * The signed-in user, when the visitor had an admin session. This is what
   * ties an anonymous id to a person, and what the "exclude logged in" filter
   * acts on.
   */
  u?: string;
  /**
   * Set when no signed cookie came back and the ids were derived from the
   * address and user agent instead. Kept so a report can say how much of a
   * period was counted that way, since those visitors merge more readily.
   */
  f?: 1;
};

export function logFilePath(day: string): string {
  return path.join(LOG_DIR, `${FILE_PREFIX}${day}${FILE_SUFFIX}`);
}

/**
 * Appends one hit.
 *
 * `appendFile` on a single line is atomic enough for this: writes below the
 * pipe buffer are not interleaved by the OS, so concurrent hits cannot produce
 * a torn line. A line that somehow does tear is dropped by the reader rather
 * than failing the run.
 */
export async function writeHit(day: string, hit: HitRecord): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(logFilePath(day), `${JSON.stringify(hit)}\n`, "utf8");
}

/** Every day that has a log file, oldest first. */
export async function loggedDays(): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(LOG_DIR);
  } catch {
    // No directory yet simply means nothing has been logged.
    return [];
  }

  return entries
    .filter((name) => name.startsWith(FILE_PREFIX) && name.endsWith(FILE_SUFFIX))
    .map((name) => name.slice(FILE_PREFIX.length, -FILE_SUFFIX.length))
    .filter((day) => DAY_KEY_PATTERN.test(day))
    .sort();
}

/**
 * Every hit logged on one day.
 *
 * A malformed line is skipped, not thrown: a single bad row must not stop a
 * day's summary from being built, and the log is append-only so there is no
 * repairing it in place anyway.
 */
export async function readHits(day: string): Promise<HitRecord[]> {
  let contents: string;
  try {
    contents = await readFile(logFilePath(day), "utf8");
  } catch {
    return [];
  }

  const hits: HitRecord[] = [];
  for (const line of contents.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as HitRecord;
      if (parsed && typeof parsed.v === "string" && typeof parsed.p === "string") {
        hits.push(parsed);
      }
    } catch {
      continue;
    }
  }

  return hits;
}

/** Drops log files older than the retention window. 0 keeps them forever. */
export async function pruneLogs(retentionDays: number, before: string): Promise<number> {
  if (!retentionDays || retentionDays <= 0) return 0;

  let removed = 0;
  for (const day of await loggedDays()) {
    if (daysBetween(day, before) <= retentionDays) continue;
    try {
      await unlink(logFilePath(day));
      removed += 1;
    } catch {
      continue;
    }
  }

  return removed;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const start = Date.UTC(fy, fm - 1, fd);
  const end = Date.UTC(ty, tm - 1, td);
  return Math.round((end - start) / 86_400_000);
}
