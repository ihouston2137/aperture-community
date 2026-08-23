"use client";

import { useState } from "react";

import {
  colorOverrideStyle,
  emptyColorOverrides,
  type ColorOverrides,
} from "@/lib/color-overrides";
import type { PageBlock, PageRow } from "@/lib/page-layout";
import type { PageSources } from "@/lib/page-source-types";
import type { StoryTemplateBlock, TemplateBlock } from "@/lib/story-template-layout";

import { BlockWrapper, ColumnShell, RowShell } from "./block-primitives";
import { MediaLightbox, type LightboxImage } from "./media-lightbox";
import { BlockView } from "./page-blocks";
import { StoryBlockView, isStoryTemplateBlock, type StoryView } from "./story-blocks";

export type { StoryView };

/**
 * Renders a story through its template. The template's story slots come from
 * the story; every other block is an ordinary page block, so a template can
 * carry its own headings, images, containers and the rest.
 */
export function StoryRenderer({
  layout,
  story,
  sources,
  colors = emptyColorOverrides,
}: {
  layout: PageRow[];
  story: StoryView;
  /** Records referenced by the template's page blocks. */
  sources: PageSources;
  /** The template's content colour overrides. */
  colors?: ColorOverrides;
}) {
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);

  return (
    <article className="story-render" style={colorOverrideStyle(colors)}>
      {layout.map((row) => (
        <RowShell key={row.id} row={row}>
          {row.columns.map((column) => (
            <ColumnShell key={column.id} column={column}>
              {(column.blocks as TemplateBlock[]).map((block) => (
                // The same wrapper the page renderer uses, so a story slot is
                // sized and placed exactly as the same slot inside a container.
                <BlockWrapper key={block.id} block={block}>
                  {isStoryTemplateBlock(block) ? (
                    <StoryBlockView
                      block={block as StoryTemplateBlock}
                      story={story}
                      onOpenLightbox={setLightbox}
                    />
                  ) : (
                    <BlockView block={block as PageBlock} sources={sources} />
                  )}
                </BlockWrapper>
              ))}
            </ColumnShell>
          ))}
        </RowShell>
      ))}

      <MediaLightbox image={lightbox} onClose={() => setLightbox(null)} />
    </article>
  );
}
