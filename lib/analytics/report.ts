import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { AnalyticsDayIds, AnalyticsState, AnalyticsSummary, User } from "@/lib/models";

import { getAnalyticsSettings } from "./settings";
import { dayKeyOf, dayKeyRange, zonedParts } from "./time";

/**
 * Reads for the admin screens.
 *
 * Every series is filled: a bucket with no traffic comes back as a zero rather
 * than a gap, so a chart shows a quiet Tuesday as a quiet Tuesday instead of
 * drawing a straight line across it.
 */

export type AnalyticsPeriod = "hour" | "day" | "month" | "year";

export type SummaryPoint = {
  key: string;
  label: string;
  visitors: number;
  visits: number;
  pageViews: number;
  imageViews: number;
  downloads: number;
};

/** Every hit in the window, and how many leaned on the address fallback. */
export type IdentityQuality = { hits: number; fallbackHits: number };

export type SourceRow = {
  source: string;
  medium: string;
  visits: number;
  pageViews: number;
};

export type PageRow = { path: string; pageViews: number };

/**
 * One signed-in account's activity in the window.
 *
 * The name is resolved when the report is read, never stored in the buckets:
 * a name belongs to the account and is the account's to change, and a copy
 * taken at processing time would have the reports quoting whatever somebody
 * was called that month.
 */
export type PersonRow = {
  userId: string;
  name: string;
  visits: number;
  pageViews: number;
  imageViews: number;
  downloads: number;
};
/** A collection picture, by `Collection Name - Image Title`. */
export type LabelRow = { label: string; count: number };

export type AnalyticsOverview = {
  timezone: string;
  enabled: boolean;
  period: AnalyticsPeriod;
  points: SummaryPoint[];
  totals: {
    visitors: number;
    visits: number;
    pageViews: number;
    imageViews: number;
    downloads: number;
  };
  /**
   * False when the visitor total is a sum of buckets rather than a distinct
   * count — someone present in two buckets is then counted twice.
   */
  visitorsExact: boolean;
  sources: SourceRow[];
  pages: PageRow[];
  images: LabelRow[];
  files: LabelRow[];
  /** Whether signed-in traffic is being left out of every figure above. */
  excludeLoggedIn: boolean;
  /** Distinct signed-in visitors in the window — reported even when excluded. */
  loggedInVisitors: number;
  /**
   * Who those visitors were, when the site is set to record names.
   *
   * Empty for a window that predates the setting being turned on, which is not
   * the same as nobody having visited — `namesRecorded` tells the two apart.
   */
  people: PersonRow[];
  namesRecorded: boolean;
  identity: IdentityQuality;
  state: {
    lastRunAt: Date | null;
    lastFinalizedDay: string;
    lastError: string;
  };
};

const pad = (value: number) => String(value).padStart(2, "0");

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function labelFor(period: AnalyticsPeriod, key: string): string {
  if (period === "hour") {
    // Carries the date too: a 48-hour window holds each clock hour twice, and
    // a bare "14:00" would name both of them.
    const month = Number(key.slice(5, 7));
    return `${MONTH_LABELS[month - 1] ?? month} ${Number(key.slice(8, 10))} ${key.slice(11, 13)}:00`;
  }
  if (period === "day") {
    const month = Number(key.slice(5, 7));
    return `${MONTH_LABELS[month - 1] ?? month} ${Number(key.slice(8, 10))}`;
  }
  if (period === "month") {
    const month = Number(key.slice(5, 7));
    return `${MONTH_LABELS[month - 1] ?? month} ${key.slice(0, 4)}`;
  }
  return key;
}

/**
 * The keys a period covers, ending at now.
 *
 * Generated rather than queried so the series has a fixed shape whatever the
 * database holds — which is what keeps a chart's x-axis stable between a day
 * with traffic and one without.
 */
