"use client";

import { useEffect, useState } from "react";

import { createNamedStyleAction } from "@/app/admin/design-library/actions";
import { LayoutBuilder, type PaletteItem } from "@/components/builder/layout-builder";
import {
  BLOCK_LABELS,
  PAGE_PALETTE,
  PageBlockInspector,
} from "@/components/builder/page-block-inspector";
import {
  SLOT_ICONS,
  SLOT_LABELS,
  type OpenStyleEditor,
  type StyleTarget,
} from "@/components/builder/story-block-inspector";
import { ColorOverrideFields } from "@/components/builder/settings-fields";
import { CollectionBlockView } from "@/components/collection-blocks";
import { BlockView } from "@/components/page-blocks";
import {
  COLLECTION_SLOT_BLOCK_TYPES,
  createCollectionSlotBlock,
  isCollectionSlotBlock,
  type CollectionSlotBlock,
  type CollectionSlotBlockType,
} from "@/lib/collection-slot-layout";
import { StoryBlockView, emptyStoryView, type StoryView } from "@/components/story-blocks";
import { StyleEditor } from "@/components/style-editor";
import type { BuilderSources } from "@/lib/builder-sources";
import {
  colorOverrideStyle,
  emptyColorOverrides,
  type ColorOverrides,
} from "@/lib/color-overrides";
import { createBlock, type PageBlock, type PageRow } from "@/lib/page-layout";
import { emptyPageSources, type PageSources } from "@/lib/page-source-types";
import {
  createStoryTemplateBlock,
  isStoryTemplateBlock,
  STORY_TEMPLATE_BLOCK_TYPES,
  type StoryTemplateBlock,
  type StoryTemplateBlockType,
} from "@/lib/story-template-layout";

import { saveStoryTemplateAction } from "./actions";

/** Story slots first, then everything the page builder offers. */
const PALETTE: PaletteItem[] = [
  ...STORY_TEMPLATE_BLOCK_TYPES.map((type) => ({
    type,
    label: SLOT_LABELS[type],
    icon: SLOT_ICONS[type],
    group: "Story content",
  })),
  ...PAGE_PALETTE.map((item) => ({ ...item, group: "Page blocks" })),
];

function blockLabel(block: PageBlock): string {
  return SLOT_LABELS[block.type] ?? BLOCK_LABELS[block.type] ?? block.type;
}

export type StoryTemplateRecord = {
  _id?: string;
  name: string;
  slug: string;
  isDefault: boolean;
  layout: PageRow[];
  colors: ColorOverrides;
};

export type StoryOption = { _id: string; label: string };

