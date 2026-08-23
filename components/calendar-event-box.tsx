"use client";

import type { ReactNode } from "react";

import {
  eventLabel,
  formatEventTimeRange,
  formatTimeLabel,
  type CalendarEventField,
  type CalendarEventRecord,
} from "@/lib/calendar";
import type { CalendarSize } from "@/lib/calendar-style";
import type { PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";

import { CalendarTemplateRenderer } from "./calendar-template-renderer";

/**
 * One event, at one screen size.
 *
 * All three sizes are rendered and the style's CSS reveals the one that fits.
 * That looks wasteful, and it is the only way a server-rendered page can carry
 * a *different layout* per size — picking one would mean measuring the window
 * during render. Sizes sharing a layout are collapsed by the caller, so the
 * common case renders once.
 */
export function CalendarEventBox({
  event,
  sizes,
  layout,
  sources,
  fields,
  onSelect,
}: {
  event: CalendarEventRecord;
  /**
   * Which sizes this copy serves. Listed as tokens rather than one value, so a
   * layout shared by two sizes renders once and stays visible at both.
   */
  sizes: CalendarSize[];
  /** A saved layout, or undefined for the built-in arrangement. */
  layout?: PageRow[];
  sources: PageSources;
  /** What the built-in arrangement shows. Ignored when a layout is given. */
  fields: CalendarEventField[];
  onSelect?: (event: CalendarEventRecord) => void;
}) {
  const body = layout ? (
    <CalendarTemplateRenderer
      layout={layout}
      event={event}
      sources={sources}
      interactive={false}
    />
  ) : (
    <BuiltInEvent event={event} fields={fields} />
  );

  // A plain element rather than a button: a layout may hold a link or a button
  // of its own, and a button must not contain either.
  if (!onSelect) {
    return (
      <div className="calendar-event-box" data-size={sizes.join(" ")}>
        {body}
      </div>
    );
  }

  return (
    <div
      className="calendar-event-box is-clickable"
      data-size={sizes.join(" ")}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(event)}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          onSelect(event);
        }
      }}
    >
      {body}
    </div>
  );
}

/**
 * The arrangement a calendar gets before anyone builds a layout for it.
 *
 * Deliberately plain: name first, then whatever else fits, each tagged so the
 * style can dress it. Anything beyond this is a layout template.
 */
function BuiltInEvent({
  event,
  fields,
}: {
  event: CalendarEventRecord;
  fields: CalendarEventField[];
}) {
  const shows = (field: CalendarEventField) => fields.includes(field);

  const line = (field: CalendarEventField, content: ReactNode) =>
    shows(field) && content ? (
      <span className="calendar-event-line" data-cal-field={field}>
        {content}
      </span>
    ) : null;

  return (
    <>
      {shows("time") ? (
        <span className="calendar-event-line is-time" data-cal-field="time">
          {event.startTime
            ? formatEventTimeRange(event.startTime, event.endTime)
            : formatTimeLabel(event.startTime)}
        </span>
      ) : null}

      <span className="calendar-event-line is-name">{eventLabel(event)}</span>

      {line("location", event.location)}
      {line("description", event.description)}
      {line("category", event.category)}
      {line("who", event.who.join(", "))}
      {line("tags", event.tags.join(", "))}
      {line("link", event.linkText)}
    </>
  );
}
