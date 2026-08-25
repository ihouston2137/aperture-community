"use client";

import { useState } from "react";

import {
  eventLabel,
  formatDateLabel,
  formatEventTimeRange,
  sanitizeLinkUrl,
  type CalendarEventRecord,
} from "@/lib/calendar";
import { eventListQuery, type EventListSettings } from "@/lib/event-list";
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

  async function loadMore() {
    if (loading) return;
    setLoading(true);

    try {
      const query = eventListQuery(settings, todayKey, events.length);
      const response = await fetch(
        `/api/calendar/events?start=${query.start}&end=${query.end}` +
          `&limit=${query.limit}&offset=${query.offset}`
      );
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

  return (
    <CalendarRsvpProvider
      eventIds={events.map((event) => event._id)}
      designTime={!interactive}
    >
      <div className="pb-event-list-shell">
        <div className={className} style={listStyle.style}>
          {events.map((event) => (
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