export function StoryTemplateBuilder({
  template,
  sources,
  stories,
  initialStory,
}: {
  template: StoryTemplateRecord;
  sources: BuilderSources;
  /** Stories offered in the preview picker. */
  stories: StoryOption[];
  /** The first story's view, so the canvas has content on load. */
  initialStory: { id: string; view: StoryView } | null;
}) {
  const [layout, setLayout] = useState<PageRow[]>(template.layout);
  const [name, setName] = useState(template.name);
  const [slug, setSlug] = useState(template.slug);
  const [isDefault, setIsDefault] = useState(template.isDefault);
  const [colors, setColors] = useState<ColorOverrides>(template.colors ?? emptyColorOverrides);
  const [styleTarget, setStyleTarget] = useState<StyleTarget | null>(null);
  const [styleApply, setStyleApply] = useState<((patch: Partial<PageBlock>) => void) | null>(
    null
  );
  const [styles, setStyles] = useState(sources.styles);

  const [previewId, setPreviewId] = useState(initialStory?.id ?? "");
  const [previewStory, setPreviewStory] = useState<StoryView | null>(
    initialStory?.view ?? null
  );

  // Swapping the reference story refetches the same view the public page uses.
  useEffect(() => {
    if (!previewId || previewId === initialStory?.id) return;
    let cancelled = false;

    fetch(`/api/admin/stories/${previewId}/view`)
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!cancelled && result?.view) setPreviewStory(result.view);
      });

    return () => {
      cancelled = true;
    };
  }, [previewId, initialStory?.id]);

  const story = previewId === initialStory?.id ? initialStory.view : previewStory;

  // Template canvases only ever preview page blocks, so the shape library is
  // the one source they need resolving.
  const canvasSources: PageSources = {
    ...emptyPageSources,
    shapes: Object.fromEntries(
      sources.shapes.map((shape) => [shape.slug, { viewBox: shape.viewBox, paths: shape.paths }])
    ),
  };

  /** Opens the popup against one of a block's style slots. */
  const openStyleEditor: OpenStyleEditor = (target, update) => {
    setStyleTarget(target);
    setStyleApply(() => update);
  };

  return (
    <>
      <form action={saveStoryTemplateAction} id="template-form">
        {template._id ? <input type="hidden" name="id" value={template._id} /> : null}
        <input type="hidden" name="layout" value={JSON.stringify(layout)} />
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="slug" value={slug} />
        {isDefault ? <input type="hidden" name="isDefault" value="on" /> : null}
        <input type="hidden" name="colors" value={JSON.stringify(colors)} />
      </form>

      <LayoutBuilder
        layout={layout}
        onChange={setLayout}
        palette={PALETTE}
        canvasStyle={colorOverrideStyle(colors)}
        documentSettings={
          <ColorOverrideFields colors={colors} onChange={setColors} scopeLabel="template" />
        }
        createBlock={(type) => {
          // A container in a template can be bound to a story or a collection,
          // so both slot vocabularies have to be creatable here.
          if ((STORY_TEMPLATE_BLOCK_TYPES as readonly string[]).includes(type)) {
            return createStoryTemplateBlock(
              type as StoryTemplateBlockType
            ) as unknown as PageBlock;
          }
          if ((COLLECTION_SLOT_BLOCK_TYPES as readonly string[]).includes(type)) {
            return createCollectionSlotBlock(
              type as CollectionSlotBlockType
            ) as unknown as PageBlock;
          }
          return createBlock(type as PageBlock["type"]);
        }}
        blockLabel={blockLabel}
        renderPreview={(block, container) =>
          isStoryTemplateBlock(block) ? (
            // The component the public story page uses, so a style change here
            // is exactly what a reader will see.
            <StoryBlockView
              block={block as unknown as StoryTemplateBlock}
              story={story ?? emptyStoryView}
              showPlaceholders
            />
          ) : isCollectionSlotBlock(block) ? (
            <CollectionBlockView
              block={block as unknown as CollectionSlotBlock}
              collection={
                container?.collectionSource === "specific"
                  ? canvasSources.collections[container.collectionId] ?? null
                  : canvasSources.latestCollection
              }
              showPlaceholders
            />
          ) : (
            <BlockView block={block} sources={canvasSources} interactive={false} />
          )
        }
        renderInspector={(block, update, context) => (
          // `PageBlockInspector` routes story slots to the shared story panel,
          // so both builders offer the same slot settings.
          <PageBlockInspector
            block={block}
            update={update}
            sources={sources}
            context={context}
            onEditStyle={openStyleEditor}
          />
        )}
        boundBackgroundMedia={(container) => {
          const collection =
            container.collectionSource === "specific"
              ? canvasSources.collections[container.collectionId]
              : canvasSources.latestCollection;
          return {
            story: story?.featureMediaUrl
              ? { url: story.featureMediaUrl, type: story.featureMediaType }
              : undefined,
            collection: collection?.featureImage
              ? {
                  url: collection.featureImage.url,
                  type: collection.featureImage.mediaType,
                }
              : undefined,
          };
        }}
        supportsContainers
        exitHref="/admin/story-templates"
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
              style={{ maxWidth: "13rem" }}
              value={previewId}
              title="Story shown in the preview"
              onChange={(event) => setPreviewId(event.target.value)}
            >
              <option value="">Preview: no story</option>
              {stories.map((option) => (
                <option key={option._id} value={option._id}>
                  Preview: {option.label}
                </option>
              ))}
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
              Default template
            </label>
            <button type="submit" form="template-form" className="btn btn-primary btn-sm">
              Save
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

          // "Save as a named style" creates the style and switches the block to it.
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