function keysFor(
  period: AnalyticsPeriod,
  count: number,
  timezone: string,
  /**
   * A `YYYY-MM-DD` key to fill with its own hours, instead of walking back
   * from now. What "today" and "yesterday" mean: a calendar day rather than a
   * rolling window, which is the difference between "since midnight" and "the
   * last 24 hours" and the reason they were asked for separately.
   */
  day?: string
): string[] {
  const now = new Date();

  if (period === "hour" && day) {
    // Today stops at the hour in progress; a day already over shows all of it.
    // An axis running out to 11pm at nine in the morning is fourteen hours of
    // nothing, said as though something ought to have happened.
    const last =
      day === dayKeyOf(now, timezone) ? zonedParts(now, timezone).hour : 23;
    return Array.from(
      { length: last + 1 },
      (_, hour) => `${day}T${pad(hour)}`
    );
  }

  if (period === "hour") {
    // Walked back through real instants, so a daylight-saving change shortens
    // or lengthens the window exactly as the clock did.
    return Array.from({ length: count }, (_, index) => {
      const at = new Date(now.getTime() - (count - 1 - index) * 3_600_000);
      const parts = zonedParts(at, timezone);
      return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}`;
    });
  }

  if (period === "day") {
    return dayKeyRange("0000-00-00", dayKeyOf(now, timezone), count);
  }

  const parts = zonedParts(now, timezone);

  if (period === "month") {
    const keys: string[] = [];
    let { year, month } = parts;
    for (let index = 0; index < count; index += 1) {
      keys.push(`${year}-${pad(month)}`);
      month -= 1;
      if (month === 0) {
        month = 12;
        year -= 1;
      }
    }
    return keys.reverse();
  }

  return Array.from({ length: count }, (_, index) =>
    String(parts.year - (count - 1 - index))
  );
}

/** The day keys a window of buckets spans, for the exact visitor union. */
function daysCovered(period: AnalyticsPeriod, keys: string[]): string[] {
  if (keys.length === 0) return [];
  if (period === "day") return keys;
  if (period === "hour") return [...new Set(keys.map((key) => key.slice(0, 10)))];
  // A month or a year prefixes its days, so the union is taken by prefix.
  return keys;
}

/**
 * Distinct visitors across a window.
 *
 * The one figure that cannot be added up: someone who came on Monday and again
 * on Thursday is one visitor. So the day id sets the processor stored are
 * unioned here, which is exact for any window built out of whole days.
 */
async function distinctVisitors(
  period: AnalyticsPeriod,
  keys: string[]
): Promise<{ all: number; anon: number; loggedIn: number } | null> {
  const covered = daysCovered(period, keys);
  if (covered.length === 0) return null;

  const query =
    period === "day" || period === "hour"
      ? { day: { $in: covered } }
      : // `2026-08` and `2026` both prefix their day keys.
        { $or: covered.map((key) => ({ day: { $gte: `${key}-`, $lt: `${key}-￿` } })) };

  const docs = await AnalyticsDayIds.find(query, {
    visitorIds: 1,
    loggedInVisitorIds: 1,
  }).lean<any[]>();

  const visitors = new Set<string>();
  const loggedIn = new Set<string>();
  for (const doc of docs) {
    for (const id of doc.visitorIds ?? []) visitors.add(id);
    for (const id of doc.loggedInVisitorIds ?? []) loggedIn.add(id);
  }

  return {
    all: visitors.size,
    // Signed in on any day of the window, filtered out of all of it.
    anon: [...visitors].filter((id) => !loggedIn.has(id)).length,
    loggedIn: loggedIn.size,
  };
}

/**
 * The figures a summary reports under the current filter.
 *
 * Summaries written before the filter existed have no `anon` block; those fall
 * back to their unfiltered figures rather than reading as zero, so old history
 * stays visible instead of vanishing when the toggle is turned on.
 */
function view(row: any, excludeLoggedIn: boolean) {
  if (!row) return null;
  return excludeLoggedIn && row.anon ? row.anon : row;
}

export async function getAnalyticsOverview(
  period: AnalyticsPeriod = "day",
  count = 30,
  options: { excludeLoggedIn?: boolean; day?: string } = {}
): Promise<AnalyticsOverview> {
  const settings = await getAnalyticsSettings();
  const excludeLoggedIn =
    options.excludeLoggedIn ?? settings.excludeLoggedInByDefault;
  const keys = keysFor(period, count, settings.timezone, options.day);

  /*
   * An hourly window over one whole calendar day counts each visitor once.
   *
   * The usual caveat on hourly windows is that they are a slice of a day, so
   * the day's id sets cover more ground than the window asks about and the
   * bucket sum is the honest answer. A day-anchored window has no such
   * mismatch: it *is* the day, up to the hour in progress, and the ids stored
   * against that day are exactly the people in it.
   */
  const wholeDay = Boolean(options.day);

  const empty: AnalyticsOverview = {
    timezone: settings.timezone,
    enabled: settings.enabled,
    period,
    points: keys.map((key) => ({
      key,
      label: labelFor(period, key),
      visitors: 0,
      visits: 0,
      pageViews: 0,
      imageViews: 0,
      downloads: 0,
    })),
    totals: { visitors: 0, visits: 0, pageViews: 0, imageViews: 0, downloads: 0 },
    visitorsExact: true,
    sources: [],
    pages: [],
    images: [],
    files: [],
    excludeLoggedIn,
    loggedInVisitors: 0,
    people: [],
    namesRecorded: settings.recordSignedInNames,
    identity: { hits: 0, fallbackHits: 0 },
    state: { lastRunAt: null, lastFinalizedDay: "", lastError: "" },
  };

  try {
    await connectDB();

    const [rows, state] = await Promise.all([
      AnalyticsSummary.find({ period, key: { $in: keys } }).lean<any[]>(),
      AnalyticsState.findOne().lean<any>(),
    ]);

    const byKey = new Map(rows.map((row) => [row.key as string, row]));
    const views = rows.map((row) => view(row, excludeLoggedIn));

    const points: SummaryPoint[] = keys.map((key) => {
      const shown = view(byKey.get(key), excludeLoggedIn);
      return {
        key,
        label: labelFor(period, key),
        visitors: shown?.visitors ?? 0,
        visits: shown?.visits ?? 0,
        pageViews: shown?.pageViews ?? 0,
        imageViews: shown?.imageViews ?? 0,
        downloads: shown?.downloads ?? 0,
      };
    });

    const sumOf = (field: keyof SummaryPoint) =>
      points.reduce((total, point) => total + (point[field] as number), 0);

    const exact = period !== "hour" || wholeDay;
    const unioned = exact ? await distinctVisitors(period, keys) : null;

    return {
      ...empty,
      points,
      totals: {
        visitors:
          (excludeLoggedIn ? unioned?.anon : unioned?.all) ?? sumOf("visitors"),
        visits: sumOf("visits"),
        pageViews: sumOf("pageViews"),
        imageViews: sumOf("imageViews"),
        downloads: sumOf("downloads"),
      },
      visitorsExact: exact && unioned !== null,
      loggedInVisitors:
        unioned?.loggedIn ??
        rows.reduce((total, row) => total + (row.loggedInVisitors ?? 0), 0),
      identity: {
        hits: sumOf("pageViews") + sumOf("imageViews") + sumOf("downloads"),
        fallbackHits: views.reduce(
          (total, row) => total + (row?.fallbackHits ?? 0),
          0
        ),
      },
      people: await namePeople(rows),
      sources: mergeSources(views),
      pages: mergeRanked(views, "pages", "path", "pageViews") as PageRow[],
      images: mergeRanked(views, "images", "label", "count") as LabelRow[],
      files: mergeRanked(views, "files", "label", "count") as LabelRow[],
      state: {
        lastRunAt: state?.lastRunAt ?? null,
        lastFinalizedDay: state?.lastFinalizedDay ?? "",
        lastError: state?.lastError ?? "",
      },
    };
  } catch {
    // An unreachable database shows an empty report rather than an error page.
    return empty;
  }
}

/**
 * The accounts seen across the window, with their names.
 *
 * Read from the unfiltered rows, never the anonymous ones: the `anon` block is
 * what is left once every signed-in visitor is taken out, so asking it who was
 * signed in would always answer nobody. That means this list stands whichever
 * way the visitor filter is set — which is right, since it answers a
 * different question from the figures the filter scopes.
 *
 * An account since deleted keeps its row rather than disappearing: it is a
 * record of a visit that happened, and dropping it would quietly change the
 * past. It is simply named as gone.
 */
async function namePeople(rows: any[]): Promise<PersonRow[]> {
  const merged = new Map<string, PersonRow>();
  for (const row of rows) {
    for (const person of row?.people ?? []) {
      if (!person?.userId) continue;
      const entry = merged.get(person.userId) ?? {
        userId: String(person.userId),
        name: "",
        visits: 0,
        pageViews: 0,
        imageViews: 0,
        downloads: 0,
      };
      entry.visits += person.visits ?? 0;
      entry.pageViews += person.pageViews ?? 0;
      entry.imageViews += person.imageViews ?? 0;
      entry.downloads += person.downloads ?? 0;
      merged.set(entry.userId, entry);
    }
  }

  if (merged.size === 0) return [];

  const users = await User.find({ _id: { $in: [...merged.keys()] } })
    .select("firstName lastName name email")
    .lean<any[]>();
  const names = new Map(users.map((user) => [String(user._id), fullName(user)]));

  return [...merged.values()]
    .map((person) => ({
      ...person,
      name: names.get(person.userId) || "Account since removed",
    }))
    .sort((a, b) => b.pageViews - a.pageViews || a.name.localeCompare(b.name));
}

function mergeSources(rows: any[]): SourceRow[] {
  const merged = new Map<string, SourceRow>();
  for (const row of rows) {
    for (const source of row?.sources ?? []) {
      const key = `${source.medium}|${source.source}`;
      const entry = merged.get(key) ?? {
        source: source.source,
        medium: source.medium,
        visits: 0,
        pageViews: 0,
      };
      entry.visits += source.visits ?? 0;
      entry.pageViews += source.pageViews ?? 0;
      merged.set(key, entry);
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.visits - a.visits || b.pageViews - a.pageViews)
    .slice(0, 12);
}

/** One ranked breakdown, merged across the buckets in the window. */
function mergeRanked(
  rows: any[],
  field: string,
  labelKey: string,
  countKey: string
): Record<string, string | number>[] {
  const merged = new Map<string, number>();
  for (const row of rows) {
    for (const entry of row?.[field] ?? []) {
      const label = entry[labelKey];
      if (!label) continue;
      merged.set(label, (merged.get(label) ?? 0) + (entry[countKey] ?? 0));
    }
  }
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, count]) => ({ [labelKey]: label, [countKey]: count }));
}
