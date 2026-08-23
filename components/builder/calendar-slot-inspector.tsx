"use client";

import {
  CALENDAR_SLOT_LABELS,
  type CalendarSlotBlock,
  type CalendarSlotBlockType,
} from "@/lib/calendar-slot-layout";
import type { PageBlock } from "@/lib/page-layout";

import { blockStyleTarget, type OpenStyleEditor } from "./story-block-inspector";
import { CheckField, SelectField, TextField } from "./settings-fields";

/**
 * Settings for one calendar slot in a layout template.
 *
 * Each slot carries the block's own style slot, opened through the shared style
 * popup — the same control every other builder uses, so a named style saved
 * here is available everywhere else on the site.
 */
export function CalendarSlotInspector({
  block,
  update,
  onEditStyle,
}: {
  block: CalendarSlotBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
}) {
  const type = block.type as CalendarSlotBlockType;

  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">{CALENDAR_SLOT_LABELS[type]}</h4>

        <TextField
          label="Label"
          value={block.label ?? ""}
          onChange={(value) => update({ label: value } as Partial<PageBlock>)}
        />
        <span className="help-text">
          Printed before the value, e.g. “Where:”. Leave blank for none.
        </span>

        {type === "calTime" ? (
          <SelectField
            label="Shows"
            value={block.timeFormat ?? "range"}
            options={[
              { value: "range", label: "Start to end" },
              { value: "start", label: "Start only" },
              { value: "end", label: "End only" },
            ]}
            onChange={(value) => update({ timeFormat: value } as Partial<PageBlock>)}
          />
        ) : null}

        {type === "calDate" ? (
          <SelectField
            label="Format"
            value={block.dateFormat ?? "long"}
            options={[
              { value: "long", label: "Friday, August 21, 2026" },
              { value: "short", label: "Aug 21" },
              { value: "weekday", label: "Friday" },
              { value: "day", label: "21" },
            ]}
            onChange={(value) => update({ dateFormat: value } as Partial<PageBlock>)}
          />
        ) : null}

        {type === "calWho" || type === "calTags" ? (
          <>
            <CheckField
              label="Show as chips"
              value={block.asChips ?? true}
              onChange={(value) => update({ asChips: value } as Partial<PageBlock>)}
            />
            {block.asChips === false ? (
              <TextField
                label="Separator"
                value={block.separator ?? ", "}
                onChange={(value) => update({ separator: value } as Partial<PageBlock>)}
              />
            ) : null}
          </>
        ) : null}

        {type === "calLink" ? (
          <>
            <TextField
              label="Fallback text"
              value={block.fallbackText ?? ""}
              onChange={(value) => update({ fallbackText: value } as Partial<PageBlock>)}
            />
            <span className="help-text">
              Used when the event names no link text of its own.
            </span>
            <CheckField
              label="Open in a new tab"
              value={block.newTab ?? true}
              onChange={(value) => update({ newTab: value } as Partial<PageBlock>)}
            />
          </>
        ) : null}
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Style</h4>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onEditStyle(blockStyleTarget(block, "Event field style"), update)}
        >
          Edit style…
        </button>
        <p className="help-text">
          {block.styleSlug
            ? `Using the “${block.styleSlug}” named style.`
            : "Set type, colour and spacing, or save it as a named style to reuse."}
        </p>
      </div>
    </>
  );
}
