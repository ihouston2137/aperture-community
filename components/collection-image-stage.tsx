"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";

import { IconView } from "@/components/icons";
import type { CollectionImage, ResolvedCollection } from "@/lib/collection-types";
import {
  META_FIELDS,
  styleSlotProps,
  type MetaField,
  type MetadataDisplay,
} from "@/lib/display-templates";
import { protectedMediaUrl } from "@/lib/protected-media-url";

/**
 * One image at full size, with its metadata beneath it.
 *
 * Shared by the lightbox and the single image page so the two cannot drift:
 * they are the same view of the same thing, one over the gallery and one at its
 * own address, and they read the same settings.
 *
 * The controls sit at fixed corners rather than following a placement setting —
 * close top right, arrows centred at the sides, download and share bottom right
 * — because these are the frame around the picture, not part of its design.
 */

/**
 * The download link, tagged so the media route can count it.
 *
 * The same file is served to the `<img>` on this page, so the URL alone cannot
 * say whether a request is a picture being displayed or a copy being taken —
 * `dl` is what distinguishes them. The collection and image are named by id,
 * never by label: the route builds the reported name from the stored records,
 * so a hand-edited link cannot write a row of its own choosing.
 */
function downloadUrl(collection: ResolvedCollection, image: CollectionImage): string {
  const base = protectedMediaUrl(image.url);
  const params = new URLSearchParams({
    dl: "1",
    c: collection.slug || collection.id,
    m: image.id,
  });
  return `${base}${base.includes("?") ? "&" : "?"}${params.toString()}`;
}

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

/**
 * The metadata under the picture: one field per row, always in the order the
 * fields are declared rather than the order they were switched on. A field that
 * is off — or has nothing to say — renders nothing at all, so it takes no room.
 */
export function ImageMeta({
  image,
  display,
}: {
  image: CollectionImage;
  display: MetadataDisplay;
}) {
  if (!display.enabled) return null;

  const rows = META_FIELDS.filter((field) => display.fields.includes(field))
    .map((field) => ({ field, value: metaValue(image, field) }))
    .filter((row) => row.value);

  if (rows.length === 0) return null;

  return (
    <div className="image-stage-meta">
      {rows.map((row) => {
        const styled = styleSlotProps(display.fieldStyles?.[row.field]);
        return (
          <div
            key={row.field}
            data-meta-field={row.field}
            className={styled.className || undefined}
            style={styled.style}
          >
            {row.value}
          </div>
        );
      })}
    </div>
  );
}

