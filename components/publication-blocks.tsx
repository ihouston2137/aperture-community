"use client";

import type { CSSProperties } from "react";

import { customStyleClassName } from "@/lib/custom-style-css";
import type { PublicationBlock } from "@/lib/publication-layout";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { styleValuesToCss } from "@/lib/style-values";

import { LucideIconView } from "./lucide-icon";
import { QrCode } from "./qr-code";
import { CustomShapeView, Shape } from "./shape";
import type { ShapeKind } from "@/lib/page-layout";

export type PublicationSources = {
  /** Media asset id -> url, so blocks that only store an id still resolve. */
  media: Record<string, string>;
  shapes: Record<string, { viewBox: string; paths: string[] }>;
  stories: Record<string, { headline: string; slug: string; featureMediaUrl: string }>;
  collections: Record<string, { name: string; slug: string }>;
  forms: Record<string, { title: string; slug: string }>;
};

export const emptyPublicationSources: PublicationSources = {
  media: {},
  shapes: {},
  stories: {},
  collections: {},
  forms: {},
};

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
  const textProps = block.styleSlug
    ? { className: customStyleClassName(block.styleSlug), style: undefined }
    : { className: "", style: styleValuesToCss(block.textStyle) };

  // Blocks may carry only a media id (older documents) or an explicit url.
  const mediaUrl =
    block.mediaUrl || (block.mediaId ? sources.media[block.mediaId] ?? "" : "");

  let content: React.ReactNode = null;

  switch (block.type) {
    case "text":
      content = (
        <div
          className={textProps.className || undefined}
          style={{ width: "100%", height: "100%", ...textProps.style }}
        >
          {block.text}
        </div>
      );
      break;

    case "richText":
      content = (
        <div
          className={`rich-text ${textProps.className}`.trim()}
          style={{ width: "100%", height: "100%", overflow: "hidden", ...textProps.style }}
          dangerouslySetInnerHTML={{ __html: block.html ?? "" }}
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
        <span
          className={`pb-button ${textProps.className}`.trim()}
          style={{ width: "100%", height: "100%", ...textProps.style }}
        >
          {block.label}
        </span>
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
      const shapeStyle = block.shapeStyle ?? {};
      const text = (block.text ?? "").trim();
      const above = Boolean(text) && (block.textPlacement ?? "inside") === "above";

      const common = {
        color: shapeStyle.backgroundColor ?? block.color ?? "#2b6cb0",
        borderWidth: shapeStyle.borderWidth ?? 0,
        borderColor: shapeStyle.borderColor ?? "#000000",
        text: above ? "" : text,
        textClassName: textProps.className || undefined,
        textStyle: textProps.style,
        // A block's box is fixed, so text above it takes its share of the
        // height rather than pushing the shape out of the bottom.
        style: above
          ? ({ width: "100%", height: "auto", flex: "1 1 0", minHeight: 0 } as CSSProperties)
          : undefined,
      };

      const shape =
        block.type === "shape" ? (
          <Shape
            {...common}
            kind={(block.shapeKind ?? "rectangle") as ShapeKind}
            width={block.width / 16}
            height={block.height / 16}
            radius={shapeStyle.borderRadius ?? (block.radius ?? 0) / 16}
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
            {text}
          </span>
          {shape}
        </div>
      ) : (
        shape
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
