"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { ModalPortal } from "@/components/modal-portal";
import {
  REPEAT_LIMIT,
  WEEKDAY_FULL_LABELS,
  WEEKDAY_LABELS,
  dayOfWeekIndex,
  eventLabel,
  expandWeeklyDates,
  formatDateLabel,
  shiftDateKey,
  type CalendarEventRecord,
} from "@/lib/calendar";

import { repeatCalendarEventAction } from "./actions";

/**
 * Copies an event forward on a weekly pattern.
 *
 * The preview runs the same `expandWeeklyDates` the server does, so what the
 * count promises is exactly what gets written — minus any dates that already
 * hold this event, which the action reports back.
 */
export function RepeatDialog({
  event,
  onClose,
  onDone,
}: {
  event: CalendarEventRecord;
  onClose: () => void;
  onDone: () => void;
}) {
  const sourceWeekday = dayOfWeekIndex(event.date);

  const [weekdays, setWeekdays] = useState<number[]>([sourceWeekday]);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  // A sensible horizon rather than a blank field: three months out.
  const [untilDate, setUntilDate] = useState(() => shiftDateKey(event.date, 84));
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  const dates = useMemo(
    () => expandWeeklyDates({ fromDate: event.date, weekdays, intervalWeeks, untilDate }),
    [event.date, weekdays, intervalWeeks, untilDate]
  );

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day].sort((a, b) => a - b)
    );
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", event._id);
      formData.set("untilDate", untilDate);
      formData.set("intervalWeeks", String(intervalWeeks));
      for (const day of weekdays) formData.append("weekdays", String(day));

      const result = await repeatCalendarEventAction(formData);
      if (result.ok) onDone();
      else setError(result.error ?? "Could not repeat that event.");
    });
  }

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Repeat event"
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <div className="style-modal-form">
            <div className="style-modal-header">
              <strong>Repeat event</strong>
              <span className="help-text">{eventLabel(event)}</span>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={onClose}
              >
                Back
              </button>
            </div>

            <div className="style-modal-body">
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <p className="help-text" style={{ marginBottom: "0.75rem" }}>
                Copies this event forward from {formatDateLabel(event.date)}. Each copy is
                its own record with only the date changed — editing one later does not
                change the others.
              </p>

              <div className="field">
                <span className="field-label">Repeat on</span>
                <div className="calendar-weekday-picker">
                  {WEEKDAY_LABELS.map((label, day) => (
                    <label
                      key={label}
                      className={`calendar-weekday-option${
                        weekdays.includes(day) ? " is-on" : ""
                      }`}
                      title={WEEKDAY_FULL_LABELS[day]}
                    >
                      <input
                        type="checkbox"
                        className="visually-hidden"
                        checked={weekdays.includes(day)}
                        onChange={() => toggleWeekday(day)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <span className="help-text">
                  Defaults to {WEEKDAY_FULL_LABELS[sourceWeekday]}, the day this event
                  falls on. Pick more to land on several days a week.
                </span>
              </div>

              <div className="field-grid" style={{ marginTop: "0.75rem" }}>
                <div className="field">
                  <label htmlFor="repeat-interval">Every</label>
                  <select
                    id="repeat-interval"
                    value={intervalWeeks}
                    onChange={(changeEvent) =>
                      setIntervalWeeks(Number(changeEvent.target.value))
                    }
                  >
                    {[1, 2, 3, 4, 6, 8, 12].map((weeks) => (
                      <option key={weeks} value={weeks}>
                        {weeks === 1 ? "week" : `${weeks} weeks`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="repeat-until">Until</label>
                  <input
                    id="repeat-until"
                    type="date"
                    value={untilDate}
                    min={shiftDateKey(event.date, 1)}
                    onChange={(changeEvent) => setUntilDate(changeEvent.target.value)}
                  />
                </div>
              </div>

              <div className="calendar-repeat-preview">
                {dates.length === 0 ? (
                  <span className="help-text">
                    That pattern does not land on any dates before then.
                  </span>
                ) : (
                  <>
                    <strong>
                      {dates.length} new event{dates.length === 1 ? "" : "s"}
                      {dates.length >= REPEAT_LIMIT ? ` (the ${REPEAT_LIMIT} cap)` : ""}
                    </strong>
                    <span className="help-text">
                      {dates.slice(0, 6).join(", ")}
                      {dates.length > 6 ? `, … through ${dates[dates.length - 1]}` : ""}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="style-modal-footer">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending || dates.length === 0}
                onClick={submit}
              >
                {pending
                  ? "Creating…"
                  : `Create ${dates.length} event${dates.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
