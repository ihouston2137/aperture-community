import Link from "next/link";

import { AdminHeader, Panel } from "@/components/admin-ui";
import { AnalyticsChart } from "@/components/admin/analytics-chart";
import { getAnalyticsOverview, type AnalyticsPeriod } from "@/lib/analytics/report";
import { getAnalyticsSettings } from "@/lib/analytics/settings";
import { ANALYTICS_TIMEZONES, dayKeyOf, previousDayKey } from "@/lib/analytics/time";
import { getAccessContext, requireAnyPermission } from "@/lib/access";

import { AnalyticsTools } from "./analytics-tools";
import { saveAnalyticsSettingsAction } from "./actions";

export const metadata = { title: "Analytics" };

/**
 * The ranges on offer.
 *
 * Keyed by `id` rather than by bucket, because two of them are built from the
 * same bucket — a week and a month are both runs of days, and keying on the
 * bucket alone would make them the same option.
 */
const PERIODS: {
  id: string;
  value: AnalyticsPeriod;
  label: string;
  count: number;
  /**
   * Anchored to a calendar day rather than counted back from now.
   *
   * `0` is today and `1` is yesterday. A rolling 24 hours and "since midnight"
   * are different questions — at nine in the morning the first is mostly
   * yesterday — and an editor asking how today is going means the second.
   */
  daysAgo?: number;
}[] = [
  { id: "today", value: "hour", label: "Today", count: 24, daysAgo: 0 },
  { id: "yesterday", value: "hour", label: "Yesterday", count: 24, daysAgo: 1 },
  { id: "48h", value: "hour", label: "Last 48 hours", count: 48 },
  { id: "7d", value: "day", label: "Last 7 days", count: 7 },
  { id: "30d", value: "day", label: "Last 30 days", count: 30 },
  { id: "12m", value: "month", label: "Last 12 months", count: 12 },
];

