"use client";

import type { CSSProperties, ReactNode } from "react";

import { customStyleClassName } from "@/lib/custom-style-css";
import {
  backgroundColorStyle,
  backgroundMediaStyle,
  borderStyle,
  columnInnerStyle,
  columnStyle,
  rowInnerStyle,
  rowStyle,
  blockFillsWidth,
  type BackgroundSettings,
  type PageBlock,
  type PageColumn,
  type PageRow,
  type WidthAwareBlock,
} from "@/lib/page-layout";
import {
  cellMediaIsGated,
  cellMediaVariants,
  containerOuterStyle,
  ensureContainerLayout,
  type ContainerCell,
} from "@/lib/page-container-layout";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  hasResponsiveStyle,
  responsiveStyleClass,
  responsiveStyleSetsRadius,
  slugKeyFor,
} from "@/lib/responsive-style";
import {
  styleValuesToCss,
  type ShadowMode,
  type StyleValues,
} from "@/lib/style-values";

/**
 * Primitives shared by the page builder preview, the public page renderer, the
 * form builder preview and the public form shell. Anything rendered from these
 * is guaranteed to look the same in all four places.
 */

export type StyledBlock = {
  /** Needed only to key per-view rules; a block without one stays inline. */
  id?: string;
  styleSlug?: string;
  textStyle?: StyleValues;
};

/**
 * A named style intentionally overrides every local text setting — when
 * `styleSlug` is set the block only carries the generated class.
 *
 * A block with per-view overrides also carries a class instead of a style
 * attribute: an inline style has no media queries, and it would outrank the
 * rules that supply them. The sheet those rules live in is emitted once per
 * layout, by `LayoutView` on a page and by the builder canvas.
 */
export function blockTextProps(
  block: StyledBlock,
  shadow: ShadowMode = "box"
): {
  className: string;
  style: CSSProperties | undefined;
} {
  return styleSlotProps(block, "textStyle", shadow);
}

/** Any block, read by style-slot key rather than by its own field names. */
type StyleHost = Record<string, unknown> & { id?: string };

/**
 * One style slot on a block, resolved to what the DOM needs.
 *
 * `textStyle` is the block's own; the rest — `imageStyle`, `captionStyle`,
 * `iconStyle`, `shapeTextStyle` — dress a part inside it. All five resolve the
 * same way, which is the point of doing it here rather than once per renderer.
 */
export function styleSlotProps(
  host: StyleHost,
  valuesKey: string,
  /**
   * Which shadow local values cast.
   *
   * `drop` for anything whose content is words: a block is a rectangle holding
   * a line of type, and the rectangle is a place rather than a thing — a
   * shadow of it is a shadow of nothing anybody put there. `drop-shadow`
   * follows the element's own alpha, so a text block that *does* carry a
   * background or a border still casts the shadow of that box.
   *
   * A style arriving as a class rather than as values is handled in the
   * stylesheet those classes come from; see `custom-style-css` and
   * `responsive-style`.
   */
  shadow: ShadowMode = "box"
): { className: string; style: CSSProperties | undefined } {
  const slug = host[slugKeyFor(valuesKey)];
  if (typeof slug === "string" && slug) {
    return { className: customStyleClassName(slug), style: undefined };
  }
  if (host.id && hasResponsiveStyle(host, valuesKey)) {
    return { className: responsiveStyleClass(host.id, valuesKey), style: undefined };
  }
  return {
    className: "",
    style: styleValuesToCss(host[valuesKey] as StyleValues | undefined, shadow),
  };
}

/**
 * The corner radius an image or video block sets from its own sizing controls.
 *
 * Withheld when a per-view style states one: those values live in a rule, and
 * anything left in the style attribute would outrank every view of it.
 */
function blockRadiusStyle(
  block: StyledBlock & { radius?: number }
): CSSProperties {
  if (responsiveStyleSetsRadius(block, "textStyle")) return {};
  return { borderRadius: `${block.radius ?? 0}rem` };
}

/**
 * The feature media of whatever a container is bound to, for backgrounds set to
 * use it. Only containers can supply this, so everything else passes nothing
 * and the setting simply renders no media.
 */
export type StoryBackgroundMedia = { url: string; type: string };

/** Both bindings at once: a container can carry a story and a collection. */
export type BoundMedia = {
  story?: StoryBackgroundMedia;
  collection?: StoryBackgroundMedia;
};

/** Whichever binding this background asks for. */
function boundSource(
  type: string,
  bound: BoundMedia | undefined
): StoryBackgroundMedia | undefined {
  if (type === "storyFeature") return bound?.story;
  if (type === "collectionFeature") return bound?.collection;
  return undefined;
}

/**
 * The media (if any) behind a row, column, container or area, plus the overlay
 * painted on top of it.
 *
 * One component for all four so a background can never behave differently
 * depending on which element it sits on.
 */
