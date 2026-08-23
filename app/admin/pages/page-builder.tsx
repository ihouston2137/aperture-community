"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createNamedStyleAction } from "@/app/admin/design-library/actions";
import { CollectionBlockView } from "@/components/collection-blocks";
import { BlockView } from "@/components/page-blocks";
import type { ResolvedCollection } from "@/lib/collection-types";
import {
  COLLECTION_SLOT_BLOCK_TYPES,
  createCollectionSlotBlock,
  isCollectionSlotBlock,
  type CollectionSlotBlock,
  type CollectionSlotBlockType,
} from "@/lib/collection-slot-layout";
import { InspectorStylePanel } from "@/components/builder/inspector-style-panel";
import { LayoutBuilder } from "@/components/builder/layout-builder";
import {
  BLOCK_LABELS,
  PAGE_PALETTE,
  PageBlockInspector,
} from "@/components/builder/page-block-inspector";
import type { StyleTarget } from "@/components/builder/story-block-inspector";
import type { BuilderSources } from "@/lib/builder-sources";
import { ColorOverrideFields } from "@/components/builder/settings-fields";
import {
  colorOverrideStyle,
  emptyColorOverrides,
  type ColorOverrides,
} from "@/lib/color-overrides";
import {
  createBlock,
  walkBlocks,
  type PageBlock,
  type PageLayout,
} from "@/lib/page-layout";
import {
  createStoryTemplateBlock,
  isStoryTemplateBlock,
  STORY_TEMPLATE_BLOCK_TYPES,
  type StoryTemplateBlock,
  type StoryTemplateBlockType,
} from "@/lib/story-template-layout";
import {
  StoryBlockView,
  emptyStoryView,
  type StoryView,
} from "@/components/story-blocks";
import { calendarStyleCss } from "@/lib/calendar-style";
import { emptyPageSources, type PageSources } from "@/lib/page-source-types";
import {
  ChromeStyle,
  PreviewFooter,
  PreviewHeader,
} from "@/components/site-chrome-preview";
import type { AppearanceValues, SiteContentValues } from "@/lib/site-values";

import { deleteSavedBlockAction, savePageAction, saveBlockAction } from "./actions";


/**
 * Which story each container in the layout is bound to. `latest` stands for the
 * most recently published one, exactly as the public renderer resolves it.
 */
function containerStoryKeys(layout: PageLayout): string[] {
  const keys = new Set<string>();
  walkBlocks(layout, (block) => {
    if (block.type !== "container" || !block.container) return;
    if (block.container.storySource === "latest") keys.add("latest");
    else if (block.container.storySource === "specific" && block.container.storyId) {
      keys.add(block.container.storyId);
    }
  });
  return [...keys].sort();
}

/** The same, for whichever collection each container is bound to. */
function containerCollectionKeys(layout: PageLayout): string[] {
  const keys = new Set<string>();
  walkBlocks(layout, (block) => {
    if (block.type !== "container" || !block.container) return;
    if (block.container.collectionSource === "latest") keys.add("latest");
    else if (
      block.container.collectionSource === "specific" &&
      block.container.collectionId
    ) {
      keys.add(block.container.collectionId);
    }
  });
  return [...keys].sort();
}

export type PageRecord = {
  _id?: string;
  title: string;
  slug: string;
  status: string;
  isHome: boolean;
  layout: PageLayout;
  colors: ColorOverrides;
};

