import { connectDB } from "@/lib/db";
import {
  AnalyticsDayIds,
  AnalyticsState,
  AnalyticsSummary,
} from "@/lib/models";

import { loggedDays, pruneLogs, readHits, type HitRecord } from "./log";
import { getAnalyticsSettings } from "./settings";
import { bucketStart, dayKeyOf, hourKey, zonedParts } from "./time";

/**
 * Turns raw hit logs into the summaries the admin reads.
 *
 * The whole design rests on one rule: **a day is rebuilt from its log file, not
 * accumulated.** Every run throws away today's summaries and recomputes them
 * from scratch. That makes the job idempotent — running it twice, or ten times,
 * or after a crash halfway through, lands on the same numbers — which is what
 * lets it run on a timer without any coordination.
 *
 * A day that has ended gets exactly one more pass and is then marked finalized,
 * so a month of history is not re-read every quarter hour.
 *
 * Rolling up is the one place where sums are wrong. Page views add: a month's
 * views are its days' views. Visitors do not — someone who came on Monday and
 * Thursday is one visitor, not two — so months and years union the day id sets
 * instead of adding the day counts.
 */

/** Beyond this a day's id set is sampled rather than stored whole. */
const MAX_STORED_IDS = 200_000;
/**
 * How long after midnight a finished day is left alone before its final pass.
 *
 * A hit is filed under the visitor's local date at the moment it is written, so
 * a request in flight across midnight still lands in yesterday's file. Waiting
 * a few minutes means the last pass sees it.
 */
const FINALIZE_GRACE_MS = 10 * 60 * 1000;

/** A Mongo range that matches every key beginning with `prefix`. */
function prefixRange(prefix: string) {
  return { $gte: prefix, $lt: `${prefix}￿` };
}
/** Kept per bucket, ordered by page views. */
const TOP_PAGES = 25;
const TOP_SOURCES = 25;

export type ProcessResult = {
  ok: boolean;
  ranMs: number;
  today: string;
  /** Days that had ended and got their final pass on this run. */
  finalized: string[];
  /** Every day rebuilt, finalized or not. */
  processed: string[];
  hits: number;
  prunedLogs: number;
  error?: string;
};

type SourceEntry = {
  source: string;
  medium: string;
  visits: Set<string>;
  pageViews: number;
};

type Tally = {
  visitors: Set<string>;
  visits: Set<string>;
  pageViews: number;
  imageViews: number;
  downloads: number;
  /** Hits whose ids were derived from the address rather than a cookie. */
  fallbackHits: number;
  pages: Map<string, number>;
  /** Keyed by `Collection Name - Image Title`. */
  images: Map<string, number>;
  files: Map<string, number>;
  sources: Map<string, SourceEntry>;
};

function newTally(): Tally {
  return {
    visitors: new Set(),
    visits: new Set(),
    pageViews: 0,
    imageViews: 0,
    downloads: 0,
    fallbackHits: 0,
    pages: new Map(),
    images: new Map(),
    files: new Map(),
    sources: new Map(),
  };
}

const bump = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1);

function record(tally: Tally, hit: HitRecord) {
  tally.visitors.add(hit.v);
  tally.visits.add(hit.s);
  if (hit.f) tally.fallbackHits += 1;

  // Records written before kinds existed are page views; that is all there was.
  const kind = hit.k ?? "page";

  if (kind === "image") {
    if (hit.lbl) bump(tally.images, hit.lbl);
    tally.imageViews += 1;
    // An image view is not a page view and is not attributed to a source: the
    // page view that opened the gallery already carried where it came from.
    return;
  }

  if (kind === "download") {
    if (hit.lbl) bump(tally.files, hit.lbl);
    tally.downloads += 1;
    return;
  }

  tally.pageViews += 1;
  bump(tally.pages, hit.p);

  const key = `${hit.med}|${hit.src}`;
  const entry = tally.sources.get(key) ?? {
    source: hit.src || "direct",
    medium: hit.med || "direct",
    visits: new Set<string>(),
    pageViews: 0,
  };
  entry.visits.add(hit.s);
  entry.pageViews += 1;
  tally.sources.set(key, entry);
}

function topOf(map: Map<string, number>, labelKey: string, countKey: string) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_PAGES)
    .map(([label, count]) => ({ [labelKey]: label, [countKey]: count }));
}

