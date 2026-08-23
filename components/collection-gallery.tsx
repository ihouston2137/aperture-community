"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { reportImageView } from "@/components/analytics-beacon";
import { CollectionImageStage } from "@/components/collection-image-stage";
import { IconView } from "@/components/icons";
import { aspectRatioValue } from "@/lib/aspect-ratio";
import type { CollectionImage, ResolvedCollection } from "@/lib/collection-types";
import {
  META_FIELDS,
  styleSlotProps,
  type MetaField,
  type MetadataDisplay,
  type StyleSlot,
} from "@/lib/display-templates";
import { protectedMediaUrl } from "@/lib/protected-media-url";

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function metaValue(image: CollectionImage, field: MetaField): string {
  switch (field) {
    case "title":
      return image.title;
    case "caption":
      return image.caption;
    case "author":
      return image.author;
    case "captureDate":
      return formatDate(image.captureDate);
    case "location":
      return "";
    case "tags":
      return image.tags.join(", ");
    case "filename":
      return image.originalName;
    default:
      return "";
  }
}

function MetaList({
  image,
  display,
}: {
  image: CollectionImage;
  display: MetadataDisplay;
}) {
  // Declared order, not the order the fields were switched on, so the overlay
  // reads the same way the opened image does.
  const parts = META_FIELDS.filter((field) => display.fields.includes(field))
    .map((field) => ({ field, value: metaValue(image, field) }))
    .filter((part) => part.value);

  if (parts.length === 0) return null;

  return (
    <div>
      {parts.map((part) => {
        // Each field carries its own style, so a title and a caption in the
        // same overlay can look nothing like each other.
        const styled = styleSlotProps(display.fieldStyles?.[part.field]);
        return (
          <div
            key={part.field}
            data-meta-field={part.field}
            className={styled.className || undefined}
            style={styled.style}
          >
            {part.value}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The page's share control: one button that copies the collection's URL.
 *
 * Deliberately not a row of network-specific buttons — a link on the clipboard
 * works everywhere the reader might paste it, and needs no third-party script.
 */
function ShareButton({ share, size }: { share: StyleSlot; size: number }) {
  const [copied, setCopied] = useState(false);
  const styled = styleSlotProps(share);
  const label = copied ? "Link copied" : "Copy link to this collection";

  return (
    <div className="share-row">
      <button
        type="button"
        className={`collection-share ${styled.className}`.trim()}
        style={styled.style}
        aria-label={label}
        title={label}
        onClick={async () => {
          try {
            // Read at click time: the URL is not known on the server, and
            // reading it in an effect would cause a cascading render.
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            setCopied(false);
          }
        }}
      >
        {/* The tick is the only feedback an icon-only control can give. */}
        <IconView
          name={copied ? "Check" : "Share2"}
          width={`${size}rem`}
          height={`${size}rem`}
        />
      </button>
    </div>
  );
}

/** What a click carried: shift takes a range, ctrl/cmd toggles one. */
export type SelectModifiers = { range: boolean; toggle: boolean };

/**
 * What the collection editor adds on top of the gallery.
 *
 * Passed in rather than forked into an admin-only copy, so the tiles being
 * selected and dragged are the very tiles a reader will see — the parity this
 * codebase keeps losing whenever a preview grows its own renderer.
 */
export type GalleryEditing = {
  selectedIds: string[];
  onSelect: (id: string, modifiers: SelectModifiers) => void;
  /** Called with the dragged image and the one it was dropped on. */
  onReorder: (draggedId: string, targetId: string) => void;
  /** Mosaic only: how many columns one tile spans. */
  spans: Record<string, { colSpan?: number; rowSpan?: number }>;
  onSpanChange: (id: string, colSpan: number) => void;
};

/** The three widths the column settings describe. */
export type GalleryBreakpoint = "desktop" | "tablet" | "mobile";

const TABLET_QUERY = "(max-width: 64rem)";
const MOBILE_QUERY = "(max-width: 48rem)";

/**
 * Which column count applies right now.
 *
 * `useSyncExternalStore` rather than an effect: the value comes from outside
 * React, and reading it in an effect would set state during the first commit.
 * The server has no viewport, so it reports desktop and the client corrects on
 * hydration — the same thing a media query does, one frame later.
 */
function useViewportBreakpoint(override?: GalleryBreakpoint): GalleryBreakpoint {
  const subscribe = (onChange: () => void) => {
    if (typeof window === "undefined" || override) return () => {};
    const lists = [window.matchMedia(TABLET_QUERY), window.matchMedia(MOBILE_QUERY)];
    for (const list of lists) list.addEventListener("change", onChange);
    return () => {
      for (const list of lists) list.removeEventListener("change", onChange);
    };
  };

  const snapshot = (): GalleryBreakpoint => {
    if (override) return override;
    if (typeof window === "undefined") return "desktop";
    if (window.matchMedia(MOBILE_QUERY).matches) return "mobile";
    if (window.matchMedia(TABLET_QUERY).matches) return "tablet";
    return "desktop";
  };

  return useSyncExternalStore(subscribe, snapshot, () => override ?? "desktop");
}

/**
 * Masonry, dealt one image at a time across the columns.
 *
 * CSS multi-column fills each column top to bottom before starting the next,
 * which puts the second image at the bottom of the page. Dealing them out
 * round-robin keeps the reading order left to right, which is the order the
 * gallery was arranged in.
 */
function toColumns<T>(items: T[], columns: number): T[][] {
  const out: T[][] = Array.from({ length: Math.max(1, columns) }, () => []);
  items.forEach((item, index) => out[index % out.length].push(item));
  return out;
}

/**
 * The shape of a tile — which is not the shape of the picture in it — and
 * whether the tile fills the space its row gives it.
 *
 * The media is laid into whatever comes back here, so this is the one place
 * deciding how much room each layout gives an image:
 *
 * A mosaic tile is *always* framed: it is bounded by its columns' width and its
 * row's height, whatever is known about the image. The two settings differ only
 * in where that frame comes from.
 *
 * - **Mosaic set to actual** gives each tile the image's own shape, so the
 *   tallest picture in a line sets the row height. Every tile then stretches to
 *   that height and the media covers it — which, because the row is never
 *   shorter than a picture's natural height at that width, always means scaling
 *   by height and cropping the sides. Exactly the described behaviour, and the
 *   reason no special casing is needed to get it. The column span does not
 *   appear in the ratio: the image scales with the tile's width, so it cancels.
 * - **Mosaic with a ratio** is a modular grid — one cell shape, spanned. The
 *   ratio deliberately does *not* follow each image's orientation: a flipped
 *   portrait cell is over three times the height of a landscape one, so a
 *   single portrait picture would set a row height that stretches every
 *   landscape tile beside it into a sliver.
 * - **Grid and masonry** hold every tile to the stated ratio, or to the media's
 *   own under `actual`. In a grid the row then takes its height from the
 *   tallest tile in it and the rest stretch, which is the space the fit acts in.
 *
 * `ratio` is undefined only outside a mosaic, when nothing knows the shape —
 * an image whose dimensions were never recorded, under `actual`.
 */
function tileFrame(
  image: CollectionImage,
  display: ResolvedCollection["display"],
  span: { colSpan?: number; rowSpan?: number } | undefined,
  columnCount: number
): { ratio?: string; cell?: string; colSpan: number; rowSpan: number } {
  const stated = aspectRatioValue(display.imageAspect);
  const natural =
    image.width > 0 && image.height > 0 ? image.width / image.height : null;
  const rowSpan = Math.max(1, span?.rowSpan ?? 1);
  // Never wider than the grid has columns: a longer span would make the grid
  // invent implicit tracks and size them to the image.
  const colSpan = Math.min(columnCount, Math.max(1, span?.colSpan ?? 1));

  if (display.layoutMode === "mosaic") {
    if (!stated) {
      // Square when the image never recorded its size, so the tile is still
      // bounded rather than falling back to sizing itself from its media.
      const shape = natural ?? 1;
      return { ratio: `${shape} / 1`, cell: `${shape} / 1`, colSpan, rowSpan };
    }

    // width = cols × cell, height = rows × cell ⇒ ratio = cols × cell / rows
    return {
      ratio: `${colSpan * stated} / ${rowSpan}`,
      // The unspanned shape, which the narrow breakpoints fall back to when
      // they collapse every span to one.
      cell: `${stated} / 1`,
      colSpan,
      rowSpan,
    };
  }

  if (stated) return { ratio: `${stated} / 1`, colSpan, rowSpan };
  return natural
    ? { ratio: `${image.width} / ${image.height}`, colSpan, rowSpan }
    : { colSpan, rowSpan };
}

export function CollectionGallery({
  collection,
  safeMode,
  editing,
  breakpoint,
}: {
  collection: ResolvedCollection;
  safeMode: boolean;
  /** Admin only; absent on the public page, which renders plain tiles. */
  editing?: GalleryEditing;
  /** Forces a width, for the editor canvas whose size is not the window's. */
  breakpoint?: GalleryBreakpoint;
}) {
  const { display, overlay } = collection;
  const [visibleCount, setVisibleCount] = useState(
    display.displayMode === "all" ? collection.images.length : display.pageSize
  );
  const [page, setPage] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Editor-only, and harmless on the public page where nothing sets them.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const images = useMemo(() => {
    if (display.displayMode === "pagination") {
      const start = page * display.pageSize;
      return collection.images.slice(start, start + display.pageSize);
    }
    if (display.displayMode === "lazy") {
      return collection.images.slice(0, visibleCount);
    }
    return collection.images;
  }, [collection.images, display.displayMode, display.pageSize, page, visibleCount]);

  // Lazy mode loads the next batch when the sentinel scrolls into view.
  useEffect(() => {
    if (display.displayMode !== "lazy") return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) =>
          Math.min(collection.images.length, current + display.pageSize)
        );
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [collection.images.length, display.displayMode, display.pageSize]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxIndex(null);
      if (event.key === "ArrowRight") {
        setLightboxIndex((current) =>
          current === null ? null : Math.min(collection.images.length - 1, current + 1)
        );
      }
      if (event.key === "ArrowLeft") {
        setLightboxIndex((current) => (current === null ? null : Math.max(0, current - 1)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, collection.images.length]);

  /*
   * Opening a picture full screen never changes the address, so it would leave
   * no trace among page views — yet it is the thing a gallery exists for. Each
   * distinct image shown counts once, including the ones stepped onto with the
   * arrows, since each is another picture actually looked at.
   *
   * Silent in the editor: an editor arranging a gallery is not an audience.
   */
  const reportedImage = useRef<string | null>(null);

  useEffect(() => {
    if (editing || lightboxIndex === null) return;
    const image = collection.images[lightboxIndex];
    if (!image || reportedImage.current === image.id) return;
    reportedImage.current = image.id;
    reportImageView(collection.slug || collection.id, image.id);
  }, [editing, lightboxIndex, collection.images, collection.slug, collection.id]);

  // Reopening the same picture later is a new view, so the guard only holds
  // for as long as the lightbox stays open.
  useEffect(() => {
    if (lightboxIndex === null) reportedImage.current = null;
  }, [lightboxIndex]);

  const layoutClass =
    display.layoutMode === "masonry"
      ? "collection-masonry"
      : display.layoutMode === "mosaic"
        ? "collection-mosaic"
        : "collection-grid";

  // Tile shapes are decided per tile by `tileFrame`, since a mosaic span and the
  // image's own orientation both differ from image to image.
  const gridVars = {
    "--collection-columns": display.columnsDesktop,
    "--collection-columns-tablet": display.columnsTablet,
    "--collection-columns-mobile": display.columnsMobile,
  } as React.CSSProperties;

  /*
   * How many columns are on screen right now. Masonry needs it to deal its
   * images out rather than letting CSS fill column by column, and mosaic needs
   * it to keep a tile's span inside the grid.
   */
  const width = useViewportBreakpoint(breakpoint);
  const columnCount =
    width === "mobile"
      ? display.columnsMobile
      : width === "tablet"
        ? display.columnsTablet
        : display.columnsDesktop;

  const totalPages = Math.ceil(collection.images.length / display.pageSize);
  const active = lightboxIndex !== null ? collection.images[lightboxIndex] : null;

  const renderItem = (image: CollectionImage, index: number) => {
    const span = collection.mosaicSpans?.[image.id];
    // Grid tiles use the small derivative; the lightbox and image page load the
    // original. On a large gallery this is the difference between megabytes and
    // kilobytes per screen.
    const url = protectedMediaUrl(image.thumbnailUrl || image.url);
    const shielded = safeMode && image.isNsfw;

    const inner = (
      <>
        {/* Classed, not bare: the media has to fill the tile, and a percentage
            height only resolves against a parent that has one. */}
        <div className={`collection-media${shielded ? " nsfw-shield" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={image.alt || image.title || ""}
            loading="lazy"
            decoding="async"
            width={image.width || undefined}
            height={image.height || undefined}
            draggable={display.allowDownload}
          />
        </div>
        {overlay.enabled ? (
          <div
            className={`collection-overlay${overlay.alwaysVisible ? " is-always-visible" : ""}`}
            data-position={overlay.placement}
          >
            <MetaList image={image} display={overlay} />
          </div>
        ) : null}
      </>
    );

    // The tile style is the collection's image style, and also what supplies
    // the space between tiles — the layouts add none of their own.
    const styled = styleSlotProps(collection.imageStyle);
    const frame = tileFrame(image, display, span, columnCount);

    const itemProps = {
      className: `collection-item ${styled.className}`.trim(),
      "data-fit": display.imageFit,
      "data-frame": frame.ratio ? "ratio" : "natural",
      style: {
        aspectRatio: frame.ratio,
        "--tile-cell": frame.cell,
        ...styled.style,
        ...(display.layoutMode === "mosaic"
          ? {
              gridColumn: `span ${frame.colSpan} / span ${frame.colSpan}`,
              gridRow: `span ${frame.rowSpan} / span ${frame.rowSpan}`,
            }
          : {}),
      } as React.CSSProperties,
      onContextMenu: display.allowContextMenu
        ? undefined
        : (event: React.MouseEvent) => event.preventDefault(),
    };

    // In the editor a tile is a drag handle and a selection target rather than
    // a link: clicking through to an image page would leave the builder.
    if (editing) {
      const isSelected = editing.selectedIds.includes(image.id);
      return (
        <div
          key={image.id}
          {...itemProps}
          // Keeps the image style the public tile carries, so the preview is
          // not quietly rendering an unstyled version.
          className={`${itemProps.className} is-editing${isSelected ? " is-selected" : ""}`}
          draggable
          onClick={(event) => {
            event.preventDefault();
            editing.onSelect(image.id, {
              range: event.shiftKey,
              toggle: event.metaKey || event.ctrlKey,
            });
          }}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            // Firefox refuses to start a drag without payload.
            event.dataTransfer.setData("text/plain", image.id);
            setDragId(image.id);
          }}
          onDragEnd={() => {
            setDragId(null);
            setDragOverId(null);
          }}
          onDragOver={(event) => {
            if (!dragId) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (dragOverId !== image.id) setDragOverId(image.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragId && dragId !== image.id) editing.onReorder(dragId, image.id);
            setDragId(null);
            setDragOverId(null);
          }}
          data-drag-over={dragOverId === image.id ? "true" : undefined}
        >
          {inner}

          {/* Mosaic is the one layout where a tile's width is its own, so the
              control for it sits on the tile rather than in the panel. */}
          {display.layoutMode === "mosaic" ? (
            <label
              className="collection-span-menu"
              onClick={(event) => event.stopPropagation()}
            >
              <span>Span</span>
              <select
                value={span?.colSpan ?? 1}
                onChange={(event) =>
                  editing.onSpanChange(image.id, Number(event.target.value))
                }
              >
                {/* Only spans the grid can honour: a longer one would be
                    clamped anyway, so offering it is a lie. */}
                {Array.from({ length: columnCount }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      );
    }

    return (
      <button
        key={image.id}
        type="button"
        {...itemProps}
        // Indexed into the whole collection, not the page being shown: the
        // lightbox steps through every image, and a paged slice would open the
        // wrong one.
        onClick={() => setLightboxIndex(collection.images.indexOf(image))}
      >
        {inner}
      </button>
    );
  };

  return (
    <div className={display.allowContextMenu ? undefined : "no-context-menu"}>
      {display.layoutMode === "masonry" ? (
        // Dealt across real columns rather than left to CSS, which would fill
        // one column to the bottom before starting the next.
        <div className={layoutClass} style={gridVars}>
          {toColumns(images, columnCount).map((column, columnIndex) => (
            <div className="collection-masonry-column" key={columnIndex}>
              {column.map((image) => renderItem(image, images.indexOf(image)))}
            </div>
          ))}
        </div>
      ) : (
        <div className={layoutClass} style={gridVars}>
          {images.map((image, index) => renderItem(image, index))}
        </div>
      )}

      {display.displayMode === "lazy" && visibleCount < collection.images.length ? (
        <div ref={sentinelRef} style={{ height: "2rem" }} />
      ) : null}

      {display.displayMode === "pagination" && totalPages > 1 ? (
        <div className="share-row" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous
          </button>
          <span style={{ alignSelf: "center", fontSize: "0.875rem" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
          >
            Next
          </button>
        </div>
      ) : null}

      {active ? (
        // A click on the backdrop closes; the stage stops it going further, so
        // the picture and its controls are the only safe places to click.
        <div
          className="lightbox-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxIndex(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <CollectionImageStage
              collection={collection}
              image={active}
              safeMode={safeMode}
              exit={{ label: "Close", icon: "X", onClick: () => setLightboxIndex(null) }}
              previous={
                lightboxIndex !== null && lightboxIndex > 0
                  ? { onClick: () => setLightboxIndex(lightboxIndex - 1) }
                  : null
              }
              next={
                lightboxIndex !== null &&
                lightboxIndex < collection.images.length - 1
                  ? { onClick: () => setLightboxIndex(lightboxIndex + 1) }
                  : null
              }
            />
          </div>
        </div>
      ) : null}

      {display.shareEnabled ? (
        <ShareButton share={collection.share} size={display.shareIconSize} />
      ) : null}
    </div>
  );
}
