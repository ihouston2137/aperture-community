"use client";

import type { CSSProperties, ReactNode } from "react";

import type { AspectRatio } from "@/lib/aspect-ratio";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { hasResponsiveStyle, responsiveStyleClass } from "@/lib/responsive-style";
import type { MediaClickSettings } from "@/lib/story-media";
import {
  STORY_META_FIELDS,
  aspectRatioValue,
  isStoryTemplateBlock,
  type StoryTemplateBlock,
  type TemplateBlock,
} from "@/lib/story-template-layout";

import { IconView } from "./icons";

import { customStyleClassName } from "@/lib/custom-style-css";
import {
  styleValuesToCss,
  styleValuesToDeclarations,
  type StyleValues,
} from "@/lib/style-values";

import { blockTextProps } from "./block-primitives";
import type { LightboxImage } from "./media-lightbox";

/**
 * The story half of a template layout.
 *
 * Shared by the public story page and the template builder's canvas so a change
 * to a slot's styling looks the same in both — the parity trap this codebase
 * keeps falling into when a preview and a renderer are written twice.
 */

export type StoryView = {
  /** Used by the link block; empty for an unsaved story. */
  slug: string;
  headline: string;
  subHeadline: string;
  category: string;
  location: string;
  author: string;
  publishDate: string | null;
  featureMediaUrl: string;
  featureMediaType: string;
  /** Resolved from the media library, not stored on the story. */
  featureAlt: string;
  featureCaption: string;
  featureAuthor: string;
  featureClick: MediaClickSettings;
  content: string;
};

export const emptyStoryView: StoryView = {
  slug: "",
  headline: "",
  subHeadline: "",
  category: "",
  location: "",
  author: "",
  publishDate: null,
  featureMediaUrl: "",
  featureMediaType: "image",
  featureAlt: "",
  featureCaption: "",
  featureAuthor: "",
  featureClick: { clickAction: "none", linkHref: "", linkNewTab: false },
  content: "",
};

export function formatStoryDate(value: string | null, format: string | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (format === "year") return String(date.getFullYear());
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: format === "short" ? "short" : "long",
    day: "numeric",
  });
}

/**
 * A style slot inside a block: the image, its caption or its credit. A named
 * style resolves to its generated class; local values become inline CSS, unless
 * the slot has per-view overrides — those need a rule, for the reasons
 * `blockTextProps` sets out.
 */
export function slotProps(
  block: {
    id?: string;
    imageStyleSlug?: string;
    imageStyle?: StyleValues;
    captionStyleSlug?: string;
    captionStyle?: StyleValues;
    iconStyleSlug?: string;
    iconStyle?: StyleValues;
  },
  slot: "image" | "caption" | "icon"
) {
  const slug = block[`${slot}StyleSlug`];
  if (slug) return { className: customStyleClassName(slug), style: undefined };

  const valuesKey = `${slot}Style` as const;
  if (block.id && hasResponsiveStyle(block, valuesKey)) {
    return { className: responsiveStyleClass(block.id, valuesKey), style: undefined };
  }
  return { className: "", style: styleValuesToCss(block[valuesKey]) };
}

/**
 * The box the feature media is drawn into.
 *
 * `full` states nothing and lets the media size itself. The others drive one or
 * both axes; an aspect ratio, when set, supplies whichever axis is left over,
 * so a frame is never over-specified and never collapses.
 */
export function featureMediaStyle(block: {
  mediaSize?: string;
  mediaFit?: string;
  mediaAspect?: AspectRatio;
  mediaWidth?: number;
  mediaHeight?: number;
}): CSSProperties {
  const size = block.mediaSize ?? "scaledWidth";
  if (size === "full") {
    return { width: "auto", height: "auto", maxWidth: "100%" };
  }

  const ratio = aspectRatioValue(block.mediaAspect);
  const style: CSSProperties = {
    // `fill` crops to the frame, `fit` letterboxes inside it. Only meaningful
    // once a frame exists, which is why `full` never sets it.
    objectFit: block.mediaFit === "fit" ? "contain" : "cover",
    maxWidth: "100%",
  };

  if (size === "scaledWidth") {
    style.width = "100%";
    if (ratio) style.aspectRatio = String(ratio);
    else style.height = "auto";
    return style;
  }

  if (size === "scaledHeight") {
    style.height = `${block.mediaHeight ?? 16}rem`;
    if (ratio) style.aspectRatio = String(ratio);
    else style.width = "auto";
    return style;
  }

  // Custom: an explicit width, with the ratio deciding the height when set.
  style.width = `${block.mediaWidth ?? 24}rem`;
  if (ratio) style.aspectRatio = String(ratio);
  else style.height = `${block.mediaHeight ?? 16}rem`;
  return style;
}

