"use client";

import { useState } from "react";

import { createNamedStyleAction } from "@/app/admin/design-library/actions";

import { LayoutBuilder, type PaletteItem } from "@/components/builder/layout-builder";
import {
  BLOCK_LABELS,
  PAGE_PALETTE,
  PageBlockInspector,
} from "@/components/builder/page-block-inspector";
import { ColorOverrideFields } from "@/components/builder/settings-fields";
import {
  type OpenStyleEditor,
  type StyleTarget,
} from "@/components/builder/story-block-inspector";
import { StyleEditor } from "@/components/style-editor";
import { DocSlotView } from "@/components/doc-slot-blocks";
import { BlockView } from "@/components/page-blocks";
import type { BuilderSources } from "@/lib/builder-sources";
import {
  colorOverrideStyle,
  emptyColorOverrides,
  type ColorOverrides,
} from "@/lib/color-overrides";
import {
  DOC_SLOT_ICONS,
  DOC_SLOT_LABELS,
  DOC_TEMPLATE_BLOCK_TYPES,
  collectDocElementCss,
  createDocTemplateBlock,
  isDocTemplateBlock,
  type DocTemplateBlock,
  type DocTemplateBlockType,
} from "@/lib/doc-template-layout";
import type { DocNode, DocView } from "@/lib/doc-tree";
import { createBlock, type PageBlock, type PageRow } from "@/lib/page-layout";
import { emptyPageSources, type PageSources } from "@/lib/page-source-types";

import { saveDocTemplateAction } from "./actions";

/** Doc slots first, then everything the page builder offers. */
const PALETTE: PaletteItem[] = [
  ...DOC_TEMPLATE_BLOCK_TYPES.map((type) => ({
    type,
    label: DOC_SLOT_LABELS[type],
    icon: DOC_SLOT_ICONS[type],
    group: "Document",
  })),
  ...PAGE_PALETTE.map((item) => ({ ...item, group: "Page blocks" })),
];

function blockLabel(block: PageBlock): string {
  return (
    DOC_SLOT_LABELS[block.type as DocTemplateBlockType] ??
    BLOCK_LABELS[block.type] ??
    block.type
  );
}

export type DocTemplateRecord = {
  _id?: string;
  name: string;
  slug: string;
  isDefault: boolean;
  layout: PageRow[];
  colors: ColorOverrides;
};

export function DocTemplateBuilder({
  template,
  sources,
  docs,
  initialDoc,
  tree,
}: {
  template: DocTemplateRecord;
  sources: BuilderSources;
  /** Documents offered in the preview picker. */
  docs: { _id: string; title: string }[];
  /** The first document's view, so the canvas has content on load. */
  initialDoc: DocView | null;
  tree: DocNode[];
}) {
  const [layout, setLayout] = useState<PageRow[]>(template.layout);
  const [name, setName] = useState(template.name);
  const [slug, setSlug] = useState(template.slug);
  const [isDefault, setIsDefault] = useState(template.isDefault);
  const [colors, setColors] = useState<ColorOverrides>(
    template.colors ?? emptyColorOverrides
  );
  const [previewId, setPreviewId] = useState(initialDoc?._id ?? "");
  const [styleTarget, setStyleTarget] = useState<StyleTarget | null>(null);
  const [styleApply, setStyleApply] = useState<((patch: Partial<PageBlock>) => void) | null>(
    null
  );
  const [styles, setStyles] = useState(sources.styles);

  const openStyleEditor: OpenStyleEditor = (target, apply) => {
    setStyleTarget(target);
    setStyleApply(() => apply);
  };
  const [preview, setPreview] = useState<DocView | null>(initialDoc);

  // Swapping the reference document fetches the same view the public page uses.
  const choose = async (id: string) => {
    setPreviewId(id);
    if (!id) {
      setPreview(null);
      return;
    }
    const response = await fetch(`/api/admin/docs/${id}/view`);
    if (response.ok) {
      const result = await response.json();
      setPreview(result.view ?? null);
    }
  };

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
      <form action={saveDocTemplateAction} id="doc-template-form">
        {template._id ? <input type="hidden" name="id" value={template._id} /> : null}
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="layout" value={JSON.stringify(layout)} />
        <input type="hidden" name="colors" value={JSON.stringify(colors)} />
        {isDefault ? <input type="hidden" name="isDefault" value="on" /> : null}
      </form>

      <LayoutBuilder
        layout={layout}
        onChange={setLayout}
        palette={PALETTE}
        canvasStyle={colorOverrideStyle(colors)}
        // The body's element styles live on the slot, not the layout, so the
        // canvas has to be handed the same sheet the published page emits —
        // without it, editing a heading or a table changes nothing on screen.
        extraCss={collectDocElementCss(layout)}
        documentSettings={
          <ColorOverrideFields colors={colors} onChange={setColors} scopeLabel="template" />
        }
        createBlock={(type) => {
          if ((DOC_TEMPLATE_BLOCK_TYPES as readonly string[]).includes(type)) {
            return createDocTemplateBlock(
              type as DocTemplateBlockType
            ) as unknown as PageBlock;
          }
          return createBlock(type as PageBlock["type"]);
        }}
        blockLabel={blockLabel}
        renderPreview={(block) =>
          isDocTemplateBlock(block) ? (
            // The component the public page uses, so what is on the canvas is
            // what a reader gets.
            <DocSlotView
              block={block as unknown as DocTemplateBlock}
              doc={preview}
              tree={tree}
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
        exitHref="/admin/docs/templates"
        exitLabel="Templates"
        topbar={
          <>
            <input
              className="input"
              style={{ maxWidth: "12rem" }}
              value={name}
              placeholder="Template name"
              onChange={(event) => setName(event.target.value)}
            />
            <input
              className="input"
              style={{ maxWidth: "9rem" }}
              value={slug}
              placeholder="slug"
              onChange={(event) => setSlug(event.target.value)}
            />
            <select
              className="input"
              style={{ maxWidth: "14rem" }}
              value={previewId}
              title="Document shown in the preview"
              onChange={(event) => void choose(event.target.value)}
            >
              <option value="">Preview: no document</option>
              {docs.map((entry) => (
                <option key={entry._id} value={entry._id}>
                  Preview: {entry.title}
                </option>
              ))}
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
              Default
            </label>
            <button
              type="submit"
              form="doc-template-form"
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