function topSources(tally: Tally) {
  return [...tally.sources.values()]
    .map((entry) => ({
      source: entry.source,
      medium: entry.medium,
      visits: entry.visits.size,
      pageViews: entry.pageViews,
    }))
    .sort((a, b) => b.visits - a.visits || b.pageViews - a.pageViews)
    .slice(0, TOP_SOURCES);
}

/** The shape both the unfiltered and the anonymous-only figures take. */
function figures(tally: Tally) {
  return {
    visitors: tally.visitors.size,
    visits: tally.visits.size,
    pageViews: tally.pageViews,
    imageViews: tally.imageViews,
    downloads: tally.downloads,
    fallbackHits: tally.fallbackHits,
    pages: topOf(tally.pages, "path", "pageViews"),
    images: topOf(tally.images, "label", "count"),
    files: topOf(tally.files, "label", "count"),
    sources: topSources(tally),
  };
}

async function writeSummary(
  period: string,
  key: string,
  tally: Tally,
  anonTally: Tally,
  loggedInVisitors: number,
  timezone: string,
  finalized: boolean
) {
  await AnalyticsSummary.findOneAndUpdate(
    { period, key },
    {
      period,
      key,
      startedAt: bucketStart(key, timezone),
      ...figures(tally),
      anon: figures(anonTally),
      loggedInVisitors,
      timezone,
      finalized,
    },
    { upsert: true, returnDocument: "after" }
  );
}

/**
 * Rebuilds one day: its 24 hour buckets, its own summary, and its id sets.
 *
 * Hour buckets that saw no traffic are deleted rather than written as zeroes,
 * so a chart can tell "nobody came" from "we have not processed that yet" by
 * the presence of the day summary alone.
 */
async function processDay(day: string, timezone: string, finalize: boolean) {
  const hits = await readHits(day);

  /*
   * Two passes, because who is signed in cannot be known from a hit alone.
   *
   * Someone signs in halfway through a visit: their earlier hits carry no user
   * id, but they are the same person and their whole day's traffic has to come
   * out together when the filter is on. So the first pass finds every anonymous
   * id that was ever signed in that day, and only then does the second pass
   * know which hits the anonymous-only figures must leave out.
   */
  const loggedInVisitors = new Set<string>();
  const loggedInVisits = new Set<string>();
  const identities = new Map<string, string>();

  for (const hit of hits) {
    if (!hit.u) continue;
    loggedInVisitors.add(hit.v);
    loggedInVisits.add(hit.s);
    identities.set(hit.v, hit.u);
  }

  const dayTally = newTally();
  const anonDayTally = newTally();
  const hourTallies = new Map<string, { all: Tally; anon: Tally }>();

  for (const hit of hits) {
    const at = new Date(hit.t);
    if (Number.isNaN(at.getTime())) continue;

    const anonymous = !loggedInVisitors.has(hit.v);

    record(dayTally, hit);
    if (anonymous) record(anonDayTally, hit);

    const key = hourKey(zonedParts(at, timezone));
    const hour = hourTallies.get(key) ?? { all: newTally(), anon: newTally() };
    record(hour.all, hit);
    if (anonymous) record(hour.anon, hit);
    hourTallies.set(key, hour);
  }

  // Cleared first, so an hour that lost all its traffic — a log rewritten, a
  // zone changed — does not survive as a stale bucket.
  await AnalyticsSummary.deleteMany({ period: "hour", key: prefixRange(`${day}T`) });

  for (const [key, hour] of hourTallies) {
    // Counted within the hour, not the day: an hour bucket reports who was
    // signed in during that hour.
    const signedIn = [...hour.all.visitors].filter((id) =>
      loggedInVisitors.has(id)
    ).length;
    await writeSummary("hour", key, hour.all, hour.anon, signedIn, timezone, finalize);
  }

  await writeSummary(
    "day",
    day,
    dayTally,
    anonDayTally,
    loggedInVisitors.size,
    timezone,
    finalize
  );

  const visitorIds = [...dayTally.visitors];
  const visitIds = [...dayTally.visits];
  const truncated = visitorIds.length > MAX_STORED_IDS;
  const cap = <T,>(list: T[]) => (truncated ? list.slice(0, MAX_STORED_IDS) : list);

  await AnalyticsDayIds.findOneAndUpdate(
    { day },
    {
      day,
      visitorIds: cap(visitorIds),
      visitIds: cap(visitIds),
      loggedInVisitorIds: cap([...loggedInVisitors]),
      loggedInVisitIds: cap([...loggedInVisits]),
      identities: [...identities.entries()]
        .slice(0, 1000)
        .map(([visitorId, userId]) => ({ visitorId, userId })),
      truncated,
    },
    { upsert: true, returnDocument: "after" }
  );

  return { hits: hits.length };
}

