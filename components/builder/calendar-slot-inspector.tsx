"use client";

import {
  CALENDAR_SLOT_LABELS,
  type CalendarSlotBlock,
  type CalendarSlotBlockType,
} from "@/lib/calendar-slot-layout";
import type { PageBlock } from "@/lib/page-layout";
import { slotIsStyled } from "@/lib/responsive-style";

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
  levels = [],
}: {
  block: CalendarSlotBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
  /** The site's membership levels, for the slots that break lists out by them. */
  levels?: { _id: string; name: string }[];
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

        {type === "calRsvpButton" ? (
          <>
            <TextField
              label="Button text"
              value={block.rsvpText ?? "RSVP"}
              onChange={(value) => update({ rsvpText: value } as Partial<PageBlock>)}
            />
            <TextField
              label="After saying yes"
              value={block.rsvpGoingText ?? "Going"}
              onChange={(value) => update({ rsvpGoingText: value } as Partial<PageBlock>)}
            />
            <TextField
              label="After saying no"
              value={block.rsvpNotGoingText ?? "Not going"}
              onChange={(value) =>
                update({ rsvpNotGoingText: value } as Partial<PageBlock>)
              }
            />
            <CheckField
              label="Show the going count"
              value={block.showCount ?? false}
              onChange={(value) => update({ showCount: value } as Partial<PageBlock>)}
            />
            <span className="help-text">
              The button only appears on events that have RSVPs switched on.
            </span>
          </>
        ) : null}

        {type === "calRsvpList" ? (
          <>
            <SelectField
              label="Lists"
              value={block.rsvpShows ?? "both"}
              options={[
                { value: "both", label: "Going and not going" },
                { value: "yes", label: "Going only" },
                { value: "no", label: "Not going only" },
              ]}
              onChange={(value) => update({ rsvpShows: value } as Partial<PageBlock>)}
            />
            <SelectField
              label="Shows"
              value={block.namesOrCounts ?? "names"}
              options={[
                { value: "names", label: "Names" },
                { value: "counts", label: "How many only" },
              ]}
              onChange={(value) =>
                update({ namesOrCounts: value } as Partial<PageBlock>)
              }
            />
            <TextField
              label="Going heading"
              value={block.yesHeading ?? "Going"}
              onChange={(value) => update({ yesHeading: value } as Partial<PageBlock>)}
            />
            <CheckField
              label="Group by membership level"
              value={block.groupByLevels ?? false}
              onChange={(value) =>
                update({ groupByLevels: value } as Partial<PageBlock>)
              }
            />
            {block.groupByLevels ? (
              <LevelPicker block={block} update={update} levels={levels} />
            ) : null}

            <CheckField
              label="Open with the notes showing"
              value={block.showNotes ?? false}
              onChange={(value) => update({ showNotes: value } as Partial<PageBlock>)}
            />
            <span className="help-text">
              Notes are only ever shown to somebody whose role holds{" "}
              <strong>Read the notes people leave with an RSVP</strong>, and
              they get a button to show and hide them. This decides whether
              that button starts on — worth it for a page only organisers open,
              and not otherwise. Whoever takes the register sees them either
              way.
            </span>

            <TextField
              label="Not going heading"
              value={block.noHeading ?? "Not going"}
              onChange={(value) => update({ noHeading: value } as Partial<PageBlock>)}
            />
            <span className="help-text">
              Only appears on events that have RSVPs switched on.
            </span>
          </>
        ) : null}

        {type === "calAttendance" ? (
          <>
            <TextField
              label="Heading"
              value={block.heading ?? "Attendance"}
              onChange={(value) => update({ heading: value } as Partial<PageBlock>)}
            />
            <CheckField
              label="Open filtered to those who said yes"
              value={block.attendanceFromRsvp ?? true}
              onChange={(value) =>
                update({ attendanceFromRsvp: value } as Partial<PageBlock>)
              }
            />
            <span className="help-text">
              A starting filter, not a limit — the whole membership is one click
              away, and anyone already ticked stays listed either way.
            </span>

            <LevelPicker block={block} update={update} levels={levels} />
            <span className="help-text">
              Each named level becomes a column. They sit side by side where
              there is room and wrap on a narrow screen. With none named the
              sheet is one list, as it was.
            </span>
            <p className="help-text">
              Only appears on events taking attendance, and only for people whose
              role holds “See who attended events” or “Record event attendance”.
              Everyone else is served nothing at all.
            </p>
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
          onClick={() =>
            onEditStyle(
              blockStyleTarget(
                block,
                type === "calRsvpButton" ? "Button style" : "Event field style"
              ),
              update
            )
          }
        >
          Edit style…
        </button>
        <p className="help-text">
          {block.styleSlug
            ? `Using the “${block.styleSlug}” named style.`
            : type === "calRsvpButton"
              ? "How the button looks before anyone answers, and the base the two answered looks build on."
              : "Set type, colour and spacing, or save it as a named style to reuse."}
        </p>
      </div>

      {type === "calAttendance" ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Present and absent</h4>
          <p className="help-text" style={{ marginTop: "-0.35rem" }}>
            Each name is a chip that switches between these two looks. A state
            you leave alone is drawn plain — which is fine for absent, and
            rarely what is wanted for present. Click a chip on the canvas to
            step through both.
          </p>

          <StateStyleButton
            label="Present"
            slugKey="presentStyleSlug"
            valuesKey="presentStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
          <StateStyleButton
            label="Absent"
            slugKey="absentStyleSlug"
            valuesKey="absentStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
        </div>
      ) : null}

      {type === "calRsvpButton" ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Answered states</h4>
          <p className="help-text" style={{ marginTop: "-0.35rem" }}>
            A state you style replaces the style above for that answer; one you
            leave alone looks the same as the resting button. Start from a copy
            so you are only changing what differs. Click the button on the
            canvas to step through all three.
          </p>

          <StateStyleButton
            label="Going"
            slugKey="goingStyleSlug"
            valuesKey="goingStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
          <StateStyleButton
            label="Not going"
            slugKey="notGoingStyleSlug"
            valuesKey="notGoingStyle"
            block={block}
            update={update}
            onEditStyle={onEditStyle}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * One answered look, opened in the same style popup every other slot uses.
 *
 * Offers a way back to nothing as well: a state with no style of its own falls
 * through to the block's, which is the behaviour a template starts with.
 */
function StateStyleButton({
  label,
  slugKey,
  valuesKey,
  block,
  update,
  onEditStyle,
}: {
  label: string;
  slugKey:
    | "goingStyleSlug"
    | "notGoingStyleSlug"
    | "presentStyleSlug"
    | "absentStyleSlug";
  valuesKey: "goingStyle" | "notGoingStyle" | "presentStyle" | "absentStyle";
  block: CalendarSlotBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
}) {
  const slug = block[slugKey];
  const values = block[valuesKey];
  const styled = slotIsStyled(block, valuesKey);
  // Nothing to copy when the resting look is a named style: that is a slug, not
  // a set of values, and the state slot would have to name it too.
  const restingCopy = block.styleSlug ? null : block.textStyle;

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="admin-list-actions">
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
                showTypography: true,
              },
              update
            )
          }
        >
          Edit style…
        </button>
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
        ) : (
          // Because a styled state replaces the resting look rather than adding
          // to it, starting from a copy is what makes "change just the colour" a
          // one-step job.
          <button
            type="button"
            className="btn btn-sm"
            disabled={!restingCopy}
            onClick={() =>
              update({ [valuesKey]: { ...restingCopy } } as Partial<PageBlock>)
            }
          >
            Copy resting style
          </button>
        )}
      </div>
      <span className="help-text">
        {slug
          ? `Using the “${slug}” named style.`
          : styled
            ? "Replaces the resting style for this answer."
            : "Looks the same as the resting button."}
      </span>
    </div>
  );
}


