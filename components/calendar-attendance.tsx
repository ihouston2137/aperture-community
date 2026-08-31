"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  getEventAttendanceAction,
  setAttendanceAction,
  type AttendanceRow,
  type AttendanceView,
} from "@/app/calendar-actions";
import type { CalendarEventRecord } from "@/lib/calendar";
import type { CalendarSlotBlock } from "@/lib/calendar-slot-layout";
import { slotIsStyled } from "@/lib/responsive-style";

import { styleSlotProps } from "./block-primitives";
import { namedLevels } from "./calendar-rsvp";

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

  /*
   * The two looks a name can wear.
   *
   * A state the template has not styled falls back to no styling at all rather
   * than to the block's own — the block dresses the sheet around the names,
   * and wearing that on the chips too would make present and absent identical,
   * which is the one thing they must not be.
   */
  const present = slotIsStyled(block, "presentStyle")
    ? styleSlotProps(block, "presentStyle")
    : { className: "", style: undefined };
  const absent = slotIsStyled(block, "absentStyle")
    ? styleSlotProps(block, "absentStyle")
    : { className: "", style: undefined };

  // The levels this template named, in the order it named them.
  const levels = namedLevels(block.levelIds, view?.levels ?? []);

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
        /*
         * The named levels side by side, wrapping on a narrow screen.
         *
         * A register is taken by working down the people in front of you, and
         * they are usually in front of you in groups — the committee at one
         * table, the newcomers at another. Columns match that; one long list
         * makes it a search each time.
         */
        <div className="cal-attendance-columns">
          {groupRows(rows, levels, block.otherHeading || "Other").map((group) => (
            <div key={group.key} className="cal-attendance-column">
              {group.name ? (
                <span className="cal-attendance-column-heading">
                  {group.name}
                  <span className="cal-attendance-column-count">
                    {group.rows.filter((row) => row.present).length}/{group.rows.length}
                  </span>
                </span>
              ) : null}

              <ul className="cal-attendance-list">
                {group.rows.map((row) => (
                  <li key={row.userId} className="cal-attendance-row">
                    {/*
                     * A chip, not a checkbox. The state is the chip's own
                     * colour, so a sheet answers "who is missing" at a glance
                     * instead of asking the eye to read a column of boxes —
                     * and the template can style each state to suit the room.
                     */}
                    <button
                      type="button"
                      className={`cal-attendance-chip ${
                        row.present ? present.className : absent.className
                      }`.trim()}
                      style={row.present ? present.style : absent.style}
                      data-present={row.present ? "true" : "false"}
                      aria-pressed={row.present}
                      disabled={!view.canRecord || saving}
                      onClick={() => toggle(row.userId, !row.present)}
                    >
                      <span className="cal-attendance-name">{row.name}</span>
                      {/* Only where no heading above has already said it. */}
                      {!group.name && row.level ? (
                        <span className="cal-attendance-level">{row.level}</span>
                      ) : null}
                      {row.rsvp ? (
                        <span className="cal-attendance-rsvp" data-answer={row.rsvp}>
                          {row.rsvp === "yes" ? "said yes" : "said no"}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
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


/**
 * The register split into the levels the template named, then everyone else.
 *
 * Somebody holding two of the named levels is listed under the first of them:
 * a register is a headcount, and a name in two columns would be counted twice
 * by the only person reading it.
 *
 * With no levels named there is one unheaded group — the whole membership, as
 * the sheet has always been.
 */
function groupRows(
  rows: AttendanceRow[],
  levels: { _id: string; name: string }[],
  otherHeading: string
): { key: string; name: string; rows: AttendanceRow[] }[] {
  if (levels.length === 0) return [{ key: "__all", name: "", rows }];

  const groups = levels.map((level) => ({
    key: level._id,
    name: level.name,
    rows: [] as AttendanceRow[],
  }));
  const other: AttendanceRow[] = [];

  for (const row of rows) {
    const group = groups.find((entry) => row.levelIds.includes(entry.key));
    if (group) group.rows.push(row);
    else other.push(row);
  }

  const listed = groups.filter((group) => group.rows.length > 0);
  if (other.length > 0) {
    listed.push({ key: "__other", name: otherHeading, rows: other });
  }
  return listed;
}
