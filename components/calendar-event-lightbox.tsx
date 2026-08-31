"use client";

import { Pencil, X } from "lucide-react";
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
  onEdit,
  lightbox,
  layouts,
  sources,
  designTime = false,
}: {
  event: CalendarEventRecord | null;
  onClose: () => void;
  /**
   * Offered only to somebody who may manage events. It floats beside the close
   * button rather than sitting in the panel, because the panel's contents are a
   * layout somebody designed — an editing control has no place inside the thing
   * a visitor is meant to be reading.
   */
  onEdit?: (event: CalendarEventRecord) => void;
  /** The style's lightbox: one look, and a layout per screen size. */
  lightbox: CalendarStyleRecord["lightbox"];
  layouts: Record<string, PageRow[]>;
  sources: PageSources;
  /** True only on the builder canvas. */
  designTime?: boolean;
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

  /*
   * Which sizes open full screen, named on the panel for CSS to answer.
   *
   * The same trick the size-specific contents use: one markup tree carries
   * every size and the stylesheet reveals the one that fits, so the page is
   * complete from the server and nothing has to measure the window to render.
   */
  const fullSizes = CALENDAR_SIZES.filter((size) => lightbox.bySize[size].fullScreen);

  return (
    <div className="lightbox-backdrop" role="presentation" onClick={onClose}>
      <div
        className="calendar-detail"
        data-full={fullSizes.length > 0 ? fullSizes.join(" ") : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={eventLabel(event)}
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        {/* A matched pair in the corner: same size, same weight, so neither
            reads as the more important of the two. Icon-only, with the name in
            the tooltip and on the accessible label — the panel below them is
            somebody's designed layout and a word here competes with it. */}
        <div className="calendar-detail-controls">
          {onEdit ? (
            <button
              type="button"
              className="calendar-detail-icon"
              aria-label="Edit this event"
              title="Edit this event"
              onClick={() => onEdit(event)}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
          ) : null}

          <button
            type="button"
            className="calendar-detail-icon"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

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
                designTime={designTime}
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
