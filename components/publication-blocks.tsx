"use client";

import type { CSSProperties } from "react";

import { customStyleClassName } from "@/lib/custom-style-css";
import type {
  PublicationBlock,
  PublicationTable,
  PublicationTableCell,
} from "@/lib/publication-layout";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { plainTextToRichText, richTextToPlainText } from "@/lib/rich-text";
import { shapeSurfaceOf, styleValuesToCss } from "@/lib/style-values";

import { LucideIconView } from "./lucide-icon";
import { QrCode } from "./qr-code";
import { CustomShapeView, Shape } from "./shape";
import { normalizeSponsorScroll, type ShapeKind } from "@/lib/page-layout";
import { SponsorScroll, type SponsorLogo } from "./sponsor-scroll";

export type PublicationSources = {
  /** Media asset id -> url, so blocks that only store an id still resolve. */
  media: Record<string, string>;
  shapes: Record<string, { viewBox: string; paths: string[] }>;
  stories: Record<string, { headline: string; slug: string; featureMediaUrl: string }>;
  collections: Record<string, { name: string; slug: string }>;
  forms: Record<string, { title: string; slug: string }>;
  /**
   * Logos for each sponsor scroll block, keyed by block id.
   *
   * Keyed by block rather than by level, because two scrolls in one
   * publication can name different levels and each is filtered for itself.
   */
  sponsorLogos: Record<string, SponsorLogo[]>;
};

export const emptyPublicationSources: PublicationSources = {
  sponsorLogos: {},
  media: {},
  shapes: {},
  stories: {},
  collections: {},
  forms: {},
};

/**
 * A block's words, wherever they were stored.
 *
 * Text on a publication canvas is rich text and lives in `html`. A block saved
 * before that carried plain words — in `text` for a text block or a shape's
 * label, in `label` for a button — and `normalizePublicationBlock` lifts them
 * across on read. This covers the case where a block reaches a renderer
 * without having passed through it, which the editor's own in-flight state
 * does whenever a block has just been made.
 */
export function blockHtml(block: PublicationBlock): string {
  if (block.html) return block.html;
  const plain = block.text ?? block.label ?? "";
  return plain ? plainTextToRichText(plain) : "";
}

/** Absolute placement in canvas units — the stage handles scaling. */
export function publicationBlockStyle(block: PublicationBlock): CSSProperties {
  return {
    left: `${block.x}px`,
    top: `${block.y}px`,
    width: `${block.width}px`,
    height: `${block.height}px`,
    transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
    zIndex: block.zIndex,
  };
}

/**
 * One block inside a table cell.
 *
 * A cell is a box, so its content flows: the block's `x`, `y` and `zIndex` say
 * nothing here, and its `width` and `height` become a maximum rather than a
 * placement. Words take the height they need; a picture, an icon or a shape
 * takes the height it was given, so a row of logos stays a row of logos when
 * the column beside it grows.
 */
function CellContentView({
  block,
  sources,
}: {
  block: PublicationBlock;
  sources: PublicationSources;
}) {
  const flows = block.type === "richText" || block.type === "button";

  return (
    <div
      className="pub-cell-item"
      style={{
        width: "100%",
        maxWidth: `${block.width}px`,
        height: flows ? "auto" : `${block.height}px`,
      }}
    >
      <PublicationBlockView block={block} sources={sources} interactive={false} />
    </div>
  );
}

/**
 * The grid.
 *
 * Drawn with real table elements so a heading row is a heading row to anything
 * reading the page aloud, and so the export — which photographs the rendered
 * page — gets the table it can see.
 */