export function PageBuilder({
  page,
  sources,
  previewSources,
  chrome,
}: {
  page: PageRecord;
  sources: BuilderSources;
  /** Resolved records so canvas previews match the public renderer exactly. */
  previewSources: PageSources;
  /** Live header/footer settings, shown around the canvas for context. */
  chrome: { appearance: AppearanceValues; content: SiteContentValues };
}) {
  const [layout, setLayout] = useState<PageLayout>(page.layout);
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [status, setStatus] = useState(page.status);
  const [isHome, setIsHome] = useState(page.isHome);
  const [colors, setColors] = useState<ColorOverrides>(page.colors ?? emptyColorOverrides);
  /**
   * Which style slot the inspector is editing — a block's own style, or one of
   * the parts inside it, such as a story link's icon.
   *
   * Tagged with the block it was opened from so selecting a different block
   * drops back to that block's settings rather than styling it through a panel
   * opened for another.
   */
  const [styleTarget, setStyleTarget] = useState<
    { blockId: string; target: StyleTarget } | null
  >(null);
  const [savedBlocks, setSavedBlocks] = useState(sources.savedBlocks);
  const [styles, setStyles] = useState(sources.styles);

  // The server preloads story views for the bindings the *saved* layout had.
  // A container bound during this session has none, so its story slots would
  // sit on placeholders until the page was saved and reloaded — these fetch the
  // missing views so the canvas shows the real story straight away.
  const [fetchedViews, setFetchedViews] = useState<Record<string, StoryView>>({});
  const requested = useRef(new Set<string>());
  const boundStories = useMemo(() => containerStoryKeys(layout).join(","), [layout]);

  useEffect(() => {
    for (const key of boundStories ? boundStories.split(",") : []) {
      const preloaded =
        key === "latest" ? previewSources.latestStoryView : previewSources.storyViews[key];
      if (preloaded || requested.current.has(key)) continue;
      requested.current.add(key);

      fetch(`/api/admin/stories/${key}/view`)
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (result?.view) {
            setFetchedViews((current) => ({ ...current, [key]: result.view }));
          }
        })
        .catch(() => {
          // Left unfetched: the slot keeps its placeholder and a later edit
          // to the binding will try again.
          requested.current.delete(key);
        });
    }
  }, [boundStories, previewSources]);

  // The same problem for collections a container binds, solved the same way.
  const [fetchedCollections, setFetchedCollections] = useState<
    Record<string, ResolvedCollection>
  >({});
  const boundCollections = useMemo(
    () => containerCollectionKeys(layout).join(","),
    [layout]
  );

  useEffect(() => {
    for (const key of boundCollections ? boundCollections.split(",") : []) {
      const preloaded =
        key === "latest" ? previewSources.latestCollection : previewSources.collections[key];
      const marker = `collection:${key}`;
      if (preloaded || requested.current.has(marker)) continue;
      requested.current.add(marker);

      fetch(`/api/admin/collections/${key}/view`)
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (result?.collection) {
            setFetchedCollections((current) => ({ ...current, [key]: result.collection }));
          }
        })
        .catch(() => {
          requested.current.delete(marker);
        });
    }
  }, [boundCollections, previewSources]);

  const canvasSources: PageSources = {
    ...emptyPageSources,
    ...previewSources,
    // Resolved on the server, so a previewed calendar highlights the same day
    // the published page will.
    calendarToday: sources.calendarToday,
    calendarDefaultStyleId: sources.calendarDefaultStyleId,
    // The canvas draws the real calendar, so a style picked here has to reach
    // it — otherwise choosing one changes nothing until the page is published.
    calendarStyles: Object.fromEntries(
      sources.calendarStyles.map((style) => [style._id, style])
    ),
    calendarLayouts: sources.calendarLayouts,
    storyViews: { ...previewSources.storyViews, ...fetchedViews },
    latestStoryView: fetchedViews.latest ?? previewSources.latestStoryView,
    collections: { ...previewSources.collections, ...fetchedCollections },
    latestCollection: fetchedCollections.latest ?? previewSources.latestCollection,
    shapes: Object.fromEntries(
      sources.shapes.map((shape) => [shape.slug, { viewBox: shape.viewBox, paths: shape.paths }])
    ),
  };

  // Calendar Styles come from records rather than from the layout, so the
  // canvas cannot derive them the way it derives a block's per-view overrides —
  // it has to be handed the same sheet the published page receives.
  const calendarStylesCss = sources.calendarStyles
    .map(calendarStyleCss)
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <form action={savePageAction} id="page-form">
        {page._id ? <input type="hidden" name="id" value={page._id} /> : null}
        <input type="hidden" name="layout" value={JSON.stringify(layout)} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="status" value={status} />
        {isHome ? <input type="hidden" name="isHome" value="on" /> : null}
        <input type="hidden" name="colors" value={JSON.stringify(colors)} />
      </form>

      <LayoutBuilder
        layout={layout}
        onChange={setLayout}
        canvasClassName="has-site-chrome"
        canvasStyle={colorOverrideStyle(colors)}
        documentSettings={
          <ColorOverrideFields colors={colors} onChange={setColors} scopeLabel="page" />
        }
        canvasHeader={
          <>
            <ChromeStyle
              appearance={chrome.appearance}
              scope=".builder-canvas.has-site-chrome"
            />
            <PreviewHeader appearance={chrome.appearance} content={chrome.content} />
          </>
        }
        canvasFooter={
          <PreviewFooter appearance={chrome.appearance} content={chrome.content} />
        }
        palette={PAGE_PALETTE}
        createBlock={(type) => {
          // A bound container can hold story or collection slots, each with
          // their own defaults (meta fields, date format, media sizing).
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
        blockLabel={(block) => BLOCK_LABELS[block.type] ?? block.type}
        renderPreview={(block, container) => {
          if (isStoryTemplateBlock(block)) {
            // Resolved the same way the published page resolves it.
            const story =
              container?.storySource === "latest"
                ? canvasSources.latestStoryView
                : container?.storySource === "specific"
                  ? canvasSources.storyViews[container.storyId]
                  : null;
            return (
              <StoryBlockView
                block={block as unknown as StoryTemplateBlock}
                story={story ?? emptyStoryView}
                showPlaceholders
              />
            );
          }

          if (isCollectionSlotBlock(block)) {
            // Resolved the same way the published page resolves it.
            const collection =
              container?.collectionSource === "latest"
                ? canvasSources.latestCollection
                : container?.collectionSource === "specific"
                  ? canvasSources.collections[container.collectionId]
                  : null;
            return (
              <CollectionBlockView
                block={block as unknown as CollectionSlotBlock}
                collection={collection ?? null}
                showPlaceholders
              />
            );
          }

          return <BlockView block={block} sources={canvasSources} interactive={false} />;
        }}
        renderInspector={(block, update, context) =>
          // The style editor takes over the inspector rather than opening over
          // the canvas, so the page it is styling stays in view.
          styleTarget?.blockId === block.id ? (
            <InspectorStylePanel
              block={block}
              target={styleTarget.target}
              view={context.viewport}
              fonts={sources.fonts}
              savedStyles={styles.map((style) => ({
                _id: style._id,
                name: style.name,
                slug: style.slug,
              }))}
              update={update}
              onClose={() => setStyleTarget(null)}
              onCreateNamedStyle={async (input) => {
                const created = await createNamedStyleAction(input);
                if (!created) return null;
                setStyles((current) => [
                  ...current,
                  { _id: created.slug, name: created.name, slug: created.slug },
                ]);
                return created.slug;
              }}
            />
          ) : (
            <PageBlockInspector
              block={block}
              update={update}
              sources={sources}
              context={context}
              onEditStyle={(target) => setStyleTarget({ blockId: block.id, target })}
            />
          )
        }
        // Calendar Styles are records, not part of the layout, so the canvas
        // cannot derive them — it has to be handed the same sheet the page gets.
        extraCss={calendarStylesCss}
        supportsContainers
        savedBlocks={savedBlocks}
        boundBackgroundMedia={(container) => {
          // Resolved exactly as the published page resolves it, so a bound
          // background looks the same in both.
          const story =
            container.storySource === "latest"
              ? canvasSources.latestStoryView
              : container.storySource === "specific"
                ? canvasSources.storyViews[container.storyId]
                : null;
          const collection =
            container.collectionSource === "latest"
              ? canvasSources.latestCollection
              : container.collectionSource === "specific"
                ? canvasSources.collections[container.collectionId]
                : null;

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
        onSaveBlock={async (name, icon, block) => {
          // A fresh id, so dropping the saved block onto a page never collides
          // with the container it was saved from.
          const saved = await saveBlockAction(
            name,
            icon,
            JSON.stringify({ ...block, id: `block-${Date.now()}` })
          );
          if (!saved) return;
          setSavedBlocks((current) => [
            // Saving under an existing name replaces that entry.
            ...current.filter((item) => item._id !== saved._id),
            saved,
          ]);
        }}
        onDeleteSavedBlock={async (id) => {
          await deleteSavedBlockAction(id);
          setSavedBlocks((current) => current.filter((saved) => saved._id !== id));
        }}
        exitHref="/admin/pages"
        exitLabel="Pages"
        topbar={
          <>
            <input
              className="input"
              style={{ maxWidth: "14rem" }}
              value={title}
              placeholder="Page title"
              onChange={(event) => setTitle(event.target.value)}
            />
            <input
              className="input"
              style={{ maxWidth: "12rem" }}
              value={slug}
              placeholder="slug"
              onChange={(event) => setSlug(event.target.value)}
            />
            <select
              className="input"
              style={{ maxWidth: "8rem" }}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={isHome}
                onChange={(event) => setIsHome(event.target.checked)}
              />
              Home page
            </label>
            <button type="submit" form="page-form" className="btn btn-primary btn-sm">
              Save
            </button>
          </>
        }
      />
    </>
  );
}
