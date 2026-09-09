"use client";

import { useEffect, useRef, useState } from "react";

import {
  eventLabel,
  formatDateLabel,
  formatEventTimeRange,
  localTodayDateKey,
  sanitizeLinkUrl,
  type CalendarEventRecord,
} from "@/lib/calendar";
import {
  eventListParams,
  eventListQuery,
  truncateDescription,
  type EventListSettings,
} from "@/lib/event-list";
import type { PageBlock, PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";

import { styleSlotProps } from "./block-primitives";
import { CalendarTemplateRenderer } from "./calendar-template-renderer";
import { CalendarRsvpProvider } from "./calendar-rsvp-context";

/**
 * A run of upcoming events.
 *
 * The first page is handed down from the server so the block paints complete
 * and indexable. "Load more" appends the next page in place rather than
 * navigating, which is the whole point of paginating a list embedded in a page.
 */
export function EventListBlock({
  block,
  settings,
  initialEvents,
  initialHasMore,
  todayKey,
  layout,
  sources,
  interactive = true,
}: {
  /** Carries the two style slots this block dresses. */
  block: PageBlock;
  settings: EventListSettings;
  initialEvents: CalendarEventRecord[];
  initialHasMore: boolean;
  /** Today in the calendar's configured zone, resolved on the server. */
  todayKey: string;
  /** The item layout, when the settings name one. */
  layout?: PageRow[];
  sources: PageSources;
  interactive?: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  /*
   * Whose today "from today onwards" means.
   *
   * The server resolves it in the calendar's own zone, which is what the first
   * paint has to use — a date read during render would differ between the
   * server and the browser and break hydration. Once mounted, a list running
   * from today reads the browser's own date instead, because that is the today
   * the person reading it is having: a visitor in Auckland should not still be
   * offered this morning's event because the site keeps New York time.
   *
   * Re-read when the tab comes back, so a page left open overnight rolls onto
   * the new day rather than staying on the day it was opened. Setting the same
   * date twice re-renders nothing.
   */
  const [browserToday, setBrowserToday] = useState("");
  useEffect(() => {
    const read = () => setBrowserToday(localTodayDateKey());
    read();

    const onVisible = () => {
      if (!document.hidden) read();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", read);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", read);
    };
  }, []);

  const listToday = settings.fromToday && browserToday ? browserToday : todayKey;

  // The first page's query, as the API spells it. Also this list's identity:
  // two settings that ask the same question produce the same string.
  const firstPage = eventListParams(eventListQuery(settings, listToday)).toString();

  /*
   * Re-ask when the question changes.
   *
   * On a published page it usually does not: the settings are fixed, the
   * string matches what the server already answered, and nothing is fetched.
   * Two things change it. In the builder the settings are being edited, and
   * the events handed down were loaded for the settings as *saved* — without
   * this, narrowing to a category would only filter the events already on the
   * canvas, which is how a category with plenty of events showed none of them.
   * And a visitor whose own date is not the site's gets their day's list
   * instead of its day's, at the cost of one request that the server answers
   * from its events cache.
   */
  const answered = useRef(firstPage);
  useEffect(() => {
    if (answered.current === firstPage) return;
    answered.current = firstPage;

    let current = true;
    setLoading(true);

    fetch(`/api/calendar/events?${firstPage}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!current || !result) return;
        setEvents(result.events ?? []);
        setHasMore(Boolean(result.hasMore));
      })
      .catch(() => {
        // A failed fetch leaves the list as it stands rather than emptying it.
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    // A later edit lands while this is in flight; only the last one may write.
    return () => {
      current = false;
    };
  }, [firstPage]);

  async function loadMore() {
    if (loading) return;
    setLoading(true);

    try {
      // Offset by what is on screen, which is sound only because the facets go
      // to the database with the query — every event counted here matched.
      const query = eventListQuery(settings, listToday, events.length);
      const response = await fetch(`/api/calendar/events?${eventListParams(query)}`);
      if (!response.ok) return;

      const result = await response.json();
      const next: CalendarEventRecord[] = result.events ?? [];

      // Appended, not replaced: the point of loading more in place is that what
      // is already on screen stays there.
      setEvents((current) => [...current, ...next]);
      setHasMore(Boolean(result.hasMore));
    } catch {
      // A failed fetch leaves the list as it stands rather than emptying it.
    } finally {
      setLoading(false);
    }
  }

  // A named style resolves to a class, local values to an inline style — the
  // same resolution every other styled block in the app uses.
  const listStyle = styleSlotProps(block, "listStyle");
  const itemStyle = styleSlotProps(block, "itemStyle");

  const className = [
    "pb-event-list",
    `is-${settings.direction}`,
    settings.direction === "horizontal" ? `is-${settings.overflow}` : "",
    loading ? "is-loading" : "",
    listStyle.className,
  ]
    .filter(Boolean)
    .join(" ");

  if (events.length === 0) {
    return <div className="pb-event-list-empty">No events to show.</div>;
  }

  /*
   * What this list draws, with the descriptions trimmed to the length it asked
   * for.
   *
   * Trimmed onto a copy of the event rather than at each place a description
   * is drawn: an item is either the built-in arrangement or somebody's layout
   * template, and the template draws its description through the same slot a
   * calendar's event boxes use. Handing both a shorter event is the only way
   * the setting means the same thing whichever of them is on screen.
   */
  const drawn =
    settings.descriptionLimit > 0
      ? events.map((event) => ({
          ...event,
          description: truncateDescription(
            event.description,
            settings.descriptionLimit
          ),
        }))
      : events;

  return (
    <CalendarRsvpProvider
      eventIds={events.map((event) => event._id)}
      designTime={!interactive}
    >
      <div className="pb-event-list-shell">
        <div className={className} style={listStyle.style}>
          {drawn.map((event) => (
            <div
              key={event._id}
              className={`pb-event-item ${itemStyle.className}`.trim()}
              style={itemStyle.style}
            >
              {layout ? (
                <CalendarTemplateRenderer
                  layout={layout}
                  event={event}
                  sources={sources}
                  interactive={interactive}
                  designTime={!interactive}
                />
              ) : (
                <BuiltInItem event={event} />
              )}
            </div>
          ))}
        </div>

        {settings.pagination && hasMore ? (
          <div className="pb-event-list-more">
            <button
              type="button"
              className="btn"
              disabled={loading || !interactive}
              onClick={loadMore}
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </CalendarRsvpProvider>
  );
}

/** What an item looks like before anyone builds a layout for it. */
function BuiltInItem({ event }: { event: CalendarEventRecord }) {
  const href = sanitizeLinkUrl(event.linkUrl);

  return (
    <>
      <span className="pb-event-date">{formatDateLabel(event.date)}</span>
      <span className="pb-event-name">{eventLabel(event)}</span>
      <span className="pb-event-time">
        {formatEventTimeRange(event.startTime, event.endTime)}
      </span>
      {event.location ? (
        <span className="pb-event-location">{event.location}</span>
      ) : null}
      {event.description ? (
        <span className="pb-event-description">{event.description}</span>
      ) : null}
      {href ? (
        <a
          className="pb-event-link"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {event.linkText || "Details"}
        </a>
      ) : null}
    </>
  );
}
