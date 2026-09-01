import { connectDB } from "@/lib/db";
import { AnalyticsSettings } from "@/lib/models";

import { DEFAULT_ANALYTICS_TIMEZONE, safeTimezone } from "./time";

export type AnalyticsSettingsValues = {
  enabled: boolean;
  timezone: string;
  retentionDays: number;
  intervalMinutes: number;
  /** Which set of figures the reports open with; both are always stored. */
  excludeLoggedInByDefault: boolean;
  /**
   * Whether each bucket keeps a tally per signed-in account.
   *
   * Off by default, and deliberately: everything else here counts people, and
   * this names them. That is a different undertaking about a member's browsing
   * than the rest of the section makes, and it should be a decision somebody
   * took rather than something they discover is already running.
   *
   * Only affects what is written from here on. Turning it on names nobody
   * retroactively unless the logs are rebuilt — the raw hits have always
   * carried the account id, so a rebuild does fill in the past.
   */
  recordSignedInNames: boolean;
};

export const defaultAnalyticsSettings: AnalyticsSettingsValues = {
  enabled: true,
  timezone: DEFAULT_ANALYTICS_TIMEZONE,
  retentionDays: 400,
  intervalMinutes: 15,
  excludeLoggedInByDefault: false,
  recordSignedInNames: false,
};

/**
 * Read on every hit, so it is cached for a few seconds.
 *
 * The alternative is a database round trip per page view for a value that
 * changes once a year. A stale window this short only ever means a handful of
 * hits land in the previous zone's day, and the next processing run rebuilds
 * them from the logs anyway.
 */
type Cache = { value: AnalyticsSettingsValues; expires: number };

const globalCache = globalThis as typeof globalThis & {
  _apertureAnalyticsSettings?: Cache;
};

const CACHE_MS = 10_000;

export function clearAnalyticsSettingsCache() {
  globalCache._apertureAnalyticsSettings = undefined;
}

export async function getAnalyticsSettings(): Promise<AnalyticsSettingsValues> {
  const cached = globalCache._apertureAnalyticsSettings;
  if (cached && cached.expires > Date.now()) return cached.value;

  let value = { ...defaultAnalyticsSettings };
  try {
    await connectDB();
    const doc = await AnalyticsSettings.findOne().lean<any>();
    if (doc) {
      value = {
        enabled: doc.enabled !== false,
        timezone: safeTimezone(doc.timezone),
        retentionDays: Number.isFinite(doc.retentionDays)
          ? Math.max(0, Math.trunc(doc.retentionDays))
          : defaultAnalyticsSettings.retentionDays,
        intervalMinutes: Number.isFinite(doc.intervalMinutes)
          ? Math.min(1440, Math.max(1, Math.trunc(doc.intervalMinutes)))
          : defaultAnalyticsSettings.intervalMinutes,
        excludeLoggedInByDefault: Boolean(doc.excludeLoggedInByDefault),
        recordSignedInNames: Boolean(doc.recordSignedInNames),
      };
    }
  } catch {
    // Unreachable database must not take the site down over a page view; the
    // defaults are serviceable and the next read tries again.
    return value;
  }

  globalCache._apertureAnalyticsSettings = { value, expires: Date.now() + CACHE_MS };
  return value;
}

export async function saveAnalyticsSettings(
  values: AnalyticsSettingsValues
): Promise<void> {
  await connectDB();
  await AnalyticsSettings.findOneAndUpdate(
    {},
    {
      enabled: values.enabled,
      timezone: safeTimezone(values.timezone),
      retentionDays: Math.max(0, Math.trunc(values.retentionDays) || 0),
      intervalMinutes: Math.min(1440, Math.max(1, Math.trunc(values.intervalMinutes) || 15)),
      excludeLoggedInByDefault: Boolean(values.excludeLoggedInByDefault),
      recordSignedInNames: Boolean(values.recordSignedInNames),
    },
    { upsert: true, returnDocument: "after" }
  );
  clearAnalyticsSettingsCache();
}
