import { normalizeDeck, newObject, type Deck, type SlideObject } from "./presentation";
import {
  normalizePublicationPages, normalizeRepeatedBlocks, normalizePageTemplates,
  normalizeCanvasSize, normalizeAudio, normalizeSlideshow, inheritedBlocks,
  effectiveBackground, POST_VIEW_PRESETS, normalizePublicationBlock,
  createPublicationPage, type PublicationBlock,
} from "./publication-layout";

export const PUBLICATION_MIGRATION_VERSION = 1;
export type Conversion = { deck: Deck; variants: Record<string, Deck>; defaultView: string; warnings: string[] };

/** Pure conversion: no writes, external lookups or flattening to screenshots. */
export function convertPublication(source: Record<string, any>): Conversion {
  if (String(source.title || "").length > 200) throw new Error("Title exceeds 200 characters; original retained for review.");
  if ((source.pages?.length ?? 0) > 200) throw new Error("More than 200 pages; original retained for review.");
  const pages = normalizePublicationPages(source.pages);
  if (!pages.length) {
    if (source.status === "published") throw new Error("Published publication has no pages; original retained for review.");
    pages.push({ ...createPublicationPage(), id: "blank-slide" });
  }
  const repeated = normalizeRepeatedBlocks(source.repeatedBlocks);
  const layouts = normalizePageTemplates(source.pageTemplates);
  if ((source.repeatedBlocks?.length ?? 0) > 100 || (source.pageTemplates?.length ?? 0) > 50)
    throw new Error("Publication exceeds layout limits; original retained.");
  const warnings = new Set<string>();
  if (!source.pages?.length) warnings.add("Empty draft initialized with one blank slide.");
  for (const layout of source.pageTemplates || []) if ((layout.blocks?.length || 0) > 100)
    throw new Error("A reusable layout exceeds 100 objects; original retained.");
  const audio = normalizeAudio(source.audio);
  const slideshow = normalizeSlideshow(source.slideshow);
  function object(block: PublicationBlock, id: string): SlideObject {
    // Keep the original block vocabulary where style/interaction semantics differ.
    // The presentation editor can move, resize, group and edit these objects.
    return {
      ...newObject("publication"), id, x: block.x, y: block.y,
      width: block.width, height: block.height, rotation: block.rotation,
      groupId: block.groupId, publication: { ...block },
      html: block.html || "", mediaId: block.mediaId || "", mediaUrl: block.mediaUrl || "",
    };
  }
  function build(view: { id: string; width: number; height: number }): Deck {
    const slides = pages.map((page, index) => {
      if ((source.pages?.[index]?.blocks?.length ?? 0) > 300)
        throw new Error(`Page ${index + 1} exceeds the source block limit.`);
      const overrides = page.viewOverrides[view.id] || [];
      const own = page.blocks.map(block => {
        const override = overrides.find(item => item.id === block.id);
        return override ? normalizePublicationBlock({ ...block, ...override })! : block;
      });
      const blocks = [...inheritedBlocks(page, repeated, layouts), ...own]
        .map((block, order) => ({ block, order }))
        .sort((a, b) => a.block.zIndex - b.block.zIndex || a.order - b.order);
      if (blocks.length > 100) throw new Error(`Page ${index + 1} has ${blocks.length} objects (maximum 100); original retained.`);
      const background = effectiveBackground(page, layouts);
      return {
        id: page.id, name: page.name, notes: "", background: background.backgroundColor,
        publicationBackground: background, audioUrl: page.audioUrl,
        hidden: page.hidden, showBack: page.showBack, backLabel: page.backLabel,
        objects: blocks.map(({ block }, n) => object(block, `page-${index}-object-${n}`)),
      };
    });
    if (layouts.length || repeated.length) warnings.add("Inherited blocks materialized on slides; changing a saved layout does not update existing slides.");
    return normalizeDeck({
      title: source.title, aspect: "custom", pageUnit: "px",
      customWidth: view.width, customHeight: view.height,
      slides, layouts: layouts.map((layout, index) => ({
        id: layout.id, name: layout.name, slide: {
          id: `layout-${index}`, name: layout.name, notes: "", background: layout.backgroundColor,
          publicationBackground: layout,
          objects: layout.blocks.map((block, n) => object(block, `layout-${index}-object-${n}`)),
        },
      })),
      autoPlay: slideshow.enabled && slideshow.autoplay, loop: slideshow.loop,
      duration: slideshow.intervalMs / 1000,
      transition: source.transition === "none" ? "cut" : source.transition || "fade",
      audioUrl: audio.url, audioLoop: audio.loop, audioAutoplay: audio.autoplay, audioVolume: audio.volume,
    });
  }
  const variants: Record<string, Deck> = {};
  if (source.kind === "post") {
    const views = source.postViews?.length ? source.postViews : POST_VIEW_PRESETS;
    for (const view of views) {
      if (!view.id || ["__proto__", "constructor", "prototype"].includes(view.id) || Object.hasOwn(variants, view.id))
        throw new Error("Invalid or duplicate post view ID.");
      variants[view.id] = build({ id: view.id, ...normalizeCanvasSize(view) });
    }
    const defaultView = Object.hasOwn(variants, source.postView || "") ? source.postView : Object.keys(variants)[0];
    return { deck: variants[defaultView], variants, defaultView, warnings: [...warnings] };
  }
  return { deck: build({ id: "", ...normalizeCanvasSize(source.presentationSize) }), variants, defaultView: "", warnings: [...warnings] };
}
