"use client";

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
  designTime = false,
  onSelectEvent,
  onAddDay,
  emptyDayLabel = "No events",
}: CalendarGridProps) {
  const byDate = groupEventsByDate(events);
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
