"use client";

import type { ReactNode } from "react";

import {
  eventLabel,
  formatDateLabel,
  formatEventTimeRange,
  formatTimeLabel,
  sanitizeLinkUrl,
  type CalendarEventRecord,
} from "@/lib/calendar";
import type { CalendarSlotBlock } from "@/lib/calendar-slot-layout";

import { blockTextProps } from "./block-primitives";

/**
 * One calendar slot, filled from the event being rendered.
 *
 * The same component draws the builder preview and the published page, so a
 * style change in the template is exactly what a visitor sees.
 */
export function CalendarSlotBlockView({
  block,
  event,
  showPlaceholders = false,
}: {
  block: CalendarSlotBlock;
  event: CalendarEventRecord | null;
  /** In the builder, an empty slot names itself rather than vanishing. */
  showPlaceholders?: boolean;
}) {
  const text = slotText(block, event);
  const { className, style } = blockTextProps(block);

  if (block.type === "calLink") {
    const href = sanitizeLinkUrl(event?.linkUrl);
    const label = event?.linkText || block.fallbackText || "More details";

    if (!href) {
      return showPlaceholders ? (
        <span className={`cal-slot is-placeholder ${className}`} style={style}>
          {label}
        </span>
      ) : null;
    }

    return (
      <a
        className={`cal-slot cal-slot-link ${className}`}
        style={style}
        href={href}
        target={block.newTab ? "_blank" : undefined}
        rel={block.newTab ? "noreferrer" : undefined}
      >
        {withLabel(block, label)}
      </a>
    );
  }

  // Chips are a list rather than a run of text, so they get their own markup.
  if ((block.type === "calWho" || block.type === "calTags") && block.asChips) {
    const values = block.type === "calWho" ? event?.who ?? [] : event?.tags ?? [];
    if (values.length === 0) {
      return showPlaceholders ? (
        <span className={`cal-slot is-placeholder ${className}`} style={style}>
          {placeholderFor(block)}
        </span>
      ) : null;
    }

    return (
      <span className={`cal-slot cal-slot-chips ${className}`} style={style}>
        {block.label ? <span className="cal-slot-label">{block.label}</span> : null}
        {values.map((value) => (
          <span key={value} className="cal-slot-chip">
            {value}
          </span>
        ))}
      </span>
    );
  }

  if (!text) {
    return showPlaceholders ? (
      <span className={`cal-slot is-placeholder ${className}`} style={style}>
        {placeholderFor(block)}
      </span>
    ) : null;
  }

  return (
    <span
      className={`cal-slot cal-slot-${block.type} ${className}`.trim()}
      style={style}
    >
      {withLabel(block, text)}
    </span>
  );
}

function withLabel(block: CalendarSlotBlock, value: ReactNode): ReactNode {
  if (!block.label) return value;
  return (
    <>
      <span className="cal-slot-label">{block.label}</span>
      {value}
    </>
  );
}

/** What a slot says when the builder has no event to fill it with. */
function placeholderFor(block: CalendarSlotBlock): string {
  switch (block.type) {
    case "calName":
      return "Event name";
    case "calDate":
      return "Event date";
    case "calTime":
      return "Event time";
    case "calLocation":
      return "Location";
    case "calDescription":
      return "Description";
    case "calCategory":
      return "Category";
    case "calWho":
      return "Who";
    case "calTags":
      return "Tags";
    default:
      return "Link";
  }
}

function slotText(block: CalendarSlotBlock, event: CalendarEventRecord | null): string {
  if (!event) return "";

  switch (block.type) {
    case "calName":
      return eventLabel(event);

    case "calDate":
      return formatEventDate(event.date, block.dateFormat ?? "long");

    case "calTime":
      if (block.timeFormat === "start") return formatTimeLabel(event.startTime);
      if (block.timeFormat === "end") return formatTimeLabel(event.endTime);
      return formatEventTimeRange(event.startTime, event.endTime);

    case "calLocation":
      return event.location;

    case "calDescription":
      return event.description;

    case "calCategory":
      return event.category;

    case "calWho":
      return event.who.join(block.separator ?? ", ");

    case "calTags":
      return event.tags.join(block.separator ?? ", ");

    default:
      return "";
  }
}

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAYS_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatEventDate(dateKey: string, format: string): string {
  if (!dateKey) return "";
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return "";

  switch (format) {
    case "short":
      return `${MONTHS_SHORT[month - 1]} ${day}`;
    case "weekday":
      return WEEKDAYS_LONG[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    case "day":
      return String(day);
    default:
      return formatDateLabel(dateKey);
  }
}