/**
 * Rebuilds a month or a year from the days under it.
 *
 * Distinct counts come from the id sets; page views and the page/source
 * breakdowns are summed from the day summaries, which is exact for all three.
 */
async function rollup(
  period: "month" | "year",
  key: string,
  timezone: string
): Promise<void> {
  // `2026-08` and `2026` both prefix their day keys once a dash is appended.
  const range = prefixRange(`${key}-`);

  const days = await AnalyticsSummary.find({
    period: "day",
    key: range,
  }).lean<any[]>();

  if (days.length === 0) {
    await AnalyticsSummary.deleteOne({ period, key });
    return;
  }

  const idDocs = await AnalyticsDayIds.find({ day: range }).lean<any[]>();

  const visitors = new Set<string>();
  const visits = new Set<string>();
  const loggedInVisitors = new Set<string>();
  const loggedInVisits = new Set<string>();

  for (const doc of idDocs) {
    for (const id of doc.visitorIds ?? []) visitors.add(id);
    for (const id of doc.visitIds ?? []) visits.add(id);
    for (const id of doc.loggedInVisitorIds ?? []) loggedInVisitors.add(id);
    for (const id of doc.loggedInVisitIds ?? []) loggedInVisits.add(id);
  }

  /*
   * Anyone signed in on any day of the window is filtered out of the whole
   * window, not just that day. Someone who was an anonymous reader on Monday
   * and an editor on Thursday is the same person, and leaving Monday in would
   * mean the filter did not do what it says.
   */
  const anonVisitors = [...visitors].filter((id) => !loggedInVisitors.has(id)).length;
  const anonVisits = [...visits].filter((id) => !loggedInVisits.has(id)).length;

  /** Adds up one additive figure across the days, from either block. */
  const sum = (field: string, anonymous: boolean) =>
    days.reduce(
      (total, day) => total + ((anonymous ? day.anon?.[field] : day[field]) ?? 0),
      0
    );

  /** Merges one of the ranked breakdowns across the days. */
  const merge = (
    field: string,
    labelKey: string,
    countKey: string,
    anonymous: boolean
  ) => {
    const merged = new Map<string, number>();
    for (const day of days) {
      const rows = (anonymous ? day.anon?.[field] : day[field]) ?? [];
      for (const row of rows) {
        const label = row[labelKey];
        if (!label) continue;
        merged.set(label, (merged.get(label) ?? 0) + (row[countKey] ?? 0));
      }
    }
    return [...merged.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_PAGES)
      .map(([label, count]) => ({ [labelKey]: label, [countKey]: count }));
  };

  const mergeSources = (anonymous: boolean) => {
    const merged = new Map<
      string,
      { source: string; medium: string; visits: number; pageViews: number }
    >();
    for (const day of days) {
      for (const source of (anonymous ? day.anon?.sources : day.sources) ?? []) {
        const id = `${source.medium}|${source.source}`;
        const entry = merged.get(id) ?? {
          source: source.source,
          medium: source.medium,
          visits: 0,
          pageViews: 0,
        };
        // Visits are day-scoped and a visit cannot span two days by more than
        // the half hour that ends it, so adding them is exact enough to rank by.
        entry.visits += source.visits ?? 0;
        entry.pageViews += source.pageViews ?? 0;
        merged.set(id, entry);
      }
    }
    return [...merged.values()]
      .sort((a, b) => b.visits - a.visits || b.pageViews - a.pageViews)
      .slice(0, TOP_SOURCES);
  };

  const block = (anonymous: boolean) => ({
    visitors: anonymous ? anonVisitors : visitors.size,
    visits: anonymous ? anonVisits : visits.size,
    pageViews: sum("pageViews", anonymous),
    imageViews: sum("imageViews", anonymous),
    downloads: sum("downloads", anonymous),
    fallbackHits: sum("fallbackHits", anonymous),
    pages: merge("pages", "path", "pageViews", anonymous),
    images: merge("images", "label", "count", anonymous),
    files: merge("files", "label", "count", anonymous),
    sources: mergeSources(anonymous),
  });

  await AnalyticsSummary.findOneAndUpdate(
    { period, key },
    {
      period,
      key,
      startedAt: bucketStart(key, timezone),
      ...block(false),
      anon: block(true),
      loggedInVisitors: loggedInVisitors.size,
      timezone,
      finalized: false,
    },
    { upsert: true, returnDocument: "after" }
  );
}

