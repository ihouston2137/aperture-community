"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AdminHeader } from "@/components/admin-ui";
import { CalendarGrid } from "@/components/calendar-grid";
import { CalendarEventLightbox } from "@/components/calendar-event-lightbox";
import { StyleFields } from "@/components/style-editor";
import type { CalendarEventRecord } from "@/lib/calendar";
import {
  CALENDAR_BOX_PARTS,
  CALENDAR_PARTS,
  CALENDAR_PART_LABELS,
  CALENDAR_PART_NOTES,
  CALENDAR_PART_VIEWS,
  CALENDAR_SIZES,
  CALENDAR_SIZE_LABELS,
  CALENDAR_STYLE_VIEWS,
  CALENDAR_STYLE_VIEW_LABELS,
  calendarStyleClass,
  calendarStyleCss,
  type CalendarPart,
  type CalendarSize,
  type CalendarStyleValues,
  type CalendarStyleView,
  type EventBoxVariant,
} from "@/lib/calendar-style";
import type { PageRow } from "@/lib/page-layout";
import { emptyPageSources } from "@/lib/page-source-types";
import type { StyleValues } from "@/lib/style-values";

import { saveCalendarStyleAction } from "./actions";

/**
 * The Calendar Style editor: controls on the left, a live calendar on the right.
 *
 * The preview is the real `CalendarGrid` a page renders, wearing the stylesheet
 * this editor is building — so what is on screen is the result, not a picture of
 * it. The size buttons drive the same `builder-canvas` viewport switch the page
 * builder uses, which is how a narrow preview in a wide window can show what a
 * phone will get.
 */

type Tab = CalendarPart | "eventBox" | "lightbox";

