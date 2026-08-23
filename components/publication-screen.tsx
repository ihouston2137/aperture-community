import {
  normalizeAudio,
  normalizePageTemplates,
  normalizeCanvasSize,
  normalizePublicationPages,
  normalizeRepeatedBlocks,
  normalizeSlideshow,
  POST_VIEW_PRESETS,
  type Transition,
} from "@/lib/publication-layout";
import { loadPublicationSources } from "@/lib/publication-sources";

import { PublicationViewer } from "./publication-viewer";

/**
 * Shared server wrapper for the four places a publication is displayed:
 * `/zines/[slug]`, `/present/[slug]`, `/post/[slug]` and the admin preview.
 * Keeping one wrapper is what stops the preview and the published page from
 * drifting apart.
 */
export async function PublicationScreen({
  doc,
  view,
  showControls = true,
}: {
  doc: Record<string, any>;
  /** Social posts only: which named view to render. */
  view?: string;
  showControls?: boolean;
}) {
  const pages = normalizePublicationPages(doc.pages);
  const repeatedBlocks = normalizeRepeatedBlocks(doc.repeatedBlocks);
  const pageTemplates = normalizePageTemplates(doc.pageTemplates);
  // Layout blocks are media too, so they must resolve like any other.
  const sources = await loadPublicationSources(pages, [
    ...repeatedBlocks,
    ...pageTemplates.flatMap((item) => item.blocks),
  ]);

  const postViews =
    Array.isArray(doc.postViews) && doc.postViews.length > 0
      ? doc.postViews
      : [...POST_VIEW_PRESETS];

  // A post is published as one of its named shapes: the one asked for by the
  // URL, else the one the editor last worked in. Falling straight through to
  // the first preset is what made every post render square whatever it was set
  // to.
  const chosenView = view || doc.postView || "";
  const canvas =
    doc.kind === "post"
      ? normalizeCanvasSize(
          postViews.find((preset: any) => preset.id === chosenView) ?? postViews[0]
        )
      : normalizeCanvasSize(doc.presentationSize);

  return (
    <PublicationViewer
      pages={pages}
      repeatedBlocks={repeatedBlocks}
      pageTemplates={pageTemplates}
      canvas={canvas}
      transition={(doc.transition ?? "fade") as Transition}
      slideshow={normalizeSlideshow(doc.slideshow)}
      audio={normalizeAudio(doc.audio)}
      sources={sources}
      showControls={showControls}
    />
  );
}
