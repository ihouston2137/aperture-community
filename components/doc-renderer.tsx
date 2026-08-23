"use client";

import {
  colorOverrideStyle,
  emptyColorOverrides,
  type ColorOverrides,
} from "@/lib/color-overrides";
import {
  collectDocElementCss,
  isDocTemplateBlock,
  type DocTemplateBlock,
} from "@/lib/doc-template-layout";
import type { DocNode, DocView } from "@/lib/doc-tree";
import type { PageBlock, PageRow } from "@/lib/page-layout";
import { layoutResponsiveCss } from "@/lib/responsive-style";
import type { PageSources } from "@/lib/page-source-types";

import { BlockWrapper, ColumnShell, RowShell } from "./block-primitives";
import { DocSlotView } from "./doc-slot-blocks";
import { BlockView } from "./page-blocks";

/**
 * Renders a document through its template. The template's doc slots come from
 * the document; every other block is an ordinary page block, so a template can
 * carry its own header, sidebar, containers and the rest.
 */
export function DocRenderer({
  layout,
  doc,
  tree,
  sources,
  colors = emptyColorOverrides,
}: {
  layout: PageRow[];
  doc: DocView;
  /** The published documentation tree, for the contents slot. */
  tree: DocNode[];
  /** Records referenced by the template's page blocks. */
  sources: PageSources;
  colors?: ColorOverrides;
}) {
  // Two sheets, joined into one. Per-view overrides on the slots themselves are
  // reachable from the layout; element styles are not, because they hang off a
  // content slot rather than off a block's style keys. The builder canvas emits
  // both as well, and a slot styled in one but not the other is the bug this
  // pairing exists to prevent.
  const css = [layoutResponsiveCss(layout), collectDocElementCss(layout)]
    .filter(Boolean)
    .join("\n");

  return (
    <article className="doc-render" style={colorOverrideStyle(colors)}>
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {layout.map((row) => (
        <RowShell key={row.id} row={row}>
          {row.columns.map((column) => (
            <ColumnShell key={column.id} column={column}>
              {column.blocks.map((block) => (
                // The same wrapper the page renderer uses, so a doc slot is
                // sized and placed exactly as any other block would be.
                <BlockWrapper key={block.id} block={block}>
                  {isDocTemplateBlock(block) ? (
                    <DocSlotView
                      block={block as unknown as DocTemplateBlock}
                      doc={doc}
                      tree={tree}
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
    </article>
  );
}
