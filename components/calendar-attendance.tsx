"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  getEventAttendanceAction,
  setAttendanceAction,
  type AttendanceView,
} from "@/app/calendar-actions";
import type { CalendarEventRecord } from "@/lib/calendar";
import type { CalendarSlotBlock } from "@/lib/calendar-slot-layout";

/**
 * The attendance sheet, inside the event lightbox.
 *
 * Renders nothing at all unless the event is taking attendance *and* the viewer
 * holds the permission — the decision is the server's, in
 * `getEventAttendanceAction`, so an ordinary member never receives the roster
 * in the first place rather than receiving it and being asked not to look.
 */
export function CalendarAttendance({
  block,
  event,
  className,
  style,
  designTime,
}: {
  block: CalendarSlotBlock;
  event: CalendarEventRecord;
  className: string;
  style: React.CSSProperties | undefined;
  /** True on the builder canvas, which shows the shape rather than a live roster. */
  designTime: boolean;
}) {
  const [view, setView] = useState<AttendanceView | null>(null);
  const [query, setQuery] = useState("");
  const [onlyRsvpYes, setOnlyRsvpYes] = useState(block.attendanceFromRsvp ?? true);
  const [error, setError] = useState("");
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (designTime) return;
    let live = true;
    getEventAttendanceAction(event._id).then((next) => {
      if (live) setView(next);
    });
    return () => {
      live = false;
    };
  }, [event._id, designTime]);

  const rows = useMemo(() => {
    if (!view) return [];
    const needle = query.trim().toLowerCase();
    return view.rows.filter((row) => {
      // Someone already ticked stays on the list whatever the filter says, so a
      // record cannot be hidden by the view that made it.
      if (onlyRsvpYes && row.rsvp !== "yes" && !row.present) return false;
      if (!needle) return true;
      return `${row.name} ${row.level}`.toLowerCase().includes(needle);
    });
  }, [view, query, onlyRsvpYes]);

  function toggle(userId: string, present: boolean) {
    if (!view?.canRecord) return;
    setError("");

    // Ticked straight away and rolled back if the save fails: a register is
    // filled in at speed, and waiting a round trip per name would show.
    setView((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((row) =>
              row.userId === userId ? { ...row, present } : row
            ),
            presentCount: current.presentCount + (present ? 1 : -1),
          }
        : current
    );

    startSaving(async () => {
      const result = await setAttendanceAction(event._id, userId, present);
      if (!result.ok) {
        setError(result.error ?? "Could not save that.");
        setView((current) =>
          current
            ? {
                ...current,
                rows: current.rows.map((row) =>
                  row.userId === userId ? { ...row, present: !present } : row
                ),
                presentCount: current.presentCount + (present ? -1 : 1),
              }
            : current
        );
      }
    });
  }

  // On the canvas the block is a placeholder: there is no event to take a
  // register for and no viewer to check the permission of.
  if (designTime) {
    return (
      <div className={`cal-slot cal-attendance ${className}`.trim()} style={style}>
        <span className="cal-attendance-heading">{block.heading || "Attendance"}</span>
        <span className="cal-attendance-note">
          Shown only to people who may record attendance, and only for events
          that are taking it.
        </span>
      </div>
    );
  }

  // Not permitted, or the event is not taking attendance. Either way, nothing.
  if (!view || !view.enabled || !view.canView) return null;

  return (
    <div
      className={`cal-slot cal-attendance ${className}`.trim()}
      style={style}
      onClick={(clickEvent) => clickEvent.stopPropagation()}
      role="presentation"
    >
      <div className="cal-attendance-top">
        <span className="cal-attendance-heading">{block.heading || "Attendance"}</span>
        <span className="cal-attendance-count">
          {view.presentCount} present · {rows.length} listed
        </span>
      </div>

      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div className="cal-attendance-controls">
        <input
          type="search"
          className="cal-attendance-search"
          value={query}
          onChange={(changeEvent) => setQuery(changeEvent.target.value)}
          placeholder="Find a member"
          aria-label="Find a member"
        />
        <label className="cal-attendance-filter">
          <input
            type="checkbox"
            checked={onlyRsvpYes}
            onChange={(changeEvent) => setOnlyRsvpYes(changeEvent.target.checked)}
          />
          Only those who said yes
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="cal-attendance-note">
          {onlyRsvpYes
            ? "Nobody has said yes yet. Clear the filter to see the whole membership."
            : "No members match that."}
        </p>
      ) : (
        <ul className="cal-attendance-list">
          {rows.map((row) => (
            <li key={row.userId} className="cal-attendance-row">
              <label>
                <input
                  type="checkbox"
                  checked={row.present}
                  disabled={!view.canRecord || saving}
                  onChange={(changeEvent) => toggle(row.userId, changeEvent.target.checked)}
                />
                <span className="cal-attendance-name">{row.name}</span>
                {row.level ? (
                  <span className="cal-attendance-level">{row.level}</span>
                ) : null}
                {row.rsvp ? (
                  <span className="cal-attendance-rsvp" data-answer={row.rsvp}>
                    {row.rsvp === "yes" ? "said yes" : "said no"}
                  </span>
                ) : null}
              </label>
            </li>
          ))}
        </ul>
      )}

      {view.truncated ? (
        <p className="cal-attendance-note">
          Showing the first {view.rows.length} members. Search to reach the rest.
        </p>
      ) : null}

      {!view.canRecord ? (
        <p className="cal-attendance-note">
          You can see this register but not change it.
        </p>
      ) : null}
    </div>
  );
}
