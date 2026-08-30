"use client";

import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  normalizeCalendarDisplay,
  openingView,
  type CalendarDisplay,
} from "@/lib/calendar";
import {
  CALENDAR_SIZES,
  CALENDAR_SIZE_LABELS,
} from "@/lib/calendar-style";
import type { PageBlock } from "@/lib/page-layout";

import { CheckField, NumField, SelectField } from "./settings-fields";

/**
 * The calendar block's settings.
 *
 * Almost nothing, on purpose: how a calendar *looks* is a Calendar Style, saved
 * by name and edited in one place, so a block only says which style to wear, how
 * it behaves, and which events qualify.
 *
 * A thin adapter over `CalendarDisplayFields`, which is the same set of controls
 * the site's calendar page is configured with. Two mounts, one control set —
 * so the page and a block can never come to offer different things.
 */
export function CalendarBlockInspector({
  block,
  update,
  ...rest
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

  return (
    <CalendarDisplayFields
      {...rest}
      display={display}
      onChange={(next) => update({ calendar: next })}
    />
  );
}

/**
 * How a calendar behaves and which events it shows, wherever it is being set
 * up: a block on somebody's page, or the site's own calendar page.
 *
 * Takes the display and hands back a whole new one, rather than taking the
 * thing that owns it — a block, a settings record — so it does not have to know
 * which of those it is editing.
 */
export function CalendarDisplayFields({
  display,
  onChange,
  styles,
  defaultStyleId,
  categories,
  who,
  tags,
}: {
  display: CalendarDisplay;
  onChange: (display: CalendarDisplay) => void;
  /** Saved Calendar Styles. */
  styles: { _id: string; name: string }[];
  /** What "site default" resolves to, so the option can name it. */
  defaultStyleId: string;
  categories: string[];
  who: string[];
  tags: string[];
}) {
  const set = (patch: Partial<CalendarDisplay>) => onChange({ ...display, ...patch });

  const viewOptions = CALENDAR_VIEWS.map((view) => ({
    value: view,
    label: CALENDAR_VIEW_LABELS[view],
  }));

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
        {/*
          * What each screen lands on.
          *
          * Three settings rather than one, because a month grid is seven
          * columns and a phone has room for about two — the view that suits a
          * desk is not the view that suits a pocket, and a calendar that had
          * to pick one would be picking wrongly for somebody.
          */}
        <div className="inspector-grid">
          {CALENDAR_SIZES.map((size) => (
            <SelectField
              key={size}
              label={`Opens as — ${CALENDAR_SIZE_LABELS[size]}`}
              value={openingView(display, size)}
              options={viewOptions}
              onChange={(value) =>
                set(
                  size === "mobile"
                    ? { viewMobile: value }
                    : size === "tablet"
                      ? { viewTablet: value }
                      : { view: value }
                )
              }
            />
          ))}
        </div>

        <CheckField
          label="View switch"
          value={display.showViewSwitch}
          onChange={(value) => set({ showViewSwitch: value })}
        />
        <CheckField
          label="Previous / next / today"
          value={display.showNav}
          onChange={(value) => set({ showNav: value })}
        />
        <NumField
          label="Events per page in the list"
          value={display.listPageSize}
          min={0}
          max={200}
          onChange={(value) => set({ listPageSize: value })}
        />
        <span className="help-text">
          Nought puts the whole month on one page. The list covers the same
          month the grid does, so a page is a slice of that month rather than
          of an open-ended run of events.
        </span>
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
        <span className="help-text">Only published events are ever shown.</span>
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
