"use client";

import Link from "next/link";

import type { ResolvedCollection } from "@/lib/collection-types";
import type { CollectionSlotBlock } from "@/lib/collection-slot-layout";
import { protectedMediaUrl } from "@/lib/protected-media-url";

import { blockTextProps } from "./block-primitives";
import { CollectionGallery } from "./collection-gallery";
import { IconView } from "./icons";
import { featureMediaStyle, slotProps } from "./story-blocks";

/**
 * The collection half of a container's contents.
 *
 * The mirror of `StoryBlockView`: each slot draws one part of the collection a
 * container is bound to. It shares that component's media framing and style
 * slots outright rather than restating them, so a feature image behaves the
 * same whether it came from a story or a collection.
 */

/**
 * A placeholder keeps an empty slot visible while designing; the published page
 * renders nothing, so a reader never sees a label.
 */
function Slot({
  value,
  placeholder,
  showPlaceholder,
  children,
}: {
  value: string;
  placeholder: string;
  showPlaceholder: boolean;
  children: (value: string) => React.ReactNode;
}) {
  if (value) return <>{children(value)}</>;
  if (!showPlaceholder) return null;
  return <div className="pb-empty-drop">{placeholder}</div>;
}

export function CollectionBlockView({
  block,
  collection,
  safeMode = false,
  showPlaceholders = false,
  featureHref,
}: {
  block: CollectionSlotBlock;
  collection: ResolvedCollection | null;
  safeMode?: boolean;
  /** Set on a builder canvas, where an empty slot still needs to be findable. */
  showPlaceholders?: boolean;
  /**
   * Where the collection is shown as a teaser — a bound container on a page —
   * this sends the feature image to the collection itself.
   */
  featureHref?: string;
}) {
  const { className, style } = blockTextProps(block);

  switch (block.type) {
    case "collectionName":
      return (
        <Slot
          value={collection?.name ?? ""}
          placeholder="Collection name"
          showPlaceholder={showPlaceholders}
        >
          {(value) => (
            <h2 className={className || undefined} style={{ margin: 0, ...style }}>
              {value}
            </h2>
          )}
        </Slot>
      );

    case "collectionCategory":
      return (
        <Slot
          value={collection?.category ?? ""}
          placeholder="Collection category"
          showPlaceholder={showPlaceholders}
        >
          {(value) => (
            <p className={className || undefined} style={{ margin: 0, ...style }}>
              {value}
            </p>
          )}
        </Slot>
      );

    case "collectionDescription":
      return (
        <Slot
          value={collection?.description ?? ""}
          placeholder="Collection description"
          showPlaceholder={showPlaceholders}
        >
          {(value) => (
            <p className={className || undefined} style={{ margin: 0, ...style }}>
              {value}
            </p>
          )}
        </Slot>
      );

    case "collectionFeatureMedia": {
      // The collection's own feature image, which falls back to the first in
      // its order — so a bound collection always has one to show.
      const image = collection?.featureImage;
      if (!image) {
        return showPlaceholders ? (
          <div className="pb-empty-drop">Collection feature image</div>
        ) : null;
      }

      const media = slotProps(block, "image");
      const caption = slotProps(block, "caption");
      // Sizing first, so a style from the editor still wins over the frame.
      const mediaStyle = { ...featureMediaStyle(block), ...media.style };

      const picture =
        image.mediaType === "video" ? (
          <video
            src={protectedMediaUrl(image.url)}
            controls
            className={media.className || undefined}
            style={mediaStyle}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={protectedMediaUrl(image.url)}
            alt={image.alt || image.title || ""}
            className={media.className || undefined}
            style={mediaStyle}
          />
        );

      return (
        <figure className={`story-feature ${className}`.trim()} style={style}>
          {/* Video keeps its own controls, so a link would swallow the clicks. */}
          {featureHref && !showPlaceholders && image.mediaType !== "video" ? (
            <a href={featureHref} className="pb-image-link">
              {picture}
            </a>
          ) : (
            picture
          )}
          {block.showCaption !== false && image.caption ? (
            <figcaption className={caption.className || undefined} style={caption.style}>
              {image.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case "collectionGallery": {
      if (!collection || collection.images.length === 0) {
        return showPlaceholders ? (
          <div className="pb-empty-drop">Collection gallery</div>
        ) : null;
      }
      // The gallery itself, obeying every setting the collection carries.
      return <CollectionGallery collection={collection} safeMode={safeMode} />;
    }

    case "collectionLink": {
      const text = block.linkText ?? "";
      if (!text) {
        return showPlaceholders ? <div className="pb-empty-drop">Collection link</div> : null;
      }

      const icon = slotProps(block, "icon");
      const glyph = block.iconName ? (
        <IconView
          name={block.iconName}
          className={icon.className || undefined}
          style={icon.style}
          width={`${block.iconSize ?? 1}rem`}
          height={`${block.iconSize ?? 1}rem`}
        />
      ) : null;

      const label = (
        <>
          {block.iconPlacement === "before" ? glyph : null}
          <span>{text}</span>
          {block.iconPlacement !== "before" ? glyph : null}
        </>
      );

      // On the canvas a live link would navigate away from the builder, and an
      // unsaved collection has no address to point at.
      if (!collection?.slug || showPlaceholders) {
        return (
          <span className={`story-link ${className}`.trim()} style={style}>
            {label}
          </span>
        );
      }

      return (
        <Link
          href={`/collections/${collection.slug}`}
          className={`story-link ${className}`.trim()}
          style={style}
        >
          {label}
        </Link>
      );
    }

    default:
      return null;
  }
}
