"use client";

import { useEffect, useState, useTransition } from "react";

import { ModalPortal } from "@/components/modal-portal";
import {
  CALENDAR_EVENT_STATUSES,
  formatDateLabel,
  type CalendarEventRecord,
} from "@/lib/calendar";

import { deleteCalendarEventAction, saveCalendarEventAction } from "./actions";

/**
 * Add / edit / delete for a single event, in a popup over the grid.
 *
 * Only mounted while open, so the uncontrolled inputs pick up the right
 * defaults each time rather than holding the previous event's values.
 */
export function EventDialog({
  event,
  defaultDate,
  categories,
  who,
  tags,
  onClose,
  onSaved,
  onRepeat,
}: {
  /** Present when editing; absent when adding. */
  event?: CalendarEventRecord;
  /** The clicked day, for a new event. */
  defaultDate?: string;
  /** The managed vocabularies, from calendar settings. */
  categories: string[];
  who: string[];
  tags: string[];
  onClose: () => void;
  onSaved: () => void;
  onRepeat: (event: CalendarEventRecord) => void;
}) {
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  function save(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveCalendarEventAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that event.");
    });
  }

  function remove() {
    if (!event) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", event._id);
      const result = await deleteCalendarEventAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that event.");
    });
  }

  const date = event?.date ?? defaultDate ?? "";
  const dateLabel = formatDateLabel(date);

  // A value the vocabulary no longer holds is still offered, so editing an
  // event never silently drops the category or tags it already carries.
  const categoryOptions = [...new Set([...categories, event?.category ?? ""])].filter(
    Boolean
  );
  const whoOptions = [...new Set([...who, ...(event?.who ?? [])])];
  const tagOptions = [...new Set([...tags, ...(event?.tags ?? [])])];

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
          aria-label={event ? "Edit event" : "Add event"}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <form action={save} className="style-modal-form">
            <div className="style-modal-header">
              <strong>{event ? "Edit event" : "Add event"}</strong>
              {dateLabel ? <span className="help-text">{dateLabel}</span> : null}
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="style-modal-body">
              {event ? <input type="hidden" name="id" value={event._id} /> : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="event-date">Date</label>
                  <input
                    id="event-date"
                    type="date"
                    name="date"
                    defaultValue={date}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="event-start">Start time</label>
                  <input
                    id="event-start"
                    type="time"
                    name="startTime"
                    defaultValue={event?.startTime ?? ""}
                  />
                  <span className="help-text">Leave blank for an all-day event.</span>
                </div>
                <div className="field">
                  <label htmlFor="event-end">End time</label>
                  <input
                    id="event-end"
                    type="time"
                    name="endTime"
                    defaultValue={event?.endTime ?? ""}
                  />
                </div>
              </div>

              <div className="field" style={{ marginTop: "0.75rem" }}>
                <label htmlFor="event-name">Name</label>
                <input
                  id="event-name"
                  type="text"
                  name="name"
                  defaultValue={event?.name ?? ""}
                  required
                />
                <span className="help-text">This is what shows on the calendar.</span>
              </div>

              <div className="field" style={{ marginTop: "0.75rem" }}>
                <label htmlFor="event-location">Location</label>
                <input
                  id="event-location"
                  type="text"
                  name="location"
                  defaultValue={event?.location ?? ""}
                  placeholder="Band room"
                />
              </div>

              <div className="field" style={{ marginTop: "0.75rem" }}>
                <label htmlFor="event-description">Description</label>
                <textarea
                  id="event-description"
                  name="description"
                  rows={4}
                  defaultValue={event?.description ?? ""}
                />
              </div>

              <div className="field-grid" style={{ marginTop: "0.75rem" }}>
                <div className="field">
                  <label htmlFor="event-link-text">Link text</label>
                  <input
                    id="event-link-text"
                    type="text"
                    name="linkText"
                    defaultValue={event?.linkText ?? ""}
                    placeholder="Buy tickets"
                  />
                </div>
                <div className="field">
                  <label htmlFor="event-link-url">Link URL</label>
                  <input
                    id="event-link-url"
                    type="text"
                    name="linkUrl"
                    defaultValue={event?.linkUrl ?? ""}
                    placeholder="https://example.com/tickets"
                  />
                </div>
                <div className="field">
                  <label htmlFor="event-status">Status</label>
                  <select
                    id="event-status"
                    name="status"
                    defaultValue={event?.status ?? "draft"}
                  >
                    {CALENDAR_EVENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status === "published" ? "Published" : "Draft"}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="event-category">Category</label>
                  <select
                    id="event-category"
                    name="category"
                    defaultValue={event?.category ?? ""}
                  >
                    <option value="">No category</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                  <span className="help-text">
                    Managed in calendar settings, below the calendar.
                  </span>
                </div>
              </div>

              <ChipPicker
                label="Who"
                field="who"
                options={whoOptions}
                selected={event?.who ?? []}
                emptyHint="No groups defined yet."
              />

              <ChipPicker
                label="Tags"
                field="tags"
                options={tagOptions}
                selected={event?.tags ?? []}
                emptyHint="No tags defined yet."
              />
            </div>

            <div className="style-modal-footer">
              {event ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this event?</span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      onClick={remove}
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmingDelete(true)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => onRepeat(event)}
                    >
                      Repeat…
                    </button>
                  </>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : event ? "Save event" : "Create event"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * A multi-value vocabulary field: one checkbox per known value, all posting
 * under the same name so the action reads them with `getAll`. Shared by Who and
 * Tags, which behave identically.
 */
function ChipPicker({
  label,
  field,
  options,
  selected,
  emptyHint,
}: {
  label: string;
  /** The form field name every chip posts under. */
  field: string;
  /** The vocabulary, plus any value this event already holds. */
  options: string[];
  selected: string[];
  emptyHint: string;
}) {
  return (
    <div className="field" style={{ marginTop: "0.75rem" }}>
      <span className="field-label">{label}</span>
      {options.length === 0 ? (
        <span className="help-text">
          {emptyHint} Add some in calendar settings, below the calendar.
        </span>
      ) : (
        <div className="chip-picker">
          {options.map((option) => (
            <label key={option} className="chip-option">
              <input
                type="checkbox"
                name={field}
                value={option}
                defaultChecked={selected.includes(option)}
              />
              {option}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
