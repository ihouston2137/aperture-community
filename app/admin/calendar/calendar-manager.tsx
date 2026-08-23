"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminHeader } from "@/components/admin-ui";
import { CalendarGrid } from "@/components/calendar-grid";
import { CALENDAR_SIZES, type EventBoxVariant } from "@/lib/calendar-style";
import { emptyPageSources } from "@/lib/page-source-types";
import {
  monthKeyFromDateKey,
  monthLabel,
  shiftDateKey,
  shiftMonthKey,
  monthRange,
  timeZoneLabel,
  weekLabel,
  weekRange,
  type CalendarEventRecord,
  type CalendarSettingsValues,
  type CalendarView,
} from "@/lib/calendar";

import { CalendarSettingsPanel } from "./calendar-settings";
import { EventDialog } from "./event-dialog";
import { RepeatDialog } from "./repeat-dialog";

/** The admin grid is one arrangement at every size — no style applies here. */
const ADMIN_EVENT_BOX = Object.fromEntries(
  CALENDAR_SIZES.map((size) => [size, { layoutId: "", style: {} }])
) as Record<(typeof CALENDAR_SIZES)[number], EventBoxVariant>;

/**
 * What the popup is doing right now. `null` keeps it unmounted, so each open
 * starts from clean form state rather than stale defaults.
 */
type DialogState =
  | { mode: "create"; date: string }
  | { mode: "edit"; event: CalendarEventRecord }
  | { mode: "repeat"; event: CalendarEventRecord }
  | null;

export function CalendarManager({
  view,
  anchorDate,
  events,
  todayKey,
  settings,
  resolvedTimeZone,
  serverTimeZone,
  timeZones,
  categoryUsage,
  whoUsage,
  tagUsage,
}: {
  view: CalendarView;
  anchorDate: string;
  events: CalendarEventRecord[];
  todayKey: string;
  settings: CalendarSettingsValues;
  resolvedTimeZone: string;
  serverTimeZone: string;
  timeZones: string[];
  categoryUsage: Record<string, number>;
  whoUsage: Record<string, number>;
  tagUsage: Record<string, number>;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const monthKey = monthKeyFromDateKey(anchorDate);

  // Month steps by month and week by seven days, so each view's arrows move by
  // the unit it actually shows.
  const previous =
    view === "week"
      ? shiftDateKey(anchorDate, -7)
      : `${shiftMonthKey(monthKey, -1)}-01`;
  const next =
    view === "week" ? shiftDateKey(anchorDate, 7) : `${shiftMonthKey(monthKey, 1)}-01`;

  const rangeLabel = view === "week" ? weekLabel(anchorDate) : monthLabel(monthKey);

  // Whether today is one of the days on screen, which decides both the "Today"
  // button and where a new event defaults to.
  const { start, end } =
    view === "week" ? weekRange(anchorDate) : monthRange(monthKey);
  const showsToday = todayKey >= start && todayKey <= end;

  function href(date: string, nextView: CalendarView = view) {
    return `/admin/calendar?view=${nextView}&date=${date}`;
  }

  function closeAndRefresh() {
    setDialog(null);
    router.refresh();
  }

  /** Today when it is on screen, otherwise the first day of the range. */
  function defaultNewDate() {
    return showsToday ? todayKey : start;
  }

  return (
    <>
      <AdminHeader
        title="Calendar"
        subtitle="Events for the period shown. Click a day to add one, or an event to edit it."
        actions={
          <>
            <Link href="/admin/calendar/styles" className="btn">
              Styles
            </Link>
            <Link href="/admin/calendar/templates" className="btn">
              Layout templates
            </Link>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setDialog({ mode: "create", date: defaultNewDate() })}
            >
              Add event
            </button>
          </>
        }
      />

      <div className="calendar-toolbar">
        <Link href={href(previous)} className="btn btn-sm" aria-label={`Previous ${view}`}>
          ‹ Prev
        </Link>

        <strong className="calendar-month-label">{rangeLabel}</strong>

        <Link href={href(next)} className="btn btn-sm" aria-label={`Next ${view}`}>
          Next ›
        </Link>

        {showsToday ? null : (
          // `todayKey` rather than a fresh lookup: recomputing here would use the
          // browser's zone when no zone is configured, so the server-rendered and
          // hydrated hrefs could disagree.
          <Link href={href(todayKey)} className="btn btn-sm">
            Today
          </Link>
        )}

        <div className="calendar-view-switch" role="group" aria-label="Calendar view">
          <Link
            href={href(anchorDate, "month")}
            className={`btn btn-sm${view === "month" ? " is-active" : ""}`}
            aria-current={view === "month" ? "true" : undefined}
          >
            Month
          </Link>
          <Link
            href={href(anchorDate, "week")}
            className={`btn btn-sm${view === "week" ? " is-active" : ""}`}
            aria-current={view === "week" ? "true" : undefined}
          >
            Week
          </Link>
        </div>
      </div>

      <CalendarGrid
        view={view}
        anchorDate={anchorDate}
        events={events}
        todayKey={todayKey}
        // The admin always uses the built-in arrangement at one size — it is a
        // management screen, not a page, so a Calendar Style never applies here.
        eventBox={ADMIN_EVENT_BOX}
        layouts={{}}
        sources={emptyPageSources}
        onSelectEvent={(event) => setDialog({ mode: "edit", event })}
        onAddDay={(date) => setDialog({ mode: "create", date })}
      />

      <p className="help-text calendar-legend">
        <span className="calendar-swatch is-published" /> Published
        <span className="calendar-swatch is-draft" /> Draft
        <span className="calendar-zone">Times in {timeZoneLabel(resolvedTimeZone)}</span>
        <span className="calendar-count">
          {events.length} event{events.length === 1 ? "" : "s"} in view
        </span>
      </p>

      <CalendarSettingsPanel
        settings={settings}
        resolvedTimeZone={resolvedTimeZone}
        serverTimeZone={serverTimeZone}
        timeZones={timeZones}
        categoryUsage={categoryUsage}
        whoUsage={whoUsage}
        tagUsage={tagUsage}
      />

      {dialog && dialog.mode !== "repeat" ? (
        <EventDialog
          event={dialog.mode === "edit" ? dialog.event : undefined}
          defaultDate={dialog.mode === "create" ? dialog.date : undefined}
          categories={settings.categories}
          who={settings.who}
          tags={settings.tags}
          onClose={() => setDialog(null)}
          onSaved={closeAndRefresh}
          onRepeat={(event) => setDialog({ mode: "repeat", event })}
        />
      ) : null}

      {dialog?.mode === "repeat" ? (
        <RepeatDialog
          event={dialog.event}
          onClose={() => setDialog({ mode: "edit", event: dialog.event })}
          onDone={closeAndRefresh}
        />
      ) : null}
    </>
  );
}