const DEFAULT_PERIOD = "30d";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel">
      <div className="viz-stat-label">{label}</div>
      <div className="viz-stat-value">{value.toLocaleString()}</div>
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; loggedIn?: string }>;
}) {
  await requireAnyPermission(["analytics.view", "analytics.manage"]);
  const { can } = await getAccessContext();

  const params = await searchParams;
  const selected =
    PERIODS.find((period) => period.id === params.period) ??
    PERIODS.find((period) => period.id === DEFAULT_PERIOD)!;

  const settings = await getAnalyticsSettings();
  // The link states the filter outright; without one the stored default holds.
  const excludeLoggedIn =
    params.loggedIn === undefined
      ? settings.excludeLoggedInByDefault
      : params.loggedIn === "exclude";

  /*
   * The calendar day a day-anchored range means, in the analytics zone.
   *
   * Worked out here rather than in the report so the two agree on which day
   * "today" is: the report already derives every key in this zone, and a
   * second opinion about the boundary is exactly how an evening's traffic ends
   * up on the wrong page.
   */
  const day =
    selected.daysAgo === undefined
      ? undefined
      : Array.from({ length: selected.daysAgo }).reduce<string>(
          (key) => previousDayKey(key),
          dayKeyOf(new Date(), settings.timezone)
        );

  const overview = await getAnalyticsOverview(selected.value, selected.count, {
    excludeLoggedIn,
    day,
  });

  const canManage = can("analytics.manage");
  const filterHref = (value: "include" | "exclude") =>
    `/admin/analytics?period=${selected.id}&loggedIn=${value}`;

  return (
    <>
      <AdminHeader
        title="Analytics"
        subtitle={`Anonymous visitor counts, summarised on ${settings.timezone} days.`}
      />

      {!settings.enabled ? (
        <div className="admin-notice is-error">
          Collection is turned off. Nothing new is being recorded.
        </div>
      ) : null}

      {/* One row, above everything it scopes, as a filter belongs. */}
      <div className="viz-filters">
        <div className="builder-tabs" style={{ maxWidth: "46rem", marginBottom: 0 }}>
          {PERIODS.map((period) => (
            <Link
              key={period.id}
              href={`/admin/analytics?period=${period.id}&loggedIn=${
                excludeLoggedIn ? "exclude" : "include"
              }`}
              className={`builder-tab${period.id === selected.id ? " is-active" : ""}`}
              style={{ textAlign: "center", textDecoration: "none" }}
            >
              {period.label}
            </Link>
          ))}
        </div>

        <div className="builder-tabs" style={{ maxWidth: "22rem", marginBottom: 0 }}>
          <Link
            href={filterHref("include")}
            className={`builder-tab${excludeLoggedIn ? "" : " is-active"}`}
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            All visitors
          </Link>
          <Link
            href={filterHref("exclude")}
            className={`builder-tab${excludeLoggedIn ? " is-active" : ""}`}
            style={{ textAlign: "center", textDecoration: "none" }}
          >
            Exclude signed in
          </Link>
        </div>
      </div>

      <p className="admin-subtitle">
        {excludeLoggedIn ? (
          <>
            Leaving out {overview.loggedInVisitors.toLocaleString()} signed-in
            visitor{overview.loggedInVisitors === 1 ? "" : "s"}. Anyone signed in
            at any point in this period is removed from all of it.
          </>
        ) : (
          <>
            Including {overview.loggedInVisitors.toLocaleString()} signed-in
            visitor{overview.loggedInVisitors === 1 ? "" : "s"} — your own
            browsing counts here.
          </>
        )}
      </p>

      <div className="viz-stats">
        <Stat label="Visitors" value={overview.totals.visitors} />
        <Stat label="Visits" value={overview.totals.visits} />
        <Stat label="Page views" value={overview.totals.pageViews} />
        <Stat label="Image views" value={overview.totals.imageViews} />
        <Stat label="Downloads" value={overview.totals.downloads} />
      </div>

      {!overview.visitorsExact ? (
        <p className="admin-subtitle" style={{ marginTop: "-0.5rem" }}>
          Over an hourly window the visitor total adds the buckets up, so someone
          who returned in a later hour is counted more than once. Daily and longer
          windows count each visitor once.
        </p>
      ) : null}

      <Panel title={selected.label}>
        {/* Columns for hourly buckets, matching the dashboard — the same data
            must not read two ways on two screens. */}
        <AnalyticsChart
          points={overview.points}
          variant={selected.value === "hour" ? "bar" : "line"}
          // The whole period, not its last bucket — and visitors counted once
          // each across it, which only the report layer can work out.
          totals={overview.totals}
          caption={`Visitors, visits and page views · ${settings.timezone}`}
        />
      </Panel>

      <div className="field-grid">
        <Panel title="Traffic sources">
          {overview.sources.length === 0 ? (
            <p className="admin-subtitle">Nothing recorded for this period.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Medium</th>
                  <th>Visits</th>
                  <th>Views</th>
                </tr>
              </thead>
              <tbody>
                {overview.sources.map((source) => (
                  <tr key={`${source.medium}-${source.source}`}>
                    <td>{source.source}</td>
                    <td>{source.medium}</td>
                    <td>{source.visits.toLocaleString()}</td>
                    <td>{source.pageViews.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Top pages">
          {overview.pages.length === 0 ? (
            <p className="admin-subtitle">Nothing recorded for this period.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Views</th>
                </tr>
              </thead>
              <tbody>
                {overview.pages.map((page) => (
                  <tr key={page.path}>
                    <td>{page.path}</td>
                    <td>{page.pageViews.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* Named, not counted — so it sits apart from the figures above and
          says which window it is answering for. */}
      <Panel title={`Signed-in visitors — ${selected.label.toLowerCase()}`}>
        {!overview.namesRecorded && overview.people.length === 0 ? (
          <p className="admin-subtitle">
            Names are not being recorded. Turn on{" "}
            <em>Record which signed-in members visited, by name</em> in the
            settings below; a rebuild fills in the past, since the raw logs
            have always carried the account behind a hit.
          </p>
        ) : overview.people.length === 0 ? (
          <p className="admin-subtitle">
            No signed-in members visited in this period.
          </p>
        ) : (
          <>
            <p className="admin-subtitle" style={{ marginBottom: "0.75rem" }}>
              {overview.people.length.toLocaleString()} member
              {overview.people.length === 1 ? "" : "s"} visited
              {overview.loggedInVisitors > overview.people.length ? (
                <>
                  {" "}
                  from {overview.loggedInVisitors.toLocaleString()} browsers —
                  one person on a phone and a laptop is two of those and one of
                  these
                </>
              ) : null}
              . Shown whichever way the visitor filter above is set, since it
              answers a different question from the figures it scopes.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Visits</th>
                    <th>Page views</th>
                    <th>Image views</th>
                    <th>Downloads</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.people.map((person) => (
                    <tr key={person.userId}>
                      <td>{person.name}</td>
                      <td>{person.visits.toLocaleString()}</td>
                      <td>{person.pageViews.toLocaleString()}</td>
                      <td>{person.imageViews.toLocaleString()}</td>
                      <td>{person.downloads.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      {/* Reported apart from page views: opening a picture full screen and
          taking a copy of it are different acts, and neither is arriving
          somewhere. Both are named `Collection - Image`. */}
      <div className="field-grid">
        <Panel title="Image views">
          {overview.images.length === 0 ? (
            <p className="admin-subtitle">
              No collection images opened full screen in this period.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Collection · image</th>
                  <th>Views</th>
                </tr>
              </thead>
              <tbody>
                {overview.images.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Image downloads">
          {overview.files.length === 0 ? (
            <p className="admin-subtitle">No downloads in this period.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Collection · image</th>
                  <th>Downloads</th>
                </tr>
              </thead>
              <tbody>
                {overview.files.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.count.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* The chart's data as a table — the accessible route to the same numbers. */}
      <Panel title={`${selected.label} — figures`}>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Visitors</th>
                <th>Visits</th>
                <th>Page views</th>
                <th>Image views</th>
                <th>Downloads</th>
              </tr>
            </thead>
            <tbody>
              {[...overview.points].reverse().map((point) => (
                <tr key={point.key}>
                  <td>{point.key}</td>
                  <td>{point.visitors.toLocaleString()}</td>
                  <td>{point.visits.toLocaleString()}</td>
                  <td>{point.pageViews.toLocaleString()}</td>
                  <td>{point.imageViews.toLocaleString()}</td>
                  <td>{point.downloads.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Processing">
        <p className="admin-subtitle" style={{ marginBottom: "0.75rem" }}>
          {overview.state.lastRunAt
            ? `Last run ${new Date(overview.state.lastRunAt).toLocaleString()}.`
            : "Has not run yet."}{" "}
          {overview.state.lastFinalizedDay
            ? `Days through ${overview.state.lastFinalizedDay} are final; today is rebuilt on every run.`
            : "No day has been finalised yet."}
        </p>
        {/* Worth stating outright: these visitors merge more readily than
            cookie-backed ones, so a high share means the counts are softer. */}
        {overview.identity.fallbackHits > 0 ? (
          <p className="admin-subtitle" style={{ marginBottom: "0.75rem" }}>
            {Math.round(
              (overview.identity.fallbackHits / Math.max(1, overview.identity.hits)) * 100
            )}
            % of hits in this period ({overview.identity.fallbackHits.toLocaleString()} of{" "}
            {overview.identity.hits.toLocaleString()}) returned no cookie and were
            identified by address instead. People sharing an address and a browser
            count as one visitor there.
          </p>
        ) : null}

        {overview.state.lastError ? (
          <div className="admin-notice is-error">{overview.state.lastError}</div>
        ) : null}
        <AnalyticsTools canRebuild={canManage} />
      </Panel>

      {canManage ? (
        <form action={saveAnalyticsSettingsAction} className="panel">
          <h2 className="panel-title">Settings</h2>

          <label className="checkbox-row" style={{ marginBottom: "0.75rem" }}>
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
            Record page views, image views and downloads
          </label>

          <label className="checkbox-row" style={{ marginBottom: "0.75rem" }}>
            <input
              type="checkbox"
              name="recordSignedInNames"
              defaultChecked={settings.recordSignedInNames}
            />
            Record which signed-in members visited, by name
          </label>
          <p className="help-text" style={{ marginTop: "-0.4rem", marginBottom: "0.75rem" }}>
            Everything else here counts people; this names them, so it is off
            until somebody turns it on. It changes what is kept from now on —
            rebuild to fill in the past, which the raw logs can do because they
            have always carried the account behind a hit.
          </p>

          <label className="checkbox-row" style={{ marginBottom: "0.75rem" }}>
            <input
              type="checkbox"
              name="excludeLoggedInByDefault"
              defaultChecked={settings.excludeLoggedInByDefault}
            />
            Leave signed-in visitors out of reports by default
          </label>
          <p className="help-text" style={{ marginTop: "-0.4rem", marginBottom: "0.75rem" }}>
            Both sets of figures are always recorded, so this only decides which
            the reports open with. Either can be shown at any time.
          </p>

          <div className="field-grid">
            <div className="field">
              <label>Day boundary timezone</label>
              <select name="timezone" defaultValue={settings.timezone}>
                {ANALYTICS_TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
                {ANALYTICS_TIMEZONES.every((zone) => zone.value !== settings.timezone) ? (
                  <option value={settings.timezone}>{settings.timezone}</option>
                ) : null}
              </select>
              <span className="help-text">
                Decides where one day ends and the next begins, for both the log
                files and every summary. Changing it moves every boundary — rebuild
                afterwards so the history matches.
              </span>
            </div>

            <div className="field">
              <label>Keep raw logs for</label>
              <input
                type="number"
                name="retentionDays"
                min={0}
                defaultValue={settings.retentionDays}
              />
              <span className="help-text">
                Days. 0 keeps every log file. Summaries are never deleted, but a
                rebuild can only go back as far as the logs.
              </span>
            </div>

            <div className="field">
              <label>Process every</label>
              <input
                type="number"
                name="intervalMinutes"
                min={1}
                max={1440}
                defaultValue={settings.intervalMinutes}
              />
              <span className="help-text">Minutes, between scheduled runs.</span>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: "1rem" }}>
            Save settings
          </button>
        </form>
      ) : null}
    </>
  );
}
