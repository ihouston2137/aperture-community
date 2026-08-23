"use client";

import { useEffect } from "react";

import type { PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";

import { CalendarTemplateRenderer } from "./calendar-template-renderer";
import {
  eventLabel,
  formatDateLabel,
  formatEventTimeRange,
  sanitizeLinkUrl,
  type CalendarEventRecord,
} from "@/lib/calendar";
import {
  CALENDAR_SIZES,
  type CalendarSize,
  type CalendarStyleRecord,
} from "@/lib/calendar-style";

/**
 * One event's full detail, over the page.
 *
 * Shares the `.lightbox-backdrop` the collection gallery uses so a site with
 * both does not have two different overlays. Unlike the grid rows, this is not
 * a button, so the event's link can be a real anchor.
 */
export function CalendarEventLightbox({
  event,
  onClose,
  lightbox,
  layouts,
  sources,
}: {
  event: CalendarEventRecord | null;
  onClose: () => void;
  /** The style's lightbox: one look, and a layout per screen size. */
  lightbox: CalendarStyleRecord["lightbox"];
  layouts: Record<string, PageRow[]>;
  sources: PageSources;
}) {
  useEffect(() => {
    if (!event) return;
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [event, onClose]);

  if (!event) return null;

  // Sizes sharing a layout render once. Only one panel is ever open, so even
  // three copies cost little — but the markup stays honest either way.
  const groups: { sizes: CalendarSize[]; layoutId: string }[] = [];
  for (const size of CALENDAR_SIZES) {
    const { layoutId } = lightbox.bySize[size];
    const existing = groups.find((group) => group.layoutId === layoutId);
    if (existing) existing.sizes.push(size);
    else groups.push({ sizes: [size], layoutId });
  }

  return (
    <div className="lightbox-backdrop" role="presentation" onClick={onClose}>
      <div
        className="calendar-detail"
        role="dialog"
        aria-modal="true"
        aria-label={eventLabel(event)}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        <button
          type="button"
          className="calendar-detail-close is-floating"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>

        {groups.map((group) => (
          <div
            key={group.sizes.join("-")}
            className="calendar-detail-body"
            data-size={group.sizes.join(" ")}
          >
            {group.layoutId && layouts[group.layoutId] ? (
              <CalendarTemplateRenderer
                layout={layouts[group.layoutId]}
                event={event}
                sources={sources}
              />
            ) : (
              <BuiltInDetail event={event} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The panel a calendar gets before anyone builds a layout for it. */
function BuiltInDetail({ event }: { event: CalendarEventRecord }) {
  const href = sanitizeLinkUrl(event.linkUrl);

  return (
    <>
      <p className="calendar-detail-date">{formatDateLabel(event.date)}</p>
      <h2 className="calendar-detail-name">{eventLabel(event)}</h2>
      <p className="calendar-detail-time">
        {formatEventTimeRange(event.startTime, event.endTime)}
      </p>
      {event.location ? (
        <p className="calendar-detail-location">{event.location}</p>
      ) : null}
      {event.description ? (
        <p className="calendar-detail-description">{event.description}</p>
      ) : null}

      <dl className="calendar-detail-meta">
        {event.category ? (
          <div>
            <dt>Category</dt>
            <dd>{event.category}</dd>
          </div>
        ) : null}
        {event.who.length > 0 ? (
          <div>
            <dt>Who</dt>
            <dd>{event.who.join(", ")}</dd>
          </div>
        ) : null}
        {event.tags.length > 0 ? (
          <div>
            <dt>Tags</dt>
            <dd>{event.tags.join(", ")}</dd>
          </div>
        ) : null}
      </dl>

      {href ? (
        <a className="calendar-detail-link" href={href} target="_blank" rel="noreferrer">
          {event.linkText || href}
        </a>
      ) : null}
    </>
  );
}