/**
 * One processing run.
 *
 * Which days get rebuilt:
 *
 * - **Today**, always. Its summary is a moving target until the day is over.
 * - **Every ended day past the finalization marker.** Normally that is just
 *   yesterday, on the first run after midnight. After an outage it is every day
 *   the server was down for, which is why the marker is a date rather than a
 *   flag: the catch-up is the same code path as the ordinary case.
 *
 * Days are taken from the log directory rather than from a date range, so a day
 * with no file is skipped instead of writing a row of zeroes for it.
 */
export async function processAnalytics(): Promise<ProcessResult> {
  const started = Date.now();
  const settings = await getAnalyticsSettings();
  const timezone = settings.timezone;
  const today = dayKeyOf(new Date(), timezone);

  const result: ProcessResult = {
    ok: true,
    ranMs: 0,
    today,
    finalized: [],
    processed: [],
    hits: 0,
    prunedLogs: 0,
  };

  try {
    await connectDB();

    const state = await AnalyticsState.findOne().lean<any>();
    const marker: string = state?.lastFinalizedDay ?? "";

    // A zone change invalidates every boundary, so the marker is dropped and
    // the whole log history is rebuilt under the new calendar.
    const zoneChanged = Boolean(state?.timezone) && state.timezone !== timezone;
    const effectiveMarker = zoneChanged ? "" : marker;

    const days = await loggedDays();

    // A day may be sealed once it has ended *and* cleared the grace window.
    const graceDay = dayKeyOf(new Date(Date.now() - FINALIZE_GRACE_MS), timezone);

    // Ended days that have never had their final pass. On a normal run this is
    // yesterday alone, or nothing at all once yesterday has been finalized.
    const pending = days.filter((day) => day < today && day > effectiveMarker);

    let nextMarker = effectiveMarker;
    for (const day of pending) {
      const seal = day < graceDay;
      const { hits } = await processDay(day, timezone, seal);
      result.hits += hits;
      result.processed.push(day);
      // Left unsealed inside the grace window, so the next run picks it up
      // again and reads whatever arrived just after midnight.
      if (seal) {
        result.finalized.push(day);
        nextMarker = day;
      }
    }

    if (days.includes(today)) {
      const { hits } = await processDay(today, timezone, false);
      result.hits += hits;
      result.processed.push(today);
    }

    // Months and years touched by anything rebuilt above. Read off the day key
    // itself — `2026-08-13` carries both.
    const buckets = new Set<string>();
    for (const day of result.processed) {
      buckets.add(`month:${day.slice(0, 7)}`);
      buckets.add(`year:${day.slice(0, 4)}`);
    }
    for (const bucket of buckets) {
      const [period, key] = bucket.split(":");
      await rollup(period as "month" | "year", key, timezone);
    }

    if (settings.retentionDays > 0) {
      result.prunedLogs = await pruneLogs(settings.retentionDays, today);
    }

    await AnalyticsState.findOneAndUpdate(
      {},
      {
        lastFinalizedDay: nextMarker,
        lastRunAt: new Date(),
        lastRunMs: Date.now() - started,
        lastError: "",
        timezone,
      },
      { upsert: true, returnDocument: "after" }
    );
  } catch (error) {
    result.ok = false;
    result.error = error instanceof Error ? error.message : String(error);
    try {
      await AnalyticsState.findOneAndUpdate(
        {},
        { lastRunAt: new Date(), lastError: result.error.slice(0, 500) },
        { upsert: true }
      );
    } catch {
      // The database is the thing that failed; there is nowhere to record it.
    }
  }

  result.ranMs = Date.now() - started;
  return result;
}

/**
 * Throws away every summary and rebuilds from the logs.
 *
 * The way back from a changed timezone or a bad deploy: the logs are the record,
 * so nothing is lost by discarding what was derived from them.
 */
export async function rebuildAllAnalytics(): Promise<ProcessResult> {
  await connectDB();
  await AnalyticsSummary.deleteMany({});
  await AnalyticsDayIds.deleteMany({});
  await AnalyticsState.findOneAndUpdate(
    {},
    { lastFinalizedDay: "", timezone: "" },
    { upsert: true }
  );
  return processAnalytics();
}
