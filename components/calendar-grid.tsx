"use client";

import { useState } from "react";

import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  buildWeek,
  formatDayHeading,
  groupEventsByDate,
  monthKeyFromDateKey,
  sortEvents,
  type CalendarEventRecord,
  type CalendarView,
  type MonthCell,
} from "@/lib/calendar";
import {
  BUILT_IN_EVENT_FIELDS,
  CALENDAR_SIZES,
  type CalendarSize,
  type EventBoxVariant,
} from "@/lib/calendar-style";
import type { PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";

import { CalendarEventBox } from "./calendar-event-box";

/**
 * The calendar grid — month cells or a week list.
 *
 * Presentational only: it holds no state and runs no queries, so the admin
 * screen, the style editor's preview and the public page all draw the identical
 * thing rather than drifting apart. Every box carries a stable class so a
 * Calendar Style can dress it.
 */

export type CalendarGridProps = {
  view: CalendarView;
  /** Any date inside the month or week to show. */
  anchorDate: string;
  events: CalendarEventRecord[];
  todayKey: string;
  /** This view's event box, per screen size. */
  eventBox: Record<CalendarSize, EventBoxVariant>;
  /** Saved layouts by id, for whichever the variants name. */
  layouts: Record<string, PageRow[]>;
  sources: PageSources;
  showWeekdays?: boolean;
  /** List view only: events to a page. Zero shows them all. */
  listPageSize?: number;
  onSelectEvent?: (event: CalendarEventRecord) => void;
  /** True only on the builder canvas. */
  designTime?: boolean;
  /** Admin only: the "+" that adds an event on a day. */
  onAddDay?: (dateKey: string) => void;
  emptyDayLabel?: string;
};

export function CalendarGrid({
  view,
  anchorDate,
  events,
  todayKey,
  eventBox,
  layouts,
  sources,
  showWeekdays = true,
  listPageSize = 0,
  designTime = false,
  onSelectEvent,
  onAddDay,
  emptyDayLabel = "No events",
}: CalendarGridProps) {
  const byDate = groupEventsByDate(events);
  /*
   * The list is the same month, read down instead of across.
   *
   * Keeping the range means the switch between views does not move anybody:
   * March as a grid and March as a list are the same March, and the toolbar
   * steps months either way. Pagination then divides a busy month into pages
   * rather than deciding what "a page" of an open-ended list would even be.
   */
  if (view === "list") {
    return (
      <CalendarList
        events={events}
        todayKey={todayKey}
        pageSize={listPageSize}
        eventBox={eventBox}
        layouts={layouts}
        sources={sources}
        onSelectEvent={onSelectEvent}
        onAddDay={onAddDay}
        emptyLabel={emptyDayLabel}
        designTime={designTime}
      />
    );
  }

  const weeks: MonthCell[][] =
    view === "week"
      ? [buildWeek(anchorDate)]
      : buildMonthGrid(monthKeyFromDateKey(anchorDate));

  // Sizes sharing a layout render once, so the common case — one arrangement
  // everywhere — costs one copy per event rather than three.
  const groups = groupSizesByLayout(eventBox);

  return (
    <div className={`calendar-grid is-${view}`} role="grid">
      {showWeekdays && view === "month" ? (
        <div className="calendar-weekdays" role="row">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="calendar-weekday" role="columnheader">
              {label}
            </div>
          ))}
        </div>
      ) : null}

      {weeks.map((week, index) => (
        <div key={index} className="calendar-week" role="row">
          {week.map((cell, dayIndex) => {
            const dayEvents = sortEvents(byDate[cell.dateKey] ?? []);
            const classes = [
              "calendar-day",
              cell.inMonth ? "" : "is-outside",
              cell.dateKey === todayKey ? "is-today" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div key={cell.dateKey} className={classes} role="gridcell">
                <div className="calendar-day-header">
                  {view === "week" ? (
                    <span className="calendar-day-heading">
                      {formatDayHeading(cell.dateKey)}
                    </span>
                  ) : (
                    <>
                      <span className="calendar-day-number">{cell.day}</span>
                      {/* Hidden on desktop, where the column headers say it. */}
                      <span className="calendar-day-weekday">
                        {WEEKDAY_LABELS[dayIndex]}
                      </span>
                    </>
                  )}
                  {onAddDay && cell.inMonth ? (
                    <button
                      type="button"
                      className="calendar-add"
                      title={`Add an event on ${cell.dateKey}`}
                      aria-label={`Add an event on ${cell.dateKey}`}
                      onClick={() => onAddDay(cell.dateKey)}
                    >
                      +
                    </button>
                  ) : null}
                </div>

                <div className="calendar-day-events">
                  {view === "week" && dayEvents.length === 0 ? (
                    <span className="calendar-day-empty">{emptyDayLabel}</span>
                  ) : null}

                  {dayEvents.map((event) =>
                    groups.map((group) => (
                      <CalendarEventBox
                        key={`${event._id}-${group.sizes.join("-")}`}
                        event={event}
                        sizes={group.sizes}
                        layout={
                          group.layoutId ? layouts[group.layoutId] : undefined
                        }
                        sources={sources}
                        fields={BUILT_IN_EVENT_FIELDS}
                        onSelect={onSelectEvent}
                        designTime={designTime}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Sizes grouped by the layout they use.
 *
 * Only the layout is compared. Two sizes sharing an arrangement can still be
 * styled apart, because the style targets one `[data-size~=…]` token and every
 * size in a group is listed on the element.
 */
function groupSizesByLayout(
  eventBox: Record<CalendarSize, EventBoxVariant>
): { sizes: CalendarSize[]; layoutId: string }[] {
  const groups: { sizes: CalendarSize[]; layoutId: string }[] = [];

  for (const size of CALENDAR_SIZES) {
    const { layoutId } = eventBox[size];
    const existing = groups.find((group) => group.layoutId === layoutId);
    if (existing) existing.sizes.push(size);
    else groups.push({ sizes: [size], layoutId });
  }

  return groups;
}

/**
 * The same events, one after another instead of in a grid.
 *
 * Grouped by date rather than run together, because a date said once above
 * three events reads better than three events each repeating it — and it keeps
 * the day box, and today's highlight, meaning the same thing they do in the
 * other views.
 *
 * Paginated in the browser: the month is already loaded, so a page is a slice
 * of what is in hand rather than another request.
 */
function CalendarList({
  events,
  todayKey,
  pageSize,
  eventBox,
  layouts,
  sources,
  onSelectEvent,
  onAddDay,
  emptyLabel,
  designTime,
}: {
  events: CalendarEventRecord[];
  todayKey: string;
  pageSize: number;
  eventBox: Record<CalendarSize, EventBoxVariant>;
  layouts: Record<string, PageRow[]>;
  sources: PageSources;
  onSelectEvent?: (event: CalendarEventRecord) => void;
  onAddDay?: (dateKey: string) => void;
  emptyLabel: string;
  designTime?: boolean;
}) {
  const [page, setPage] = useState(0);
  const groups = groupSizesByLayout(eventBox);

  const ordered = sortEvents(events);
  const pages = pageSize > 0 ? Math.max(1, Math.ceil(ordered.length / pageSize)) : 1;
  // The month can change under a page number that no longer exists.
  const current = Math.min(page, pages - 1);
  const shown =
    pageSize > 0
      ? ordered.slice(current * pageSize, current * pageSize + pageSize)
      : ordered;

  // Only the events on this page, still grouped by the date they fall on.
  const byDate = new Map<string, CalendarEventRecord[]>();
  for (const event of shown) {
    const held = byDate.get(event.date) ?? [];
    held.push(event);
    byDate.set(event.date, held);
  }

  if (ordered.length === 0) {
    return (
      <div className="calendar-grid is-list" role="list">
        <p className="calendar-day-empty">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="calendar-grid is-list" role="list">
      {[...byDate.entries()].map(([dateKey, dayEvents]) => (
        <div
          key={dateKey}
          className={`calendar-day${dateKey === todayKey ? " is-today" : ""}`}
          role="listitem"
        >
          <div className="calendar-day-header">
            <span className="calendar-day-heading">
              {formatDayHeading(dateKey)}
            </span>
            {onAddDay ? (
              <button
                type="button"
                className="calendar-add"
                title={`Add an event on ${dateKey}`}
                aria-label={`Add an event on ${dateKey}`}
                onClick={() => onAddDay(dateKey)}
              >
                +
              </button>
            ) : null}
          </div>

          <div className="calendar-day-events">
            {dayEvents.map((event) =>
              groups.map((group) => (
                <CalendarEventBox
                  key={`${event._id}-${group.sizes.join("-")}`}
                  event={event}
                  sizes={group.sizes}
                  layout={group.layoutId ? layouts[group.layoutId] : undefined}
                  sources={sources}
                  fields={BUILT_IN_EVENT_FIELDS}
                  onSelect={onSelectEvent}
                  designTime={designTime}
                />
              ))
            )}
          </div>
        </div>
      ))}

      {pages > 1 ? (
        <div className="calendar-list-pages">
          <button
            type="button"
            className="btn btn-sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span className="calendar-list-count">
            Page {current + 1} of {pages} · {ordered.length} event
            {ordered.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