export function BackgroundLayer({
  settings,
  className,
  bound,
}: {
  settings: BackgroundSettings & { parallax?: boolean };
  className: string;
  bound?: BoundMedia;
}) {
  const type = settings.backgroundType;
  const fromBinding = boundSource(type, bound);

  // A bound background borrows the record's feature media and its type;
  // anything else uses the media picked on the block itself.
  const source = fromBinding
    ? fromBinding.url
      ? { url: fromBinding.url, isVideo: fromBinding.type === "video" }
      : null
    : (type === "image" || type === "video") && settings.backgroundMediaUrl
      ? { url: settings.backgroundMediaUrl, isVideo: type === "video" }
      : null;

  if (!source) return null;

  const overlay = settings.backgroundOverlay ? (
    <span className="pb-bg-overlay" style={{ background: settings.backgroundOverlay }} />
  ) : null;

  // Scaling to width is the one fit whose height the box has to answer to, so
  // it is the one that puts this layer in flow. The others stay out of flow,
  // where they can fill the box without ever enlarging it.
  const flow = settings.backgroundFit === "width" ? " is-flow" : "";

  return (
    <div className={`${className}${flow}${settings.parallax ? " is-parallax" : ""}`}>
      {source.isVideo ? (
        <video
          src={protectedMediaUrl(source.url)}
          autoPlay
          muted
          loop
          playsInline
          style={backgroundMediaStyle(settings)}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={protectedMediaUrl(source.url)}
          alt=""
          aria-hidden="true"
          style={backgroundMediaStyle(settings)}
        />
      )}
      {overlay}
    </div>
  );
}

export function RowShell({
  row,
  children,
  className,
  innerRef,
  ...rest
}: {
  row: PageRow;
  children: ReactNode;
  className?: string;
  innerRef?: React.Ref<HTMLDivElement>;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      ref={innerRef}
      className={`pb-row${className ? ` ${className}` : ""}`}
      style={rowStyle(row)}
      {...rest}
    >
      <BackgroundLayer settings={row.settings} className="pb-row-bg" />
      <div className="pb-row-inner" style={rowInnerStyle(row)}>
        {children}
      </div>
    </div>
  );
}

export function ColumnShell({
  column,
  children,
  className,
  ...rest
}: {
  column: PageColumn;
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`pb-column${className ? ` ${className}` : ""}`}
      style={columnStyle(column)}
      {...rest}
    >
      <BackgroundLayer settings={column.settings} className="pb-column-bg" />
      <div className="pb-column-inner" style={columnInnerStyle(column)}>
        {children}
      </div>
    </div>
  );
}

/**
 * A container cell. Same background, border, alignment and spacing as a column
 * — the placement comes from the container's generated stylesheet, keyed by id.
 */
export function CellShell({
  cell,
  children,
  className,
  bound,
  ...rest
}: {
  cell: ContainerCell;
  children: ReactNode;
  className?: string;
  bound?: BoundMedia;
} & React.HTMLAttributes<HTMLDivElement>) {
  const variants = cellMediaVariants(cell);
  const gated = cellMediaIsGated(cell);

  return (
    <div
      className={`pb-container-cell${className ? ` ${className}` : ""}`}
      data-cell={cell.id}
      {...rest}
    >
      {/* Nothing here is styled inline: an area looks different per view, and a
          style attribute cannot. `containerCss` carries the whole appearance,
          keyed by this element's id. */}
      <div className="pb-column-bg">
        {variants.map((variant) => {
          const binding = boundSource(variant.type, bound);
          const url = binding ? binding.url : variant.url;
          if (!url) return null;
          const isVideo =
            variant.type === "video" || (binding ? binding.type === "video" : false);

          // Tagged only when the views disagree, so the usual case renders one
          // element with no gating rules behind it.
          const bp = gated ? variant.breakpoints.join(" ") : undefined;

          return isVideo ? (
            <video
              key={variant.key}
              data-bp={bp}
              src={protectedMediaUrl(url)}
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={variant.key} data-bp={bp} src={protectedMediaUrl(url)} alt="" aria-hidden="true" />
          );
        })}
        <span className="pb-bg-overlay" />
      </div>

      <div className="pb-column-inner">{children}</div>
    </div>
  );
}

/**
 * The container's own box: background, border and spacing around the grid.
 *
 * Separate from the grid element because a grid's children are grid items, and
 * an absolutely positioned background layer among them is one surprise away
 * from claiming a track.
 */
export function ContainerShell({
  settings,
  innerStyle,
  children,
  className,
  bound,
  ...rest
}: {
  settings: BackgroundSettings;
  /** The container's padding, which belongs on the inner element. */
  innerStyle?: CSSProperties;
  children: ReactNode;
  className?: string;
  bound?: BoundMedia;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`pb-container-shell${className ? ` ${className}` : ""}`}
      {...rest}
    >
      <BackgroundLayer settings={settings} className="pb-column-bg" bound={bound} />
      <div className="pb-container-shell-inner" style={innerStyle}>
        {children}
      </div>
    </div>
  );
}

/**
 * The flex item a column lays out. Everything about a block's width is decided
 * here, because this element — not the block's own markup — is what the
 * column's `align-items` shrink-wraps.
 *
 * Typed structurally rather than as a `PageBlock` so the story renderer can
 * wrap story slots in it too.
 */