/**
 * Which membership levels a list breaks out, and in what order.
 *
 * Ticked rather than dragged: the order is the order they are defined in,
 * which is the order they are shown in everywhere else on the site, and a
 * second ordering to keep in step with that one would be a way of getting them
 * out of step. Anybody in none of the ticked levels falls into the last group.
 */
function LevelPicker({
  block,
  update,
  levels,
}: {
  block: CalendarSlotBlock;
  update: (patch: Partial<PageBlock>) => void;
  levels: { _id: string; name: string }[];
}) {
  const chosen = block.levelIds ?? [];

  if (levels.length === 0) {
    return (
      <span className="help-text">
        No membership levels are defined yet, so there is nothing to group by.
      </span>
    );
  }

  return (
    <>
      <div className="field">
        <label>Levels</label>
        <div className="chip-picker">
          {levels.map((level) => (
            <label key={level._id} className="chip-option">
              <input
                type="checkbox"
                checked={chosen.includes(level._id)}
                onChange={(event) =>
                  update({
                    levelIds: event.target.checked
                      ? [...chosen, level._id]
                      : chosen.filter((id) => id !== level._id),
                  } as Partial<PageBlock>)
                }
              />
              {level.name}
            </label>
          ))}
        </div>
      </div>

      <TextField
        label="Everyone else"
        value={block.otherHeading ?? "Other"}
        onChange={(value) => update({ otherHeading: value } as Partial<PageBlock>)}
      />
      <span className="help-text">
        The heading over anybody holding none of the levels above. Left out
        entirely when nobody falls into it.
      </span>
    </>
  );
}
