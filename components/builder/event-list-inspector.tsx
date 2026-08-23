"use client";

import {
  EVENT_LIST_DIRECTIONS,
  EVENT_LIST_DIRECTION_LABELS,
  EVENT_LIST_MAX,
  EVENT_LIST_OVERFLOWS,
  EVENT_LIST_OVERFLOW_LABELS,
  normalizeEventListSettings,
  type EventListSettings,
} from "@/lib/event-list";
import type { PageBlock } from "@/lib/page-layout";

import { CheckField, NumField, SelectField } from "./settings-fields";
import type { OpenStyleEditor } from "./story-block-inspector";

/**
 * The event list block's settings.
 *
 * Which events, how many, how they are arranged, and what each one looks like —
 * the last being a layout template, the same records the calendar's event boxes
 * use, so an event never has two different definitions of how it can look.
 */
export function EventListInspector({
  block,
  update,
  templates,
  onEditStyle,
  categories,
  who,
  tags,
}: {
  block: PageBlock;
  update: (patch: Partial<PageBlock>) => void;
  /** Event-box layout templates. */
  templates: { _id: string; name: string }[];
  /** Opens the shared style popup, the same one every builder uses. */
  onEditStyle: OpenStyleEditor;
  categories: string[];
  who: string[];
  tags: string[];
}) {
  const settings = normalizeEventListSettings(block.eventList);

  const set = (patch: Partial<EventListSettings>) =>
    update({ eventList: { ...settings, ...patch } });

  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">Which events</h4>
        <CheckField
          label="From today onwards"
          value={settings.fromToday}
          onChange={(value) => set({ fromToday: value })}
        />
        <div className="field">
          <label htmlFor="event-list-start">From date</label>
          <input
            id="event-list-start"
            type="date"
            value={settings.startDate}
            onChange={(event) => set({ startDate: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="event-list-end">To date</label>
          <input
            id="event-list-end"
            type="date"
            value={settings.endDate}
            onChange={(event) => set({ endDate: event.target.value })}
          />
        </div>
        <span className="help-text">
          Leave a date blank for no bound on that side.
          {settings.fromToday && settings.startDate
            ? " Both a from-date and “from today” are set, so whichever is later applies."
            : ""}
        </span>
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">How many</h4>
        <NumField
          label="Events to show"
          value={settings.limit}
          min={1}
          max={EVENT_LIST_MAX}
          onChange={(value) => set({ limit: value })}
        />
        <CheckField
          label="Load more in place"
          value={settings.pagination}
          onChange={(value) => set({ pagination: value })}
        />
        <span className="help-text">
          {settings.pagination
            ? "A button below the list adds the next page without leaving the page."
            : `Shows the first ${settings.limit} and stops.`}
        </span>
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Arrangement</h4>
        <SelectField
          label="Direction"
          value={settings.direction}
          options={EVENT_LIST_DIRECTIONS.map((direction) => ({
            value: direction,
            label: EVENT_LIST_DIRECTION_LABELS[direction],
          }))}
          onChange={(value) => set({ direction: value })}
        />
        {settings.direction === "horizontal" ? (
          <SelectField
            label="When it runs out of width"
            value={settings.overflow}
            options={EVENT_LIST_OVERFLOWS.map((overflow) => ({
              value: overflow,
              label: EVENT_LIST_OVERFLOW_LABELS[overflow],
            }))}
            onChange={(value) => set({ overflow: value })}
          />
        ) : null}
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Each event</h4>
        <SelectField
          label="Layout template"
          value={settings.templateId}
          options={[
            { value: "", label: "Built-in arrangement" },
            ...templates.map((template) => ({
              value: template._id,
              label: template.name,
            })),
          ]}
          onChange={(value) => set({ templateId: value })}
        />
        <span className="help-text">
          The same templates a calendar’s event boxes use. Build them under
          Calendar › Layout templates.
        </span>
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Style</h4>
        <StyleSlotButton
          label="List container"
          note="The box around the whole run of events."
          slugKey="listStyleSlug"
          valuesKey="listStyle"
          block={block}
          update={update}
          onEditStyle={onEditStyle}
        />
        <StyleSlotButton
          label="Event container"
          note="The box around each event in the list."
          slugKey="itemStyleSlug"
          valuesKey="itemStyle"
          block={block}
          update={update}
          onEditStyle={onEditStyle}
        />
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Show only</h4>
        <FilterChecklist
          label="Categories"
          options={categories}
          selected={settings.categories}
          onToggle={(value, on) =>
            set({ categories: toggle(settings.categories, value, on) })
          }
        />
        <FilterChecklist
          label="Who"
          options={who}
          selected={settings.who}
          onToggle={(value, on) => set({ who: toggle(settings.who, value, on) })}
        />
        <FilterChecklist
          label="Tags"
          options={tags}
          selected={settings.tags}
          onToggle={(value, on) => set({ tags: toggle(settings.tags, value, on) })}
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

/**
 * One of the block's two boxes, opened through the shared style popup.
 *
 * The popup writes `{ [slugKey]: slug, [valuesKey]: values }` straight onto the
 * block, which is exactly where these slots live — so unlike the calendar's
 * settings the patch needs no folding.
 */
function StyleSlotButton({
  label,
  note,
  slugKey,
  valuesKey,
  block,
  update,
  onEditStyle,
}: {
  label: string;
  note: string;
  slugKey: "listStyleSlug" | "itemStyleSlug";
  valuesKey: "listStyle" | "itemStyle";
  block: PageBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
}) {
  const slug = block[slugKey];
  const values = block[valuesKey];
  const styled = Boolean(slug) || Object.keys(values ?? {}).length > 0;

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          onEditStyle(
            {
              title: `${label} style`,
              slugKey,
              valuesKey,
              slug,
              values,
              // A container holds no text of its own; the item layout does.
              showTypography: false,
            },
            update
          )
        }
      >
        Edit style…
      </button>
      <span className="help-text">
        {slug ? `Using the “${slug}” named style.` : styled ? "Styled on this block." : note}
      </span>
      {styled ? (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            update({ [slugKey]: "", [valuesKey]: undefined } as Partial<PageBlock>)
          }
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