/** A corner control: a link when it navigates, a button when it acts. */
function StageAction({
  icon,
  label,
  className,
  style,
  href,
  onClick,
  disabled,
}: {
  /** Icon-only when set; the label is then only for assistive tech. */
  icon?: string;
  label: string;
  className: string;
  style?: CSSProperties;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const content = icon ? (
    <IconView name={icon} width="1.5rem" height="1.5rem" />
  ) : (
    <span>{label}</span>
  );

  if (href && !disabled) {
    return (
      <Link className={className} style={style} href={href} aria-label={label} title={label}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {content}
    </button>
  );
}

/** Where Previous and Next point; either a link or a handler. */
export type StageStep = { href?: string; onClick?: () => void } | null;

/**
 * The way out of this image, top right.
 *
 * The lightbox closes back to the gallery it is covering, so it is an icon. The
 * image page has nothing to close — it is a page — so it offers its way back to
 * the gallery in words instead.
 */
export type StageExit = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: string;
};

export function CollectionImageStage({
  collection,
  image,
  safeMode,
  previous,
  next,
  exit,
  showName = false,
  children,
}: {
  collection: ResolvedCollection;
  image: CollectionImage;
  safeMode: boolean;
  previous: StageStep;
  next: StageStep;
  exit: StageExit;
  /**
   * The lightbox is already covering the gallery whose name it would be
   * announcing, so only an image's own page asks for this.
   */
  showName?: boolean;
  /** Anything the surrounding surface adds, e.g. a draft notice. */
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const { display } = collection;
  // The same style the gallery's tiles carry, so an image does not change
  // character when it is opened.
  const styled = styleSlotProps(collection.imageStyle);
  // The collection page's own title styling, so the name reads the same
  // wherever it appears.
  const nameStyled = styleSlotProps(collection.header.title);

  const exitStyled = styleSlotProps(collection.imageExitStyle);
  const shareStyle = styleSlotProps(collection.imageShare);

  /*
   * A worded exit is a full-width row above the picture, so its style can put
   * the text where it wants it — a corner-pinned link has no width to align
   * within. The lightbox's icon close stays pinned, being a close button
   * rather than something the collection dresses.
   */
  const exitAction = (
    <StageAction
      icon={exit.icon}
      label={exit.label}
      className={
        exit.icon ? "image-stage-close" : `image-stage-exit ${exitStyled.className}`.trim()
      }
      style={exit.icon ? undefined : exitStyled.style}
      href={exit.href}
      onClick={exit.onClick}
    />
  );

  const contentStyled = styleSlotProps(collection.imageContentStyle);

  return (
    // `data-exit` tells the stage whether its top has to stay clear. Only a
    // pinned close button needs that room; reserving it on a page without one
    // is just a gap above the content.
    <div className="image-stage" data-exit={exit.icon ? "pinned" : "row"}>
      {/* Everything in flow lives in here, so a border or background from the
          content style wraps the content and not the pinned controls. */}
      <div
        className={`image-stage-content ${contentStyled.className}`.trim()}
        style={contentStyled.style}
      >
        {exit.icon ? null : exitAction}

        {/* In flow above the picture rather than laid over it, so the name
            moves the image down instead of sitting on top of it. */}
        {showName && display.imageNameEnabled && collection.name ? (
          <span
            className={`image-stage-name ${nameStyled.className}`.trim()}
            style={nameStyled.style}
          >
            {collection.name}
          </span>
        ) : null}

        <figure className="image-stage-figure">
          <div className={safeMode && image.isNsfw ? "nsfw-shield" : undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={protectedMediaUrl(image.url)}
              alt={image.alt || image.title || ""}
              className={styled.className || undefined}
              style={styled.style}
              draggable={display.allowDownload}
              onContextMenu={
                display.allowContextMenu
                  ? undefined
                  : (event) => event.preventDefault()
              }
            />
          </div>

          <ImageMeta image={image} display={collection.lightbox} />

          {/* Below the picture and its metadata, in the flow, rather than laid
              over the image: a control on top of the photograph covers the very
              thing being looked at. The stage scrolls if that runs past the
              bottom of the screen. */}
        <div className="image-stage-actions">
          {display.imageShareEnabled && collection.slug ? (
            <button
              type="button"
              className={`image-stage-action ${shareStyle.className}`.trim()}
              style={shareStyle.style}
              aria-label={copied ? "Link copied" : "Copy link to this image"}
              title={copied ? "Link copied" : "Copy link to this image"}
              onClick={async () => {
                try {
                  // The image's own address, so what is pasted opens this picture
                  // rather than the gallery it came from.
                  const url = new URL(
                    `/collections/${collection.slug}/${image.id}`,
                    window.location.origin
                  );
                  await navigator.clipboard.writeText(url.toString());
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  setCopied(false);
                }
              }}
            >
              <IconView
                name={copied ? "Check" : "Share2"}
                width={`${display.imageShareIconSize}rem`}
                height={`${display.imageShareIconSize}rem`}
              />
            </button>
          ) : null}

          {display.allowDownload ? (
            // Dressed by the same style and sized by the same setting as the
            // share button: they sit side by side, and a pair of buttons in one
            // corner that do not match reads as a mistake.
            <a
              className={`image-stage-action ${shareStyle.className}`.trim()}
              style={shareStyle.style}
              href={downloadUrl(collection, image)}
              download={image.originalName || undefined}
              aria-label="Download"
              title="Download"
            >
              <IconView
                name="Download"
                width={`${display.imageShareIconSize}rem`}
                height={`${display.imageShareIconSize}rem`}
              />
            </a>
          ) : null}
        </div>
          {children}
        </figure>
      </div>

      {exit.icon ? exitAction : null}

      <StageAction
        icon="ChevronLeft"
        label="Previous image"
        className="image-stage-step is-previous"
        href={previous?.href}
        onClick={previous?.onClick}
        disabled={!previous}
      />
      <StageAction
        icon="ChevronRight"
        label="Next image"
        className="image-stage-step is-next"
        href={next?.href}
        onClick={next?.onClick}
        disabled={!next}
      />

    </div>
  );
}