export function CalendarStyleEditor({
  style: initial,
  styleId,
  slug,
  layouts,
  eventLayouts,
  lightboxLayouts,
  events,
  todayKey,
  fonts,
  saved,
}: {
  style: CalendarStyleValues;
  styleId?: string;
  slug: string;
  /** Saved layouts by id, so the preview draws through whichever is picked. */
  layouts: Record<string, PageRow[]>;
  /** Pickable event-box layouts. */
  eventLayouts: { _id: string; name: string }[];
  lightboxLayouts: { _id: string; name: string }[];
  events: CalendarEventRecord[];
  todayKey: string;
  fonts: string[];
  saved: boolean;
}) {
  const [style, setStyle] = useState(initial);
  const [view, setView] = useState<CalendarStyleView>("month");
  const [size, setSize] = useState<CalendarSize>("desktop");
  const [tab, setTab] = useState<Tab>("container");
  const [showLightbox, setShowLightbox] = useState(false);

  // Regenerated as the controls move, which is what makes the preview live.
  const css = useMemo(
    () => calendarStyleCss({ ...style, _id: styleId ?? "preview", slug }),
    [style, styleId, slug]
  );

  const setPart = (part: CalendarPart, patch: Partial<StyleValues>) =>
    setStyle((current) => ({
      ...current,
      parts: { ...current.parts, [part]: { ...(current.parts[part] ?? {}), ...patch } },
    }));

  const setVariant = (patch: Partial<EventBoxVariant>) =>
    setStyle((current) => ({
      ...current,
      eventBox: {
        ...current.eventBox,
        [view]: {
          ...current.eventBox[view],
          [size]: { ...current.eventBox[view][size], ...patch },
        },
      },
    }));

  const variant = style.eventBox[view][size];

  return (
    <form action={saveCalendarStyleAction}>
      {styleId ? <input type="hidden" name="id" value={styleId} /> : null}
      <input type="hidden" name="style" value={JSON.stringify(style)} />

      <AdminHeader
        title={styleId ? "Edit calendar style" : "New calendar style"}
        subtitle="How a calendar looks, saved by name. Any calendar on the site can wear it."
        actions={
          <>
            {saved ? <span className="save-status">Style saved.</span> : null}
            <Link href="/admin/calendar/styles" className="btn">
              Back to styles
            </Link>
            <button type="submit" className="btn btn-primary">
              Save style
            </button>
          </>
        }
      />

      <div className="appearance-workspace">
        <aside className="appearance-settings panel">
          <div className="field">
            <label htmlFor="style-name">Name</label>
            <input
              id="style-name"
              name="name"
              type="text"
              value={style.name}
              onChange={(event) =>
                setStyle((current) => ({ ...current, name: event.target.value }))
              }
              required
            />
          </div>

          <nav className="calendar-part-list" aria-label="Calendar parts">
            {CALENDAR_PARTS.map((part) => (
              <PartButton
                key={part}
                active={tab === part}
                label={CALENDAR_PART_LABELS[part]}
                note={CALENDAR_PART_NOTES[part]}
                onlyIn={
                  CALENDAR_PART_VIEWS[part].length === 1
                    ? CALENDAR_STYLE_VIEW_LABELS[CALENDAR_PART_VIEWS[part][0]]
                    : undefined
                }
                touched={Object.keys(style.parts[part] ?? {}).length > 0}
                onClick={() => {
                  setTab(part);
                  // Jump the preview to a view where this part exists, so
                  // selecting it never leaves you editing something invisible.
                  const views = CALENDAR_PART_VIEWS[part];
                  if (!views.includes(view)) setView(views[0]);
                }}
              />
            ))}
            <PartButton
              active={tab === "eventBox"}
              label="Event boxes"
              note="Varies by view and screen size, in contents as well as style."
              touched={hasEventBoxSettings(style)}
              onClick={() => setTab("eventBox")}
            />
            <PartButton
              active={tab === "lightbox"}
              label="Event detail lightbox"
              note="The panel that opens on click. Varies by screen size."
              touched={
                Object.keys(style.lightbox.style).length > 0 ||
                CALENDAR_SIZES.some(
                  (entry) =>
                    style.lightbox.bySize[entry].layoutId ||
                    style.lightbox.bySize[entry].fullScreen
                )
              }
              onClick={() => {
                setTab("lightbox");
                setShowLightbox(true);
              }}
            />
          </nav>

          {tab === "eventBox" ? (
            <>
              <div className="calendar-scope-row">
                <SegButtons
                  label="View"
                  options={CALENDAR_STYLE_VIEWS.map((entry) => ({
                    value: entry,
                    label: CALENDAR_STYLE_VIEW_LABELS[entry],
                  }))}
                  value={view}
                  onChange={(value) => setView(value as CalendarStyleView)}
                />
                <SegButtons
                  label="Size"
                  options={CALENDAR_SIZES.map((entry) => ({
                    value: entry,
                    label: CALENDAR_SIZE_LABELS[entry],
                  }))}
                  value={size}
                  onChange={(value) => setSize(value as CalendarSize)}
                />
              </div>

              <div className="field">
                <label htmlFor="event-layout">Contents</label>
                <select
                  id="event-layout"
                  value={variant.layoutId}
                  onChange={(event) => setVariant({ layoutId: event.target.value })}
                >
                  <option value="">Built-in arrangement</option>
                  {eventLayouts.map((layout) => (
                    <option key={layout._id} value={layout._id}>
                      {layout.name}
                    </option>
                  ))}
                </select>
                <span className="help-text">
                  A layout decides what an event shows and how it is arranged.
                  Build them under Layout templates.
                </span>
              </div>

              <StyleFields
                values={variant.style}
                fonts={fonts}
                onChange={(patch) =>
                  setVariant({ style: { ...variant.style, ...patch } })
                }
              />
            </>
          ) : null}

          {tab === "lightbox" ? (
            <>
              <SegButtons
                label="Size"
                options={CALENDAR_SIZES.map((entry) => ({
                  value: entry,
                  label: CALENDAR_SIZE_LABELS[entry],
                }))}
                value={size}
                onChange={(value) => setSize(value as CalendarSize)}
              />

              <div className="field">
                <label htmlFor="lightbox-layout">Contents</label>
                <select
                  id="lightbox-layout"
                  value={style.lightbox.bySize[size].layoutId}
                  onChange={(event) =>
                    setStyle((current) => ({
                      ...current,
                      lightbox: {
                        ...current.lightbox,
                        bySize: {
                          ...current.lightbox.bySize,
                          [size]: {
                            ...current.lightbox.bySize[size],
                            layoutId: event.target.value,
                          },
                        },
                      },
                    }))
                  }
                >
                  <option value="">Built-in arrangement</option>
                  {lightboxLayouts.map((layout) => (
                    <option key={layout._id} value={layout._id}>
                      {layout.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={style.lightbox.bySize[size].fullScreen}
                  onChange={(event) =>
                    setStyle((current) => ({
                      ...current,
                      lightbox: {
                        ...current.lightbox,
                        bySize: {
                          ...current.lightbox.bySize,
                          [size]: {
                            ...current.lightbox.bySize[size],
                            fullScreen: event.target.checked,
                          },
                        },
                      },
                    }))
                  }
                />
                Open full screen
              </label>

              <p className="help-text">
                Full screen fills the window instead of sitting as a panel over
                it — usually wanted on a phone, where a panel leaves little
                room, and rarely on a desktop, where it leaves a lot of nothing
                around one event.
              </p>

              <p className="help-text">
                The panel itself is styled once, at every size — only its contents
                and whether it fills the screen change with the screen.
              </p>
              <StyleFields
                values={style.lightbox.style}
                fonts={fonts}
                onChange={(patch) =>
                  setStyle((current) => ({
                    ...current,
                    lightbox: {
                      ...current.lightbox,
                      style: { ...current.lightbox.style, ...patch },
                    },
                  }))
                }
              />
            </>
          ) : null}

          {tab !== "eventBox" && tab !== "lightbox" ? (
            <StyleFields
              values={style.parts[tab] ?? {}}
              fonts={fonts}
              // A box holds no text of its own, so typography would do nothing.
              showTypography={!CALENDAR_BOX_PARTS.includes(tab)}
              onChange={(patch) => setPart(tab, patch)}
            />
          ) : null}
        </aside>

        <section className="panel appearance-preview-pane">
          <div className="calendar-preview-bar">
            <h2 className="panel-title" style={{ margin: 0 }}>
              Preview
            </h2>
            <SegButtons
              options={CALENDAR_STYLE_VIEWS.map((entry) => ({
                value: entry,
                label: CALENDAR_STYLE_VIEW_LABELS[entry],
              }))}
              value={view}
              onChange={(value) => setView(value as CalendarStyleView)}
            />
            <SegButtons
              options={CALENDAR_SIZES.map((entry) => ({
                value: entry,
                label: CALENDAR_SIZE_LABELS[entry],
              }))}
              value={size}
              onChange={(value) => setSize(value as CalendarSize)}
            />
            <label className="checkbox-row" style={{ marginLeft: "auto" }}>
              <input
                type="checkbox"
                checked={showLightbox}
                onChange={(event) => setShowLightbox(event.target.checked)}
              />
              Lightbox
            </label>
          </div>

          {/* The generated sheet, exactly as a public page receives it. */}
          <style dangerouslySetInnerHTML={{ __html: css }} />

          <div
            className="builder-canvas calendar-preview-canvas"
            data-viewport={size}
          >
            <div
              className={`pb-calendar ${calendarStyleClass(slug)} is-${view} calendar-preview`}
            >
              <div className="calendar-toolbar">
                <button type="button" className="btn btn-sm" disabled>
                  ‹ Prev
                </button>
                <strong className="calendar-month-label">
                  {view === "month" ? "August 2026" : "Aug 16 – 22, 2026"}
                </strong>
                <button type="button" className="btn btn-sm" disabled>
                  Next ›
                </button>
              </div>

              <CalendarGrid
                view={view}
                anchorDate={todayKey}
                events={events}
                todayKey={todayKey}
                eventBox={style.eventBox[view]}
                layouts={layouts}
                sources={emptyPageSources}
              />

              {showLightbox ? (
                <CalendarEventLightbox
                  event={events[0] ?? null}
                  onClose={() => setShowLightbox(false)}
                  lightbox={style.lightbox}
                  layouts={layouts}
                  sources={emptyPageSources}
                />
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}

function hasEventBoxSettings(style: CalendarStyleValues): boolean {
  return CALENDAR_STYLE_VIEWS.some((view) =>
    CALENDAR_SIZES.some((size) => {
      const variant = style.eventBox[view][size];
      return Boolean(variant.layoutId) || Object.keys(variant.style).length > 0;
    })
  );
}

/** One row of the parts list — what it is, where it appears, whether it is set. */
function PartButton({
  active,
  label,
  note,
  onlyIn,
  touched,
  onClick,
}: {
  active: boolean;
  label: string;
  note: string;
  onlyIn?: string;
  touched: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`calendar-part${active ? " is-active" : ""}`}
      aria-current={active ? "true" : undefined}
      onClick={onClick}
    >
      <span className="calendar-part-name">
        {label}
        {onlyIn ? <span className="calendar-part-only">{onlyIn} only</span> : null}
        {touched ? <span className="badge">set</span> : null}
      </span>
      <span className="calendar-part-note">{note}</span>
    </button>
  );
}

function SegButtons({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="calendar-seg" role="group" aria-label={label}>
      {label ? <span className="field-label">{label}</span> : null}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`btn btn-sm${value === option.value ? " is-active" : ""}`}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
