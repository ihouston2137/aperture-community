"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  filterCalendarEvents,
  monthKeyFromDateKey,
  monthLabel,
  monthRange,
  openingView,
  shiftDateKey,
  shiftMonthKey,
  weekLabel,
  weekRange,
  type CalendarDisplay,
  type CalendarEventRecord,
  type CalendarView,
} from "@/lib/calendar";

import {
  calendarStyleClass,
  type CalendarSize,
  type CalendarStyleRecord,
} from "@/lib/calendar-style";

import type { PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";

import { CalendarGrid } from "./calendar-grid";
import { CalendarEventLightbox } from "./calendar-event-lightbox";
import { CalendarRsvpProvider } from "./calendar-rsvp-context";

export type CalendarManageHandlers = {
  /** Start a new event on a day — the "+" in a day cell, and the toolbar button. */
  onAddDay: (dateKey: string) => void;
  /** Open an existing event for editing. */
  onEditEvent: (event: CalendarEventRecord) => void;
};

/** The inclusive range a view covers, as one cache key. */
/** The breakpoints the three opening views are chosen between. */
const TABLET_QUERY = "(max-width: 63.99rem)";
const MOBILE_QUERY = "(max-width: 47.99rem)";

function readSize(): CalendarSize {
  if (window.matchMedia(MOBILE_QUERY).matches) return "mobile";
  if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
  return "desktop";
}

function subscribeToWidth(onChange: () => void): () => void {
  const queries = [
    window.matchMedia(TABLET_QUERY),
    window.matchMedia(MOBILE_QUERY),
  ];
  for (const query of queries) query.addEventListener("change", onChange);
  return () => {
    for (const query of queries) query.removeEventListener("change", onChange);
  };
}

function rangeKey(view: CalendarView, date: string): string {
  // The list covers the same month the grid does — see `CalendarList` — so it
  // shares the month's range and its cache entry rather than fetching again.
  const { start, end } =
    view === "week" ? weekRange(date) : monthRange(monthKeyFromDateKey(date));
  return `${start}:${end}`;
}

/**
 * The public calendar: the same grid the admin screen draws, plus its own
 * navigation and an event lightbox.
 *
 * Events for the first range are handed down from the server so the page paints
 * complete and indexable. Moving to another month fetches that range and caches
 * it, so stepping back and forth does not re-query.
 */
export function CalendarBlock({
  display,
  style,
  layouts,
  sources,
  initialEvents,
  /** Today in the calendar's configured zone; "" when the host cannot say. */
  todayKey,
  interactive = true,
  manage,
  reloadToken = 0,
}: {
  display: CalendarDisplay;
  /** The resolved Calendar Style this calendar wears. */
  style: CalendarStyleRecord;
  /** Layouts the style references, keyed by id. */
  layouts: Record<string, PageRow[]>;
  /** Records referenced by those layouts' page blocks. */
  sources: PageSources;
  initialEvents: CalendarEventRecord[];
  todayKey: string;
  interactive?: boolean;
  /**
   * Editing affordances, for a viewer who holds `calendar.manage`.
   *
   * Absent everywhere else, so a calendar on a public page is exactly what it
   * has always been. The buttons are a convenience only — every action behind
   * them re-checks the permission on the server.
   */
  manage?: CalendarManageHandlers;
  /**
   * Bumped when the events themselves have changed, so the cached ranges are
   * thrown away and the current one re-fetched. Navigation alone does not
   * change it: moving to a month already loaded should stay instant.
   */
  reloadToken?: number;
}) {
  /*
   * Which view this screen opens on.
   *
   * The width is a browser fact the server cannot know, so it is read as an
   * external store rather than assigned in an effect: the server and the first
   * client render both say "desktop", and React re-renders once with the real
   * answer. Setting state in an effect would paint the wrong view first and
   * then correct it, which is the flash this avoids.
   *
   * Only the *opening* view. The moment somebody presses the switch their
   * choice is held, and resizing the window is not an instruction to undo it.
   */
  const size = useSyncExternalStore(subscribeToWidth, readSize, () => "desktop" as CalendarSize);
  const [chosenView, setChosenView] = useState<CalendarView | null>(null);
  const view = chosenView ?? openingView(display, size);
  const setView = setChosenView;
  // Where the visitor has navigated to; "" means "wherever `todayKey` is".
  // `todayKey` is always resolved on the server — both the page and the builder
  // preview supply it — so no date is ever computed during render, where the
  // server's zone and the browser's could disagree and break hydration.
  const [anchorOverride, setAnchorOverride] = useState("");
  const [selected, setSelected] = useState<CalendarEventRecord | null>(null);

  const anchor = anchorOverride || todayKey;

  // Seeded with whatever the server already sent for the opening range.
  const cache = useRef<Record<string, CalendarEventRecord[]>>(
    todayKey ? { [rangeKey(display.view, todayKey)]: initialEvents } : {}
  );
  const [events, setEvents] = useState<CalendarEventRecord[]>(initialEvents);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (currentView: CalendarView, date: string) => {
      if (!date) return;

      const key = rangeKey(currentView, date);
      const cached = cache.current[key];
      if (cached) {
        setEvents(cached);
        return;
      }

      const [start, end] = key.split(":");
      setLoading(true);
      try {
        const response = await fetch(
          `/api/calendar/events?start=${start}&end=${end}`
        );
        if (!response.ok) return;
        const result = await response.json();
        const loaded: CalendarEventRecord[] = result.events ?? [];
        cache.current[key] = loaded;
        setEvents(loaded);
      } catch {
        // A failed fetch leaves the previous range on screen rather than
        // blanking the calendar.
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(view, anchor);
  }, [load, view, anchor]);

  // An event was added, edited or deleted. Every cached range could be wrong —
  // an event can be moved from one month into another — so the lot goes and
  // the range being looked at is fetched again.
  const seenToken = useRef(reloadToken);
  useEffect(() => {
    if (seenToken.current === reloadToken) return;
    seenToken.current = reloadToken;
    cache.current = {};
    void load(view, anchor);
  }, [reloadToken, load, view, anchor]);

  if (!anchor) return <div className="pb-calendar is-loading" />;

  const visible = filterCalendarEvents(events, display);
  const eventBox = style.eventBox[view];
  const rangeLabel =
    view === "week" ? weekLabel(anchor) : monthLabel(monthKeyFromDateKey(anchor));

  const step = (direction: -1 | 1) => {
    if (view === "week") {
      setAnchorOverride(shiftDateKey(anchor, direction * 7));
    } else {
      setAnchorOverride(`${shiftMonthKey(monthKeyFromDateKey(anchor), direction)}-01`);
    }
  };

  const showsToday = todayKey
    ? view === "week"
      ? weekRange(anchor).start <= todayKey && todayKey <= weekRange(anchor).end
      : monthKeyFromDateKey(anchor) === monthKeyFromDateKey(todayKey)
    : true;

  return (
    <div
      // The style's class sits on the wrapper so its rules reach the toolbar as
      // well as the grid, and so two calendars on a page can wear different
      // styles without colliding.
      className={`pb-calendar ${calendarStyleClass(style.slug)} is-${view}${
        loading ? " is-loading" : ""
      }`}
    >
      {display.showNav || display.showViewSwitch || manage ? (
        <div className="calendar-toolbar">
          {display.showNav ? (
            <button
              type="button"
              className="btn btn-sm"
              aria-label={`Previous ${view}`}
              onClick={() => step(-1)}
            >
              ‹ Prev
            </button>
          ) : null}

          <strong className="calendar-month-label">{rangeLabel}</strong>

          {display.showNav ? (
            <button
              type="button"
              className="btn btn-sm"
              aria-label={`Next ${view}`}
              onClick={() => step(1)}
            >
              Next ›
            </button>
          ) : null}

          {display.showNav && !showsToday ? (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setAnchorOverride("")}
            >
              Today
            </button>
          ) : null}

          {manage ? (
            <button
              type="button"
              className="btn btn-sm btn-primary calendar-add-event"
              // The day being looked at, so a new event lands in the month on
              // screen rather than always in today's.
              onClick={() => manage.onAddDay(anchor)}
            >
              + New event
            </button>
          ) : null}

          {display.showViewSwitch ? (
            <div className="calendar-view-switch" role="group" aria-label="Calendar view">
              {CALENDAR_VIEWS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={`btn btn-sm${view === entry ? " is-active" : ""}`}
                  aria-pressed={view === entry}
                  onClick={() => setView(entry)}
                >
                  {CALENDAR_VIEW_LABELS[entry]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <CalendarRsvpProvider
        eventIds={visible.map((item) => item._id)}
        designTime={!interactive}
      >
        <CalendarGrid
          view={view}
          anchorDate={anchor}
          events={visible}
          todayKey={todayKey}
          eventBox={eventBox}
          listPageSize={display.listPageSize}
          layouts={layouts}
          sources={sources}
          showWeekdays={display.showWeekdays}
          designTime={!interactive}
          onAddDay={manage ? manage.onAddDay : undefined}
          onSelectEvent={
            !interactive
              ? undefined
              : display.lightbox
                ? (event) => setSelected(event)
                : // With the lightbox off there is nothing for a click to open,
                  // so for a manager it opens the editor instead of doing
                  // nothing at all.
                  manage
                  ? (event) => manage.onEditEvent(event)
                  : undefined
          }
        />

        {/* Inside the same store as the grid, so answering in a cell and reading
            the list in the panel are one fact rather than two copies of it. */}
        {display.lightbox ? (
          <CalendarEventLightbox
            event={selected}
            onClose={() => setSelected(null)}
            onEdit={
              manage
                ? (event) => {
                    // The panel closes behind the editor: two stacked dialogs
                    // over one event is a way to lose track of which is which.
                    setSelected(null);
                    manage.onEditEvent(event);
                  }
                : undefined
            }
            lightbox={style.lightbox}
            layouts={layouts}
            sources={sources}
            designTime={!interactive}
          />
        ) : null}
      </CalendarRsvpProvider>
    </div>
  );
}
