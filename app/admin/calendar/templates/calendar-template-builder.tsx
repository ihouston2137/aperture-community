"use client";

import { useState } from "react";

import { createNamedStyleAction } from "@/app/admin/design-library/actions";

import { LayoutBuilder, type PaletteItem } from "@/components/builder/layout-builder";
import {
  BLOCK_LABELS,
  PAGE_PALETTE,
  PageBlockInspector,
} from "@/components/builder/page-block-inspector";
import {
  type OpenStyleEditor,
  type StyleTarget,
} from "@/components/builder/story-block-inspector";
import { CalendarSlotBlockView } from "@/components/calendar-slot-blocks";
import { StyleEditor } from "@/components/style-editor";
import { BlockView } from "@/components/page-blocks";
import type { BuilderSources } from "@/lib/builder-sources";
import type { CalendarEventRecord, CalendarTemplateKind } from "@/lib/calendar";
import { CALENDAR_TEMPLATE_KIND_LABELS } from "@/lib/calendar";
import {
  CALENDAR_SLOT_BLOCK_TYPES,
  CALENDAR_SLOT_ICONS,
  CALENDAR_SLOT_LABELS,
  createCalendarSlotBlock,
  isCalendarSlotBlock,
  type CalendarSlotBlock,
  type CalendarSlotBlockType,
} from "@/lib/calendar-slot-layout";
import { createBlock, type PageBlock, type PageRow } from "@/lib/page-layout";
import { emptyPageSources, type PageSources } from "@/lib/page-source-types";

import { saveCalendarTemplateAction } from "../actions";

/** Calendar slots first, then everything the page builder offers. */
const PALETTE: PaletteItem[] = [
  ...CALENDAR_SLOT_BLOCK_TYPES.map((type) => ({
    type,
    label: CALENDAR_SLOT_LABELS[type],
    icon: CALENDAR_SLOT_ICONS[type],
    group: "Event fields",
  })),
  ...PAGE_PALETTE.map((item) => ({ ...item, group: "Page blocks" })),
];

function blockLabel(block: PageBlock): string {
  return (
    CALENDAR_SLOT_LABELS[block.type as CalendarSlotBlockType] ??
    BLOCK_LABELS[block.type] ??
    block.type
  );
}

export type TemplateDraft = {
  _id?: string;
  name: string;
  kind: CalendarTemplateKind;
  layout: PageRow[];
};

export function CalendarTemplateBuilder({
  template,
  sources,
  events,
}: {
  template: TemplateDraft;
  sources: BuilderSources;
  /** Events offered in the preview picker, so slots have real content. */
  events: CalendarEventRecord[];
}) {
  const [layout, setLayout] = useState<PageRow[]>(template.layout);
  const [name, setName] = useState(template.name);
  const [previewId, setPreviewId] = useState(events[0]?._id ?? "");
  const [styleTarget, setStyleTarget] = useState<StyleTarget | null>(null);
  const [styleApply, setStyleApply] = useState<((patch: Partial<PageBlock>) => void) | null>(
    null
  );
  const [styles, setStyles] = useState(sources.styles);

  /** Opens the shared style popup against one of a block's style slots. */
  const openStyleEditor: OpenStyleEditor = (target, apply) => {
    setStyleTarget(target);
    setStyleApply(() => apply);
  };

  const event = events.find((entry) => entry._id === previewId) ?? events[0] ?? null;

  // Template canvases only ever preview page blocks, so the shape library is
  // the one source they need resolving.
  const canvasSources: PageSources = {
    ...emptyPageSources,
    shapes: Object.fromEntries(
      sources.shapes.map((shape) => [
        shape.slug,
        { viewBox: shape.viewBox, paths: shape.paths },
      ])
    ),
  };

  return (
    <>
      <form action={saveCalendarTemplateAction} id="calendar-template-form">
        {template._id ? <input type="hidden" name="id" value={template._id} /> : null}
        <input type="hidden" name="kind" value={template.kind} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="layout" value={JSON.stringify(layout)} />
      </form>

      <LayoutBuilder
        layout={layout}
        onChange={setLayout}
        palette={PALETTE}
        createBlock={(type) => {
          if ((CALENDAR_SLOT_BLOCK_TYPES as readonly string[]).includes(type)) {
            return createCalendarSlotBlock(
              type as CalendarSlotBlockType
            ) as unknown as PageBlock;
          }
          return createBlock(type as PageBlock["type"]);
        }}
        blockLabel={blockLabel}
        renderPreview={(block) =>
          isCalendarSlotBlock(block) ? (
            // The component the public calendar uses, so what is on the canvas
            // is what a visitor gets.
            <CalendarSlotBlockView
              block={block as unknown as CalendarSlotBlock}
              event={event}
              showPlaceholders
            />
          ) : (
            <BlockView block={block} sources={canvasSources} interactive={false} />
          )
        }
        renderInspector={(block, update, context) => (
          <PageBlockInspector
            block={block}
            update={update}
            sources={sources}
            context={context}
            onEditStyle={openStyleEditor}
          />
        )}
        supportsContainers
        exitHref="/admin/calendar/templates"
        exitLabel="Templates"
        topbar={
          <>
            <input
              className="input"
              style={{ maxWidth: "14rem" }}
              value={name}
              placeholder="Template name"
              onChange={(event) => setName(event.target.value)}
            />
            <span className="help-text">
              {CALENDAR_TEMPLATE_KIND_LABELS[template.kind]}
            </span>
            <select
              className="input"
              style={{ maxWidth: "16rem" }}
              value={previewId}
              title="Event shown in the preview"
              onChange={(event) => setPreviewId(event.target.value)}
            >
              {events.map((option) => (
                <option key={option._id} value={option._id}>
                  Preview: {option.name || "Untitled event"}
                </option>
              ))}
            </select>
            <button
              type="submit"
              form="calendar-template-form"
              className="btn btn-primary btn-sm"
            >
              Save template
            </button>
          </>
        }
      />

      <StyleEditor
        open={Boolean(styleTarget)}
        title={styleTarget?.title ?? "Block style"}
        showTypography={styleTarget?.showTypography ?? true}
        fonts={sources.fonts}
        savedStyles={styles.map((style) => ({
          _id: style._id,
          name: style.name,
          slug: style.slug,
        }))}
        initial={{ values: styleTarget?.values, styleSlug: styleTarget?.slug }}
        onClose={() => setStyleTarget(null)}
        onApply={async (result) => {
          let slugToUse = result.styleSlug;

          // "Save as a named style" creates the style and switches the block to
          // it, so it is reusable everywhere else on the site at once.
          if (!slugToUse && result.saveAsName) {
            const created = await createNamedStyleAction({
              name: result.saveAsName,
              style: result.values,
              hoverEnabled: result.hoverEnabled,
              hoverStyle: result.hoverValues,
              transitionDuration: result.transitionDuration,
            });
            if (created) {
              slugToUse = created.slug;
              setStyles((current) => [
                ...current,
                { _id: created.slug, name: created.name, slug: created.slug },
              ]);
            }
          }

          if (styleTarget) {
            styleApply?.({
              [styleTarget.slugKey]: slugToUse,
              [styleTarget.valuesKey]: slugToUse ? undefined : result.values,
            } as Partial<PageBlock>);
          }
          setStyleTarget(null);
        }}
      />
    </>
  );
}
