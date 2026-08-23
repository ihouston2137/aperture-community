"use client";

import { useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import {
  normalizeVocabulary,
  timeZoneLabel,
  type CalendarSettingsValues,
} from "@/lib/calendar";

import { saveCalendarSettingsAction } from "./actions";

/**
 * Calendar settings, below the calendar itself: the zone the stored wall-clock
 * times are read in, and the category / tag vocabularies the event form picks
 * from.
 */
export function CalendarSettingsPanel({
  settings,
  resolvedTimeZone,
  serverTimeZone,
  timeZones,
  categoryUsage,
  whoUsage,
  tagUsage,
}: {
  settings: CalendarSettingsValues;
  /** The zone the calendar is currently reading today in. */
  resolvedTimeZone: string;
  /** What an empty `timeZone` falls back to — the server's own zone. */
  serverTimeZone: string;
  timeZones: string[];
  categoryUsage: Record<string, number>;
  whoUsage: Record<string, number>;
  tagUsage: Record<string, number>;
}) {
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  const [categories, setCategories] = useState(settings.categories);
  const [who, setWho] = useState(settings.who);
  const [tags, setTags] = useState(settings.tags);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    setNotice("");
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("timeZone", timeZone);
      for (const category of categories) formData.append("categories", category);
      for (const group of who) formData.append("who", group);
      for (const tag of tags) formData.append("tags", tag);

      const result = await saveCalendarSettingsAction(formData);
      if (result.ok) setNotice(result.message ?? "Saved.");
      else setError(result.error ?? "Could not save those settings.");
    });
  }

  return (
    <Panel title="Calendar settings">
      {error ? <div className="admin-notice is-error">{error}</div> : null}
      {notice ? <div className="admin-notice">{notice}</div> : null}

      <div className="field" style={{ maxWidth: "28rem" }}>
        <label htmlFor="calendar-timezone">Time zone</label>
        <select
          id="calendar-timezone"
          value={timeZone}
          onChange={(event) => setTimeZone(event.target.value)}
        >
          <option value="">Follow the server ({timeZoneLabel(serverTimeZone)})</option>
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {timeZoneLabel(zone)}
            </option>
          ))}
        </select>
        <span className="help-text">
          Event times are stored as written, so changing this never shifts an existing
          event. It sets which zone the calendar treats as &ldquo;now&rdquo; when
          highlighting today — currently {timeZoneLabel(resolvedTimeZone)}.
        </span>
      </div>

      <div className="calendar-settings-grid">
        <VocabularyEditor
          label="Categories"
          singular="category"
          help="An event holds one category. Removing one here leaves events that already use it alone."
          values={categories}
          usage={categoryUsage}
          onChange={setCategories}
        />
        <VocabularyEditor
          label="Who"
          singular="group"
          help="Groups an event is for — a section, ensemble, or audience, not an individual. Any number, including none."
          values={who}
          usage={whoUsage}
          onChange={setWho}
        />
        <VocabularyEditor
          label="Tags"
          singular="tag"
          help="An event can hold any number of tags, including none."
          values={tags}
          usage={tagUsage}
          onChange={setTags}
        />
      </div>

      <div style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save calendar settings"}
        </button>
      </div>
    </Panel>
  );
}


/** An add/remove list for one managed vocabulary. */
function VocabularyEditor({
  label,
  singular,
  help,
  values,
  usage,
  onChange,
}: {
  label: string;
  /** Stated rather than derived — trimming the "s" off "Categories" gives
      "categorie". */
  singular: string;
  help: string;
  values: string[];
  /** How many events currently use each value, so removals are informed. */
  usage: Record<string, number>;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [warning, setWarning] = useState("");

  function add() {
    const entry = draft.trim();
    if (!entry) return;

    // One entry may be pasted as a comma-separated list.
    const next = normalizeVocabulary([...values, ...entry.split(",")]);
    if (next.length === values.length) {
      setWarning(`“${entry}” is already in the list.`);
      return;
    }

    onChange(next);
    setDraft("");
    setWarning("");
  }

  function remove(value: string) {
    onChange(values.filter((entry) => entry !== value));
    const count = usage[value] ?? 0;
    setWarning(
      count > 0
        ? `“${value}” is still set on ${count} event${count === 1 ? "" : "s"}; they keep it.`
        : ""
    );
  }

  return (
    <div className="field">
      <span className="field-label">{label}</span>

      {values.length === 0 ? (
        <span className="help-text">Nothing defined yet.</span>
      ) : (
        <ul className="calendar-vocabulary">
          {values.map((value) => (
            <li key={value} className="calendar-vocabulary-item">
              <span>{value}</span>
              {usage[value] ? (
                <span className="calendar-vocabulary-count">{usage[value]}</span>
              ) : null}
              <button
                type="button"
                className="calendar-vocabulary-remove"
                aria-label={`Remove ${value}`}
                onClick={() => remove(value)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="calendar-vocabulary-add">
        <input
          type="text"
          className="input"
          value={draft}
          placeholder={`Add a ${singular}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter inside a panel would otherwise submit nothing at all here.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-sm" onClick={add}>
          Add
        </button>
      </div>

      <span className="help-text">{warning || help}</span>
    </div>
  );
}