/**
 * Story images live inside the content HTML, so they cannot take React props.
 * A named style is applied by adding its class to each `<img>`; local values
 * become one rule scoped to this block.
 */
function styleContentImages(html: string, block: StoryTemplateBlock): string {
  const className = customStyleClassName(block.imageStyleSlug);
  if (!className) return html;

  return html.replace(/<img\b([^>]*)>/gi, (tag, attrs: string) =>
    /\bclass\s*=/.test(attrs)
      ? tag.replace(/\bclass\s*=\s*"([^"]*)"/i, `class="$1 ${className}"`)
      : `<img class="${className}"${attrs}>`
  );
}

function metaValue(story: StoryView, field: string): string {
  switch (field) {
    case "date":
      return formatStoryDate(story.publishDate, "long");
    case "category":
      return story.category;
    case "location":
      return story.location;
    case "author":
      return story.author;
    default:
      return "";
  }
}

/** Wraps media in whatever its click action calls for. */
function ClickTarget({
  click,
  lightbox,
  onOpen,
  children,
}: {
  click: MediaClickSettings;
  lightbox: LightboxImage;
  onOpen?: (image: LightboxImage) => void;
  children: ReactNode;
}) {
  if (click.clickAction === "lightbox" && onOpen) {
    return (
      <button type="button" className="story-image-trigger" onClick={() => onOpen(lightbox)}>
        {children}
      </button>
    );
  }

  if (click.clickAction === "link" && click.linkHref && onOpen) {
    return (
      <a
        href={click.linkHref}
        target={click.linkNewTab ? "_blank" : undefined}
        rel={click.linkNewTab ? "noreferrer" : undefined}
      >
        {children}
      </a>
    );
  }

  return <>{children}</>;
}

