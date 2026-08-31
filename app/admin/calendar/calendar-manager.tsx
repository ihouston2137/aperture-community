"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminHeader } from "@/components/admin-ui";
import { CalendarGrid } from "@/components/calendar-grid";
import {
  CALENDAR_SIZES,
  calendarStyleClass,
  calendarStyleCss,
  type CalendarStyleRecord,
  type EventBoxVariant,
} from "@/lib/calendar-style";
import { layoutResponsiveCss } from "@/lib/responsive-style";
import type { PageRow } from "@/lib/page-layout";
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
  type CalendarPageSettings,
  type CalendarSettingsValues,
  type CalendarView,
} from "@/lib/calendar";

import { CalendarPageSettingsPanel } from "./calendar-page-settings";
import { CalendarSettingsPanel } from "./calendar-settings";
import { EventDialog } from "./event-dialog";
import { RepeatDialog } from "./repeat-dialog";

/** The plain look: one arrangement at every size, and nothing dressing it. */
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
  pageSettings,
  styles,
  adminStyle,
  adminLayouts,
  defaultStyleId,
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
  /** The site's own calendar page, set up below the settings it shares. */
  pageSettings: CalendarPageSettings;
  /** Saved Calendar Styles, for the page's style picker. */
  styles: { _id: string; name: string }[];
  /** The style this screen wears. An empty one is the plain admin look. */
  adminStyle: CalendarStyleRecord;
  /** Layouts that style reaches for, keyed by id. */
  adminLayouts: Record<string, PageRow[]>;
  defaultStyleId: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  // A style with no slug is the empty stand-in the page builds when none is
  // chosen — there is nothing to emit and nothing to wear.
  const styled = Boolean(adminStyle.slug);

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

      {/*
        * The chosen style's own sheet.
        *
        * The admin is not a page-builder page, so nothing else emits these
        * rules here — without them the class below would match nothing and
        * choosing a style would appear to do nothing at all. The same trick
        * the public calendar page uses for the same reason.
        */}
      {styled ? (
        <style
          dangerouslySetInnerHTML={{
            __html: [
              calendarStyleCss(adminStyle),
              ...Object.values(adminLayouts).map(layoutResponsiveCss),
            ]
              .filter(Boolean)
              .join("\n"),
          }}
        />
      ) : null}

      {/* `calendar-admin-grid` marks this as the management screen, so the
          controls that belong to editing rather than to the calendar can stand
          apart from whatever a chosen style does to the colours. */}
      <div
        className={`calendar-admin-grid${
          styled ? ` pb-calendar ${calendarStyleClass(adminStyle.slug)}` : ""
        }`}
      >
        <CalendarGrid
          view={view}
          anchorDate={anchorDate}
          events={events}
          todayKey={todayKey}
          // Unstyled by default: this is a management screen, and the plain
          // grid is the one that reads fastest when the job is fixing a date.
          eventBox={styled ? adminStyle.eventBox[view] : ADMIN_EVENT_BOX}
          layouts={styled ? adminLayouts : {}}
          sources={emptyPageSources}
          onSelectEvent={(event) => setDialog({ mode: "edit", event })}
          onAddDay={(date) => setDialog({ mode: "create", date })}
        />
      </div>

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
        styles={styles}
      />

      <CalendarPageSettingsPanel
        settings={pageSettings}
        styles={styles}
        defaultStyleId={defaultStyleId}
        categories={settings.categories}
        who={settings.who}
        tags={settings.tags}
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