export function PublicationTableView({
  table,
  sources,
  className,
  style,
  renderCell,
}: {
  table: PublicationTable | undefined;
  sources: PublicationSources;
  className?: string;
  style?: CSSProperties;
  /** The editor draws its own cells, so it can put a caret in one. */
  renderCell?: (
    cell: PublicationTableCell,
    at: { row: number; column: number }
  ) => React.ReactNode;
}) {
  if (!table) return <div className="pb-empty-drop">No table</div>;

  const grid = styleValuesToCss(table.tableStyle) as CSSProperties | undefined;
  const cellCss = styleValuesToCss(table.cellStyle) as CSSProperties | undefined;
  const headerCss = styleValuesToCss(table.headerStyle) as CSSProperties | undefined;

  return (
    <div
      className={`pub-table-box${className ? ` ${className}` : ""}`}
      style={{ width: "100%", height: "100%", ...style }}
    >
      <table className="pub-table" style={grid}>
        <colgroup>
          {table.columns.map((width, index) => (
            <col key={index} style={{ width: `${width}px` }} />
          ))}
        </colgroup>
        <tbody>
          {table.cells.map((row, rowIndex) => (
            <tr key={rowIndex} style={{ height: `${table.rows[rowIndex]}px` }}>
              {row.map((cell, columnIndex) => {
                const heading =
                  (table.headerRow && rowIndex === 0) ||
                  (table.headerColumn && columnIndex === 0);
                const Cell = heading ? "th" : "td";
                const banded =
                  table.bandedRows && !heading && rowIndex % 2 === 1;

                return (
                  <Cell
                    key={cell.id}
                    className={`pub-table-cell${banded ? " is-banded" : ""}`}
                    style={{
                      ...cellCss,
                      ...(heading ? headerCss : undefined),
                      ...(styleValuesToCss(cell.style) as CSSProperties),
                    }}
                  >
                    {renderCell ? (
                      renderCell(cell, { row: rowIndex, column: columnIndex })
                    ) : (
                      <div className="pub-cell-stack">
                        {cell.content.map((item) => (
                          <CellContentView
                            key={item.id}
                            block={item}
                            sources={sources}
                          />
                        ))}
                      </div>
                    )}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PublicationBlockView({
  block,
  sources,
  interactive = true,
  onNavigate,
}: {
  block: PublicationBlock;
  sources: PublicationSources;
  interactive?: boolean;
  onNavigate?: (pageId: string) => void;
}) {
  /*
   * A shadow here follows what is drawn, not the block's box.
   *
   * A publication block is a rectangle on a canvas holding a word, an icon or
   * a picture, and the rectangle is a place rather than a thing — a shadow of
   * it is a shadow of nothing anybody put there. `drop` follows the letters of
   * a heading and the outline of a cut-out image, and still follows the box
   * where the block carries a background or a border, which is the only case
   * where the box is a thing.
   */
  const textProps = block.styleSlug
    ? { className: customStyleClassName(block.styleSlug), style: undefined }
    : { className: "", style: styleValuesToCss(block.textStyle, "drop") };

  // Blocks may carry only a media id (older documents) or an explicit url.
  const mediaUrl =
    block.mediaUrl || (block.mediaId ? sources.media[block.mediaId] ?? "" : "");

  let content: React.ReactNode = null;

  switch (block.type) {
    case "richText":
      content = (
        <div
          className={`rich-text ${textProps.className}`.trim()}
          style={{ width: "100%", height: "100%", overflow: "hidden", ...textProps.style }}
          dangerouslySetInnerHTML={{ __html: blockHtml(block) }}
        />
      );
      break;

    case "image":
      content = mediaUrl ? (
        // The size is set here, not by a wrapper class: the editor and the
        // viewer wrap blocks in different elements, and `object-fit` does
        // nothing until the image is given a box to fit into.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={textProps.className || undefined}
          src={protectedMediaUrl(mediaUrl)}
          alt={block.alt ?? ""}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: block.objectFit ?? "cover",
            ...textProps.style,
          }}
        />
      ) : (
        <div className="pb-empty-drop">No image</div>
      );
      break;

    case "video":
      content = mediaUrl ? (
        <video
          className={textProps.className || undefined}
          src={protectedMediaUrl(mediaUrl)}
          autoPlay={block.autoplay}
          loop={block.loop}
          muted={block.muted !== false}
          controls={Boolean(block.controls)}
          playsInline
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: block.objectFit ?? "cover",
            ...textProps.style,
          }}
        />
      ) : (
        <div className="pb-empty-drop">No video</div>
      );
      break;

    case "button":
      content = (
        // A div rather than a span: a button's face is rich text now, and rich
        // text is paragraphs, which cannot live inside an inline element.
        <div
          className={`pb-button rich-text ${textProps.className}`.trim()}
          style={{ width: "100%", height: "100%", ...textProps.style }}
          dangerouslySetInnerHTML={{ __html: blockHtml(block) }}
        />
      );
      break;

    case "qrCode":
      content = (
        <div style={{ width: "100%", height: "100%" }}>
          <QrCode
            value={block.qrValue ?? ""}
            color={block.color}
            size={block.width / 16}
          />
        </div>
      );
      break;

    case "icon":
      content = (
        // Lucide icons stroke in `currentColor`, so the style's text colour is
        // the icon's colour and everything else — spacing, background, border,
        // shadow — dresses the box it sits in.
        <span
          className={textProps.className || undefined}
          style={{
            color: block.color,
            display: "block",
            width: "100%",
            height: "100%",
            ...textProps.style,
          }}
        >
          <LucideIconView name={block.iconName} width="100%" height="100%" />
        </span>
      );
      break;

    case "shape":
    case "customShape": {
      /*
       * The shape's own style describes it: background colour is the fill,
       * border is the outline, radius rounds a rectangle's corners. `color` is
       * still read underneath so publications authored before the style panel
       * keep the fill they were given.
       *
       * Text is the other half, styled by `textStyle`. Placed inside, it is
       * handed to the shape, which clips it to its outline — the same
       * constraint a page block gets, from the same component.
       */
      /*
       * Read apart by the same function the page builder uses.
       *
       * The two used to describe a shape in two places that happened to agree;
       * one of them can stop agreeing. `shapeSurfaceOf` is now the only place
       * that says what a fill, an outline, a corner and a shadow mean on a
       * drawing.
       */
      const surface = shapeSurfaceOf(block.shapeStyle);
      const html = blockHtml(block);
      // Rich text is markup even when it says nothing, so an empty paragraph
      // must not count as words the shape has to make room for.
      const hasWords = richTextToPlainText(html).trim() !== "";
      const above = hasWords && (block.textPlacement ?? "inside") === "above";
      const words = hasWords ? (
        <span className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />
      ) : null;

      /*
       * The shape's own shadow, cast by its outline.
       *
       * A shape is drawn inside its block's box and is very often not the
       * shape of it — a circle, a star, a speech bubble — so a shadow of the
       * box would sit behind the shape in a rectangle nobody drew.
       */
      const shapeShadow = surface.shadow
        ? (styleValuesToCss(surface.shadow, "drop") as CSSProperties)
        : undefined;

      const common = {
        color: surface.color ?? block.color ?? "#2b6cb0",
        borderWidth: surface.borderWidth ?? 0,
        borderColor: surface.borderColor ?? "#000000",
        text: above ? null : words,
        textClassName: textProps.className || undefined,
        textStyle: textProps.style,
        // A block's box is fixed, so text above it takes its share of the
        // height rather than pushing the shape out of the bottom.
        style: above
          ? ({
              width: "100%",
              height: "auto",
              flex: "1 1 0",
              minHeight: 0,
              ...shapeShadow,
            } as CSSProperties)
          : shapeShadow,
      };

      const shape =
        block.type === "shape" ? (
          <Shape
            {...common}
            kind={(block.shapeKind ?? "rectangle") as ShapeKind}
            width={block.width / 16}
            height={block.height / 16}
            radius={surface.radius ?? (block.radius ?? 0) / 16}
          />
        ) : (
          <CustomShapeView
            {...common}
            shape={block.shapeSlug ? sources.shapes[block.shapeSlug] : undefined}
            width={block.width / 16}
            height={block.height / 16}
          />
        );

      content = above ? (
        <div className="pub-shape-stack">
          <span
            className={`pub-shape-label${
              textProps.className ? ` ${textProps.className}` : ""
            }`}
            style={textProps.style}
          >
            {words}
          </span>
          {shape}
        </div>
      ) : (
        shape
      );
      break;
    }

    case "table": {
      content = (
        <PublicationTableView
          table={block.table}
          sources={sources}
          className={textProps.className || undefined}
          style={textProps.style}
        />
      );
      break;
    }

    case "story": {
      const story = block.storyId ? sources.stories[block.storyId] : undefined;
      content = story ? (
        <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
          {story.featureMediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={protectedMediaUrl(story.featureMediaUrl)}
              alt=""
              style={{ objectFit: "cover" }}
            />
          ) : null}
          <strong>{story.headline}</strong>
        </div>
      ) : (
        <div className="pb-empty-drop">No story selected</div>
      );
      break;
    }

    case "collection": {
      const collection = block.collectionId ? sources.collections[block.collectionId] : undefined;
      content = (
        <div className="pb-empty-drop">
          {collection ? `Collection: ${collection.name}` : "No collection selected"}
        </div>
      );
      break;
    }

    case "form": {
      const form = block.formId ? sources.forms[block.formId] : undefined;
      content = (
        <div className="pb-empty-drop">
          {form ? `Form: ${form.title}` : "No form selected"}
        </div>
      );
      break;
    }

    case "sponsorScroll": {
      /*
       * Drawn for real, unlike the story, collection and form blocks above.
       *
       * Those stand for a page somewhere else and can only be a label on a
       * slide; a run of logos is the whole of what it is, and a publication
       * showing a placeholder where the sponsors should be would be missing
       * the point of putting it on the slide.
       *
       * The block's own box is the band, in canvas units — the stage scales
       * the lot, so a logo drawn at the block's height is drawn at the right
       * size whatever the slide is shown at.
       */
      content = (
        <SponsorScroll
          settings={normalizeSponsorScroll(block.sponsorScroll)}
          logos={sources.sponsorLogos[block.id] ?? []}
          height={`${block.height}px`}
          designTime={!interactive}
        />
      );
      break;
    }
  }

  // Click actions only apply on the published viewer, never in the editor.
  if (interactive && block.clickAction === "link" && block.clickTarget) {
    return (
      <a
        href={block.clickTarget}
        target={block.newTab ? "_blank" : undefined}
        rel={block.newTab ? "noreferrer" : undefined}
        style={{ display: "block", width: "100%", height: "100%" }}
      >
        {content}
      </a>
    );
  }

  if (interactive && block.clickAction === "page" && block.clickTarget && onNavigate) {
    return (
      <button
        type="button"
        onClick={() => onNavigate(block.clickTarget!)}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          background: "none",
          border: 0,
          padding: 0,
        }}
      >
        {content}
      </button>
    );
  }

  return <>{content}</>;
}