/**
 * A placeholder keeps an empty slot visible while designing. The published page
 * renders nothing, so a template never shows a label to a reader.
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
  children: (value: string) => ReactNode;
}) {
  if (value) return <>{children(value)}</>;
  if (!showPlaceholder) return null;
  return <div className="pb-empty-drop">{placeholder}</div>;
}

export function StoryBlockView({
  block,
  story,
  onOpenLightbox,
  showPlaceholders = false,
  featureHref,
}: {
  block: StoryTemplateBlock;
  story: StoryView;
  /** Omitted on the builder canvas, where clicks select the block instead. */
  onOpenLightbox?: (image: LightboxImage) => void;
  showPlaceholders?: boolean;
  /**
   * Set where the block is a teaser for a story read elsewhere — a bound
   * container on a page — so its feature image opens the story. The story page
   * itself leaves this unset: there is nowhere to go from there.
   */
  featureHref?: string;
}) {
  const { className, style } = blockTextProps(block);

  switch (block.type) {
    case "storyHeadline":
      return (
        <Slot value={story.headline} placeholder="Story headline" showPlaceholder={showPlaceholders}>
          {(value) => (
            <h1 className={`story-headline ${className}`.trim()} style={style}>
              {value}
            </h1>
          )}
        </Slot>
      );

    case "storySubHeadline":
      return (
        <Slot
          value={story.subHeadline}
          placeholder="Story sub headline"
          showPlaceholder={showPlaceholders}
        >
          {(value) => (
            <h2 className={`story-subheadline ${className}`.trim()} style={style}>
              {value}
            </h2>
          )}
        </Slot>
      );

    case "storyDate":
    case "storyCategory":
    case "storyLocation":
    case "storyAuthor": {
      const field = block.type.replace("story", "").toLowerCase();
      const value =
        block.type === "storyDate"
          ? formatStoryDate(story.publishDate, block.dateFormat)
          : metaValue(story, field);

      return (
        <Slot value={value} placeholder={`Story ${field}`} showPlaceholder={showPlaceholders}>
          {(shown) => (
            <p className={className || undefined} style={{ margin: 0, ...style }}>
              {shown}
            </p>
          )}
        </Slot>
      );
    }

    case "storyMeta": {
      const fields = block.metaFields ?? [...STORY_META_FIELDS];
      const parts = fields.map((field) => metaValue(story, field)).filter(Boolean);

      if (parts.length === 0) {
        return showPlaceholders ? <div className="pb-empty-drop">Story meta line</div> : null;
      }

      return (
        <div className={`story-meta ${className}`.trim()} style={style}>
          {parts.map((part, index) => (
            <span key={`${part}-${index}`}>{part}</span>
          ))}
        </div>
      );
    }

    case "storyFeatureMedia": {
      if (!story.featureMediaUrl) {
        return showPlaceholders ? <div className="pb-empty-drop">Story feature media</div> : null;
      }

      const url = protectedMediaUrl(story.featureMediaUrl);
      const image = slotProps(block, "image");
      const caption = slotProps(block, "caption");

      // Sizing first, so a style from the editor — a radius, a border — still
      // wins over the frame the size controls set up.
      const mediaStyle = { ...featureMediaStyle(block), ...image.style };

      const media =
        story.featureMediaType === "video" ? (
          <video src={url} controls className={image.className} style={mediaStyle} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={story.featureAlt}
            className={image.className || undefined}
            style={mediaStyle}
          />
        );

      // A teaser's image leads to the story, but only where the media has no
      // click action of its own — an author who chose a lightbox meant it.
      const linksToStory =
        Boolean(featureHref) &&
        !showPlaceholders &&
        story.featureClick.clickAction === "none";

      return (
        <figure className={`story-feature ${className}`.trim()} style={style}>
          {/* Video keeps its own controls, so a click wrapper would swallow them. */}
          {story.featureMediaType === "video" ? (
            media
          ) : linksToStory ? (
            <a href={featureHref} className="pb-image-link">
              {media}
            </a>
          ) : (
            <ClickTarget
              click={story.featureClick}
              lightbox={{ src: url, alt: story.featureAlt, caption: story.featureCaption }}
              onOpen={onOpenLightbox}
            >
              {media}
            </ClickTarget>
          )}
          {block.showCaption !== false && story.featureCaption ? (
            <figcaption className={caption.className || undefined} style={caption.style}>
              {story.featureCaption}
            </figcaption>
          ) : null}
        </figure>
      );
    }

    case "storyLink": {
      const text = block.linkText ?? "";
      if (!text) {
        return showPlaceholders ? <div className="pb-empty-drop">Story link</div> : null;
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

      // On the canvas the story has no slug yet, and a live link would navigate
      // away from the builder — so it renders as plain text there.
      if (!story.slug || showPlaceholders) {
        return (
          <span className={`story-link ${className}`.trim()} style={style}>
            {label}
          </span>
        );
      }

      return (
        <a href={`/stories/${story.slug}`} className={`story-link ${className}`.trim()} style={style}>
          {label}
        </a>
      );
    }

    case "storyContent": {
      if (!story.content) {
        return showPlaceholders ? <div className="pb-empty-drop">Story content</div> : null;
      }

      const contentImage = slotProps(block, "image");
      const imageCss = block.imageStyleSlug
        ? ""
        : styleValuesToDeclarations(block.imageStyle ?? {});

      return (
        <>
          {/* Local image values cannot ride on the injected markup, so they are
              emitted as one rule scoped to this block. */}
          {imageCss.trim() ? (
            <style
              dangerouslySetInnerHTML={{
                __html: `[data-story-content="${block.id}"] img {
${imageCss}
}`,
              }}
            />
          ) : null}
          <div
            data-story-content={block.id}
            className={`rich-text ${className}`.trim()}
            style={{
              ...style,
              ...(block.paragraphSpacing
                ? { "--rich-text-paragraph-space": `${block.paragraphSpacing}rem` }
                : {}),
            }}
            // Story images are baked into the HTML, so their lightbox clicks are
            // caught here rather than bound to each element.
            onClick={
            onOpenLightbox
              ? (event) => {
                  const trigger = (event.target as HTMLElement).closest<HTMLElement>(
                    "[data-story-lightbox]"
                  );
                  if (!trigger) return;
                  event.preventDefault();
                  onOpenLightbox({
                    src: trigger.dataset.storyLightbox ?? "",
                    alt: trigger.dataset.storyLightboxAlt ?? "",
                    caption: trigger.dataset.storyLightboxCaption ?? "",
                  });
                }
              : undefined
          }
            dangerouslySetInnerHTML={{
              __html: styleContentImages(story.content, block),
            }}
          />
        </>
      );
    }

    default:
      return null;
  }
}

export { isStoryTemplateBlock };
export type { TemplateBlock };
