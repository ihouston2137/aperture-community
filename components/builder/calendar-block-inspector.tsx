"use client";

import {
  CALENDAR_VIEWS,
  normalizeCalendarDisplay,
  type CalendarDisplay,
} from "@/lib/calendar";
import type { PageBlock } from "@/lib/page-layout";

import { CheckField, SelectField } from "./settings-fields";

/**
 * The calendar block's settings.
 *
 * Almost nothing, on purpose: how a calendar *looks* is a Calendar Style, saved
 * by name and edited in one place, so a block only says which style to wear, how
 * it behaves, and which events qualify.
 */
export function CalendarBlockInspector({
  block,
  update,
  styles,
  defaultStyleId,
  categories,
  who,
  tags,
}: {
  block: PageBlock;
  update: (patch: Partial<PageBlock>) => void;
  /** Saved Calendar Styles. */
  styles: { _id: string; name: string }[];
  /** What "site default" resolves to, so the option can name it. */
  defaultStyleId: string;
  categories: string[];
  who: string[];
  tags: string[];
}) {
  const display = normalizeCalendarDisplay(block.calendar);

  const set = (patch: Partial<CalendarDisplay>) =>
    update({ calendar: { ...display, ...patch } });

  const fallback = styles.find((style) => style._id === defaultStyleId);

  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">Style</h4>
        <SelectField
          label="Calendar style"
          value={display.styleId}
          options={[
            {
              value: "",
              label: fallback ? `Site default (${fallback.name})` : "Built-in look",
            },
            ...styles.map((style) => ({ value: style._id, label: style.name })),
          ]}
          onChange={(value) => set({ styleId: value })}
        />
        <span className="help-text">
          Every part of the calendar — the frame, the day boxes, the events, the
          detail panel — is set in the style. Edit them under Calendar › Styles.
        </span>
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Behaviour</h4>
        <SelectField
          label="Opens on"
          value={display.view}
          options={CALENDAR_VIEWS.map((view) => ({
            value: view,
            label: view === "month" ? "Month" : "Week",
          }))}
          onChange={(value) => set({ view: value })}
        />
        <CheckField
          label="Month / week switch"
          value={display.showViewSwitch}
          onChange={(value) => set({ showViewSwitch: value })}
        />
        <CheckField
          label="Previous / next / today"
          value={display.showNav}
          onChange={(value) => set({ showNav: value })}
        />
        <CheckField
          label="Weekday headers"
          value={display.showWeekdays}
          onChange={(value) => set({ showWeekdays: value })}
        />
        <CheckField
          label="Open details when an event is clicked"
          value={display.lightbox}
          onChange={(value) => set({ lightbox: value })}
        />
        <span className="help-text">Only published events appear on a page.</span>
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Show only</h4>
        <FilterChecklist
          label="Categories"
          options={categories}
          selected={display.categories}
          onToggle={(value, on) =>
            set({ categories: toggle(display.categories, value, on) })
          }
        />
        <FilterChecklist
          label="Who"
          options={who}
          selected={display.who}
          onToggle={(value, on) => set({ who: toggle(display.who, value, on) })}
        />
        <FilterChecklist
          label="Tags"
          options={tags}
          selected={display.tags}
          onToggle={(value, on) => set({ tags: toggle(display.tags, value, on) })}
        />
        <span className="help-text">
          Tick nothing to show every event. An event has to match every group you
          have narrowed.
        </span>
      </div>
    </>
  );
}

function toggle(current: string[], value: string, on: boolean): string[] {
  const next = new Set(current);
  if (on) next.add(value);
  else next.delete(value);
  return [...next];
}

function FilterChecklist({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string, on: boolean) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="chip-picker">
        {options.map((option) => (
          <label key={option} className="chip-option">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) => onToggle(option, event.target.checked)}
            />
            {option}
          </label>
        ))}
      </div>
    </div>
  );
}