export function BlockWrapper({
  block,
  children,
  className,
  ...rest
}: {
  block: WidthAwareBlock & {
    align?: "left" | "center" | "right";
    container?: PageBlock["container"];
  };
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  const style: CSSProperties = {};

  // A block that asks for the full width has to opt out of the shrink-wrap; its
  // placement is moot at that point, so the two never both apply.
  if (blockFillsWidth(block)) style.alignSelf = "stretch";
  else if (block.align === "center") style.alignSelf = "center";
  else if (block.align === "right") style.alignSelf = "flex-end";

  // A container's size setting drives this wrapper too. Applied after the
  // alignment so "fill" wins over it.
  if (block.type === "container" && block.container) {
    Object.assign(style, containerOuterStyle(ensureContainerLayout(block.container)));
  }

  return (
    <div
      className={`pb-block${className ? ` ${className}` : ""}`}
      style={style}
      data-block-type={block.type}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------- Visual primitives */

export function HeadlineBlock({
  block,
}: {
  block: StyledBlock & { text?: string; level?: number };
}) {
  // A shadow here belongs to the letters, not to the box round them.
  const { className, style } = blockTextProps(block, "drop");
  const Tag = (`h${Math.min(6, Math.max(1, block.level ?? 2))}` as unknown) as "h2";
  return (
    <Tag className={`pb-headline ${className}`.trim()} style={style}>
      {block.text}
    </Tag>
  );
}

export function PlainTextBlock({
  block,
}: {
  block: StyledBlock & { text?: string };
}) {
  // A shadow here belongs to the letters, not to the box round them.
  const { className, style } = blockTextProps(block, "drop");
  return (
    <p className={`pb-plain-text ${className}`.trim()} style={style}>
      {block.text}
    </p>
  );
}

export function RichTextBlock({
  block,
}: {
  block: StyledBlock & { html?: string };
}) {
  // A shadow here belongs to the letters, not to the box round them.
  const { className, style } = blockTextProps(block, "drop");
  return (
    <div
      className={`rich-text ${className}`.trim()}
      style={style}
      dangerouslySetInnerHTML={{ __html: block.html ?? "" }}
    />
  );
}

export function ImageBlock({
  block,
  shielded = false,
}: {
  block: StyledBlock & {
    mediaUrl?: string;
    alt?: string;
    caption?: string;
    width?: number;
    height?: number;
    radius?: number;
    objectFit?: "cover" | "contain";
  };
  shielded?: boolean;
}) {
  if (!block.mediaUrl) {
    return <div className="pb-empty-drop">No image selected</div>;
  }

  // Border, radius, shadow, spacing and the rest come from the style editor and
  // win over the block's own sizing defaults.
  const styled = blockTextProps(block);

  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={protectedMediaUrl(block.mediaUrl)}
      alt={block.alt ?? ""}
      className={styled.className || undefined}
      style={{
        width: block.width ? `${block.width}rem` : "100%",
        height: block.height ? `${block.height}rem` : "auto",
        objectFit: block.objectFit ?? "cover",
        ...blockRadiusStyle(block),
        ...styled.style,
      }}
    />
  );

  return (
    <figure style={{ margin: 0 }}>
      {shielded ? <div className="nsfw-shield">{image}</div> : image}
      {block.caption ? (
        <figcaption style={{ fontSize: "0.8125rem", opacity: 0.75, marginTop: "0.4rem" }}>
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export function VideoBlock({
  block,
}: {
  block: StyledBlock & {
    mediaUrl?: string;
    caption?: string;
    width?: number;
    height?: number;
    radius?: number;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
    controls?: boolean;
  };
}) {
  if (!block.mediaUrl) {
    return <div className="pb-empty-drop">No video selected</div>;
  }

  // External providers are embedded; local files use a native player so the
  // protected media route can serve range requests.
  if (/^https?:\/\//i.test(block.mediaUrl)) {
    return (
      <div
        style={{
          width: block.width ? `${block.width}rem` : "100%",
          aspectRatio: "16 / 9",
        }}
      >
        <iframe
          src={block.mediaUrl}
          title={block.caption || "Embedded video"}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0, borderRadius: `${block.radius ?? 0}rem` }}
        />
      </div>
    );
  }

  const styled = blockTextProps(block);

  return (
    <figure style={{ margin: 0 }}>
      <video
        src={protectedMediaUrl(block.mediaUrl)}
        controls={block.controls !== false}
        autoPlay={block.autoplay}
        loop={block.loop}
        muted={block.muted !== false}
        playsInline
        className={styled.className || undefined}
        style={{
          width: block.width ? `${block.width}rem` : "100%",
          height: block.height ? `${block.height}rem` : "auto",
          ...blockRadiusStyle(block),
          ...styled.style,
        }}
      />
      {block.caption ? (
        <figcaption style={{ fontSize: "0.8125rem", opacity: 0.75, marginTop: "0.4rem" }}>
          {block.caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
