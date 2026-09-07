"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { customStyleClassName } from "@/lib/custom-style-css";
import type {
  PublicationBlock,
  PublicationTable,
  PublicationTableCell,
} from "@/lib/publication-layout";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { plainTextToRichText, richTextToPlainText } from "@/lib/rich-text";
import { shapeSurfaceOf, styleValuesToCss, type StyleValues } from "@/lib/style-values";
import { resolveStyle, tableCellCss, tableScheme } from "@/lib/table-style";

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

/**
 * How a block's words are dressed: its named style, or its own.
 *
 * Shared because the in-place editor has to wear exactly the same thing. It
 * stands over the block while somebody types, and if it does not carry the
 * block's size, colour and spacing then the words move the moment they are
 * clicked and move back when they are let go — so what is being judged while
 * editing is not what will be published.
 *
 * A shadow here follows what is drawn, not the block's box: a publication block
 * is a rectangle on a canvas holding a word, an icon or a picture, and the
 * rectangle is a place rather than a thing. `drop` follows the letters of a
 * heading and the outline of a cut-out image, and still follows the box where
 * the block carries a background or a border, which is the only case where the
 * box is a thing.
 */
export function blockTextProps(block: PublicationBlock): {
  className: string;
  style: CSSProperties | undefined;
} {
  return block.styleSlug
    ? { className: customStyleClassName(block.styleSlug), style: undefined }
    : { className: "", style: styleValuesToCss(block.textStyle, "drop") };
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

/** Where content sits across a cell and down it, from the resolved style. */
const ACROSS = { left: "flex-start", center: "center", right: "flex-end", justify: "stretch" };
const DOWN = { top: "flex-start", middle: "center", bottom: "flex-end" };

/**
 * The one block a table cell holds.
 *
 * A cell is a box with room to spare, so where the block sits in it is a real
 * question — and for anything that is not words it is the *only* way to place
 * it. Words answer it with `text-align` and the cell's `vertical-align`; a
 * picture, an icon or a shape needs the box around it to do the placing, which
 * is what the flex wrapper is for.
 *
 * Its `x`, `y` and `zIndex` say nothing here. Its width and height are its own,
 * so a logo stays the size it was given while the column beside it grows —
 * except for words, which take the cell.
 */
export function CellBlockView({
  block,
  sources,
  align,
  textOverride,
}: {
  block: PublicationBlock;
  sources: PublicationSources;
  /** The cell's resolved alignment, which places anything that is not words. */
  align?: { x?: StyleValues["textAlign"]; y?: StyleValues["verticalAlign"] };
  /** Stands in for the words, so a shape in a cell is drawn while it is written on. */
  textOverride?: React.ReactNode;
}) {
  const flows = block.type === "richText" || block.type === "button";

  if (flows) {
    // Words fill the cell and align themselves; the cell's own `text-align`
    // and `vertical-align` are already doing the work.
    return (
      <div className="pub-cell-item" style={{ width: "100%" }}>
        <PublicationBlockView
          block={block}
          sources={sources}
          interactive={false}
          textOverride={textOverride}
        />
      </div>
    );
  }

  return (
    <div
      className="pub-cell-item"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        minHeight: `${block.height}px`,
        justifyContent: ACROSS[align?.x ?? "left"],
        alignItems: DOWN[align?.y ?? "top"],
      }}
    >
      <div style={{ width: `${block.width}px`, height: `${block.height}px`, maxWidth: "100%" }}>
        <PublicationBlockView
          block={block}
          sources={sources}
          interactive={false}
          textOverride={textOverride}
        />
      </div>
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
  cellProps,
  onMeasured,
}: {
  table: PublicationTable | undefined;
  sources: PublicationSources;
  className?: string;
  style?: CSSProperties;
  /** The editor draws its own cells, so it can put a caret in one. */
  renderCell?: (
    cell: PublicationTableCell,
    at: { row: number; column: number },
    /** What the cell ended up wearing, so the editor can place content too. */
    resolved: StyleValues
  ) => React.ReactNode;
  /**
   * Handlers put on the cell itself.
   *
   * The whole cell is the target, not the content standing in it: a cell with
   * one short word in it is mostly empty, and pressing that emptiness is
   * pressing the cell. The padding belongs to the cell too, so it can only be
   * caught here.
   */
  cellProps?: (
    cell: PublicationTableCell,
    at: { row: number; column: number }
  ) => React.HTMLAttributes<HTMLTableCellElement>;
  /**
   * How tall the grid actually came out.
   *
   * Row heights are minimums, so words that need another line make the table
   * taller than the numbers say. The editor uses this to grow the block's box
   * to what was drawn; the viewer has no use for it.
   */
  onMeasured?: (height: number) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = box.current;
    if (!node || !onMeasured) return;

    const observer = new ResizeObserver(([entry]) => {
      onMeasured(entry.contentRect.height);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [onMeasured]);

  if (!table) return <div className="pb-empty-drop">No table</div>;

  const scheme = tableScheme(table.accentColor);

  return (
    <div
      ref={box}
      className={`pub-table-box${className ? ` ${className}` : ""}`}
      style={{ width: "100%", ...style }}
    >
      <table
        className="pub-table"
        style={{
          ...styleValuesToCss(table.tableStyle),
          /* Cells share their lines until a gap is asked for, at which point
             they become tiles and each draws its own. */
          borderCollapse: table.cellSpacing ? "separate" : "collapse",
          borderSpacing: table.cellSpacing ? `${table.cellSpacing}px` : undefined,
        }}
      >
        <colgroup>
          {table.columns.map((column, index) => (
            <col key={index} style={{ width: `${column.size}px` }} />
          ))}
        </colgroup>
        <tbody>
          {table.cells.map((row, rowIndex) => (
            // A row height is a minimum: CSS treats it that way on a table row,
            // and so does everybody who has ever typed too much into a cell.
            <tr key={rowIndex} style={{ height: `${table.rows[rowIndex].size}px` }}>
              {row.map((cell, columnIndex) => {
                const heading =
                  (table.headerRow && rowIndex === 0) ||
                  (table.headerColumn && columnIndex === 0);
                const banded =
                  table.bandedRows &&
                  !heading &&
                  (table.headerRow ? rowIndex % 2 === 0 : rowIndex % 2 === 1);

                /*
                 * Everything with an opinion about this cell, weakest first.
                 * Resolved as values so that "no border" can beat a border set
                 * further up — see `resolveStyle`.
                 */
                const resolved = resolveStyle([
                  scheme.base,
                  table.cellStyle,
                  banded ? scheme.band : undefined,
                  heading ? scheme.header : undefined,
                  heading ? table.headerStyle : undefined,
                  table.columns[columnIndex].style,
                  table.rows[rowIndex].style,
                  cell.style,
                ]);

                const Cell = heading ? "th" : "td";

                return (
                  <Cell
                    key={cell.id}
                    className="pub-table-cell"
                    style={tableCellCss(resolved)}
                    {...cellProps?.(cell, { row: rowIndex, column: columnIndex })}
                  >
                    {renderCell ? (
                      renderCell(cell, { row: rowIndex, column: columnIndex }, resolved)
                    ) : (
                      <CellBlockView
                        block={cell.block}
                        sources={sources}
                        align={{ x: resolved.textAlign, y: resolved.verticalAlign }}
                      />
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
  textOverride,
  onNavigate,
}: {
  block: PublicationBlock;
  sources: PublicationSources;
  interactive?: boolean;
  /**
   * Stands in for the block's words, wherever they would have gone.
   *
   * The editor is put *in* the block rather than over it, so a shape being
   * written on is still drawn, the words are still clipped to its outline, and
   * the label above one still takes its own height. Somebody changing the
   * words on a star can see the star.
   */
  textOverride?: React.ReactNode;
  onNavigate?: (pageId: string) => void;
}) {
  const textProps = blockTextProps(block);

  // Blocks may carry only a media id (older documents) or an explicit url.
  const mediaUrl =
    block.mediaUrl || (block.mediaId ? sources.media[block.mediaId] ?? "" : "");

  let content: React.ReactNode = null;

  switch (block.type) {
    case "richText":
      content = textOverride ? (
        <div
          className={`rich-text ${textProps.className}`.trim()}
          style={{ width: "100%", height: "100%", ...textProps.style }}
        >
          {textOverride}
        </div>
      ) : (
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
      // A div rather than a span: a button's face is rich text now, and rich
      // text is paragraphs, which cannot live inside an inline element.
      content = textOverride ? (
        <div
          className={`pb-button rich-text ${textProps.className}`.trim()}
          style={{ width: "100%", height: "100%", ...textProps.style }}
        >
          {textOverride}
        </div>
      ) : (
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
      /*
       * Rich text is markup even when it says nothing, so an empty paragraph
       * must not count as words the shape has to make room for — unless the
       * words are being written, when the room has to be there to write in.
       */
      const hasWords = Boolean(textOverride) || richTextToPlainText(html).trim() !== "";
      const above = hasWords && (block.textPlacement ?? "inside") === "above";
      const words = textOverride ? (
        <span className="rich-text">{textOverride}</span>
      ) : hasWords ? (
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
