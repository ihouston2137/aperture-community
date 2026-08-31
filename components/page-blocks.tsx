"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";

import { customStyleClassName } from "@/lib/custom-style-css";
import {
  containerCss,
  containerOuterStyle,
  containerShellInnerStyle,
  containerShellStyle,
  containerStyle,
  ensureContainerLayout,
} from "@/lib/page-container-layout";
import {
  blockFillsWidth,
  normalizeFeaturedSponsor,
  normalizeSponsorScroll,
  type PageBlock,
  type PageColumn,
  type PageRow,
  type WidthAwareBlock,
} from "@/lib/page-layout";
import {
  isCollectionSlotBlock,
  type CollectionSlotBlock,
} from "@/lib/collection-slot-layout";
import {
  isStoryTemplateBlock,
  type StoryTemplateBlock,
} from "@/lib/story-template-layout";
import type { PageSources } from "@/lib/page-sources";
import { embedUrlFor } from "@/lib/embed-url";
import { filterCalendarEvents, normalizeCalendarDisplay } from "@/lib/calendar";
import { normalizeEventListSettings } from "@/lib/event-list";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  calendarStyleCss,
  emptyCalendarStyle,
  type CalendarStyleRecord,
} from "@/lib/calendar-style";
import { layoutResponsiveCss } from "@/lib/responsive-style";

import {
  BlockWrapper,
  CellShell,
  ColumnShell,
  ContainerShell,
  HeadlineBlock,
  ImageBlock,
  PlainTextBlock,
  RichTextBlock,
  RowShell,
  VideoBlock,
  blockTextProps,
  styleSlotProps,
} from "./block-primitives";
import { CalendarBlock } from "./calendar-block";
import { EventListBlock } from "./event-list-block";
import { CollectionBlockView } from "./collection-blocks";
import { CollectionGallery } from "./collection-gallery";
import { StoryBlockView, emptyStoryView } from "./story-blocks";
import { IconView } from "./icons";
import { MediaLightbox } from "./media-lightbox";
import { Panorama } from "./panorama";
import { QrCode } from "./qr-code";
import { CustomShapeView, Shape } from "./shape";
import { FormShell } from "./form-shell";
import { FeaturedSponsor } from "./featured-sponsor";
import { SponsorScroll } from "./sponsor-scroll";
import { MenuBlockView } from "./menu-block";

/**
 * The Calendar Style a block wears: its own, else the site default, else the
 * built-in look — which is an empty style, so nothing is generated for it.
 */
function resolveCalendarStyle(
  block: PageBlock,
  sources: PageSources
): CalendarStyleRecord {
  const display = normalizeCalendarDisplay(block.calendar);
  const id = display.styleId || sources.calendarDefaultStyleId;
  return (
    sources.calendarStyles[id] ?? {
      ...emptyCalendarStyle(),
      _id: "",
      slug: "built-in",
    }
  );
}

/* ------------------------------------------------------------- Reference blocks */

function BioCard({ bio }: { bio: PageSources["bios"][string] | undefined }) {
  if (!bio) return <div className="pb-empty-drop">No profile selected</div>;

  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
      {bio.headshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={protectedMediaUrl(bio.headshotUrl)}
          alt={bio.name}
          style={{ width: "6rem", height: "6rem", objectFit: "cover", borderRadius: "50%" }}
        />
      ) : null}
      <div>
        <h3 style={{ margin: "0 0 0.15rem" }}>{bio.name}</h3>
        {bio.title ? <p style={{ margin: 0, opacity: 0.75 }}>{bio.title}</p> : null}
        {bio.location ? (
          <p style={{ margin: 0, opacity: 0.6, fontSize: "0.875rem" }}>{bio.location}</p>
        ) : null}
        {bio.description ? <p style={{ marginBottom: 0 }}>{bio.description}</p> : null}
      </div>
    </div>
  );
}

/**
 * An image block plus whatever a click on it does.
 *
 * The image markup comes from the shared `ImageBlock` in every case, so a
 * linked image and a plain one are the same picture — only what wraps it
 * differs. In the builder canvas nothing wraps it at all, because a click there
 * selects the block.
 */
function ImageWithClick({
  block,
  sources,
  interactive,
}: {
  block: PageBlock;
  sources: PageSources;
  interactive: boolean;
}) {
  const [lightbox, setLightbox] = useState(false);
  const image = <ImageBlock block={block} />;

  if (!interactive || !block.mediaUrl || !block.clickAction || block.clickAction === "none") {
    return image;
  }

  if (block.clickAction === "lightbox") {
    return (
      <>
        <button type="button" className="pb-image-trigger" onClick={() => setLightbox(true)}>
          {image}
        </button>
        <MediaLightbox
          image={
            lightbox
              ? {
                  src: protectedMediaUrl(block.mediaUrl),
                  alt: block.alt,
                  caption: block.caption,
                }
              : null
          }
          onClose={() => setLightbox(false)}
        />
      </>
    );
  }

  // A page or collection resolves through `linkHrefs`; a custom url is used as
  // typed. An unresolved target renders the image unwrapped rather than as a
  // link to nowhere.
  const href =
    block.linkType === "url"
      ? block.linkHref ?? ""
      : sources.linkHrefs[
          (block.linkType === "collection" ? block.linkCollectionId : block.linkPageId) ?? ""
        ] ?? "";

  if (!href) return image;

  return (
    <Link
      href={href}
      className="pb-image-link"
      target={block.linkNewTab ? "_blank" : undefined}
      rel={block.linkNewTab ? "noreferrer" : undefined}
    >
      {image}
    </Link>
  );
}

/**
 * A shape, and the text that goes with it.
 *
 * Two style slots meet here. The block's own — `Shape style` in the inspector —
 * dresses the box the shape is drawn in; `shapeTextStyle` dresses the writing.
 * Keeping them apart is what lets a shape carry a shadow while its label
 * carries a typeface.
 *
 * Text placed `inside` is handed to the shape itself, which clips it to its
 * outline. `above` puts it in the flow instead, where the shape has no say over
 * it.
 */
function ShapeBlockView({ block, sources }: { block: PageBlock; sources: PageSources }) {
  const text = (block.text ?? "").trim();
  const placement = block.textPlacement ?? "inside";
  const box = blockTextProps(block);
  const label = styleSlotProps(block, "shapeTextStyle");

  const inside = placement === "inside" ? text : "";
  const common = {
    color: block.color ?? "#2b6cb0",
    borderWidth: block.borderWidth,
    borderColor: block.borderColor,
    className: box.className || undefined,
    style: box.style,
    text: inside,
    textClassName: label.className || undefined,
    textStyle: label.style,
  };

  const shape =
    block.type === "shape" ? (
      <Shape
        {...common}
        kind={block.shapeKind ?? "rectangle"}
        width={block.width ?? 12}
        height={block.height ?? 8}
        radius={block.radius}
        strokeWidth={block.strokeWidth}
      />
    ) : (
      <CustomShapeView
        {...common}
        shape={block.shapeSlug ? sources.shapes[block.shapeSlug] : undefined}
        width={block.width ?? 12}
        height={block.height ?? 12}
      />
    );

  if (!text || placement === "inside") return shape;

  return (
    <div className="pb-shape-stack">
      <span
        className={`pb-shape-label${label.className ? ` ${label.className}` : ""}`}
        style={label.style}
      >
        {text}
      </span>
      {shape}
    </div>
  );
}

/* ------------------------------------------------------------------ Blocks */

export function BlockView({
  block,
  sources,
  interactive = true,
}: {
  block: PageBlock;
  sources: PageSources;
  /** The builder preview turns interactivity off so clicks select instead. */
  interactive?: boolean;
}) {
  switch (block.type) {
    case "headline":
      return <HeadlineBlock block={block} />;

    case "plainText":
      return <PlainTextBlock block={block} />;

    case "richText":
      return <RichTextBlock block={block} />;

    case "image":
      return <ImageWithClick block={block} sources={sources} interactive={interactive} />;

    case "video":
      return <VideoBlock block={block} />;

    case "panoramaImage":
    case "panoramaVideo":
      return block.mediaUrl ? (
        <Panorama
          src={protectedMediaUrl(block.mediaUrl)}
          kind={block.type === "panoramaVideo" ? "video" : "image"}
          height={block.height || 24}
        />
      ) : (
        <div className="pb-empty-drop">No panorama media selected</div>
      );

    case "videoEmbed": {
      const src = embedUrlFor(block.embedUrl ?? "");
      if (!src) {
        return (
          <div className="pb-empty-drop">
            {block.embedUrl ? "That is not a YouTube or Vimeo link" : "No video link"}
          </div>
        );
      }
      return (
        <iframe
          className="pb-embed"
          src={src}
          title="Video player"
          style={{
            width: block.width ? `${block.width}rem` : "100%",
            height: `${block.height || 19.6875}rem`,
          }}
          // The attributes YouTube's own snippet carries, so a shared video
          // behaves the same here as it does on their page.
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      );
    }

    case "icon": {
      const size = `${block.iconSize ?? 2}rem`;
      return (
        <span className="pb-icon" style={{ color: block.color }}>
          <IconView name={block.iconName} width={size} height={size} />
        </span>
      );
    }

    case "shape":
    case "customShape":
      return <ShapeBlockView block={block} sources={sources} />;

    case "qrCode":
      return (
        <QrCode value={block.qrValue ?? ""} color={block.color} size={block.width ?? 10} />
      );

    case "button": {
      const { className, style } = blockTextProps(block);
      const href = block.href || "#";
      if (!interactive) {
        return (
          <span className={`pb-button ${className}`.trim()} style={style}>
            {block.label}
          </span>
        );
      }
      return (
        <Link
          href={href}
          className={`pb-button ${className}`.trim()}
          style={style}
          target={block.newTab ? "_blank" : undefined}
          rel={block.newTab ? "noreferrer" : undefined}
        >
          {block.label}
        </Link>
      );
    }

    case "bio":
      return <BioCard bio={block.bioId ? sources.bios[block.bioId] : undefined} />;

    case "collection": {
      const collection = block.collectionId ? sources.collections[block.collectionId] : undefined;
      if (!collection) return <div className="pb-empty-drop">No collection selected</div>;
      return (
        <CollectionGallery
          collection={collection}
          safeMode={sources.safeMode}
        />
      );
    }

    case "calendar":
      return (
        <CalendarBlock
          display={normalizeCalendarDisplay(block.calendar)}
          style={resolveCalendarStyle(block, sources)}
          layouts={sources.calendarLayouts}
          sources={sources}
          // Empty in the builder preview, where the block fetches its own.
          initialEvents={sources.calendarEvents[block.id] ?? []}
          todayKey={sources.calendarToday}
          interactive={interactive}
        />
      );

    case "eventList": {
      const settings = normalizeEventListSettings(block.eventList);
      const loaded = sources.eventLists[block.id];

      return (
        <EventListBlock
          block={block}
          settings={settings}
          // Filters run here rather than in the query: the server already sent
          // this page, and re-querying per filter would cost a round trip to
          // remove rows it could have skipped.
          initialEvents={filterCalendarEvents(loaded?.events ?? [], settings)}
          initialHasMore={Boolean(loaded?.hasMore)}
          todayKey={sources.calendarToday}
          layout={
            settings.templateId ? sources.calendarLayouts[settings.templateId] : undefined
          }
          sources={sources}
          interactive={interactive}
        />
      );
    }

    case "form": {
      const form = block.formId ? sources.forms[block.formId] : undefined;
      if (!form) return <div className="pb-empty-drop">No form selected</div>;
      return <FormShell form={form} interactive={interactive} />;
    }

    case "menu":
      return (
        <MenuBlockView
          block={block}
          items={sources.menus[block.id] ?? []}
          interactive={interactive}
        />
      );

    case "sponsorScroll":
      return (
        <SponsorScroll
          settings={normalizeSponsorScroll(block.sponsorScroll)}
          logos={sources.sponsorLogos[block.id] ?? []}
          // The canvas holds it still: a block that will not stay put is
          // hard to select, and its movement is not what is being arranged.
          designTime={!interactive}
        />
      );

    case "featuredSponsor":
      return (
        <FeaturedSponsor
          settings={normalizeFeaturedSponsor(block.featuredSponsor)}
          sponsor={sources.featuredSponsors[block.id]}
          // Each column resolves the same way every other style slot does, so
          // a named style saved anywhere on the site can dress one.
          logoColumn={styleSlotProps(block, "logoColumnStyle")}
          detailColumn={styleSlotProps(block, "detailColumnStyle")}
          designTime={!interactive}
        />
      );

    case "container":
      return (
        <ContainerView block={block} sources={sources} interactive={interactive} />
      );

    default:
      return null;
  }
}

function ContainerView({
  block,
  sources,
  interactive,
}: {
  block: PageBlock;
  sources: PageSources;
  interactive: boolean;
}) {
  if (!block.container) return null;
  const layout = ensureContainerLayout(block.container);

  // Slots inside the container read from whatever it is bound to. The two
  // bindings are independent: they fill different slots.
  const story =
    layout.storySource === "latest"
      ? sources.latestStoryView
      : layout.storySource === "specific"
        ? sources.storyViews[layout.storyId]
        : null;

  const collection =
    layout.collectionSource === "latest"
      ? sources.latestCollection
      : layout.collectionSource === "specific"
        ? sources.collections[layout.collectionId]
        : null;

  // A container is a teaser for whatever it is bound to, so its feature media
  // is the way in to the full story or collection.
  const storyHref = story?.slug ? `/stories/${story.slug}` : undefined;
  const collectionHref = collection?.slug ? `/collections/${collection.slug}` : undefined;

  // Areas — and the container itself — can use either binding's feature media
  // as their background.
  const bound = {
    story: story?.featureMediaUrl
      ? { url: story.featureMediaUrl, type: story.featureMediaType }
      : undefined,
    collection: collection?.featureImage
      ? { url: collection.featureImage.url, type: collection.featureImage.mediaType }
      : undefined,
  };

  return (
    <>
      {/* The grid — track counts, gaps and every cell placement, at all three
          breakpoints — cannot live in a style attribute, so it is one scoped
          sheet keyed to this container's id. */}
      <style dangerouslySetInnerHTML={{ __html: containerCss(block.id, layout) }} />
      <ContainerShell
        settings={layout.settings}
        style={containerShellStyle(layout)}
        innerStyle={containerShellInnerStyle(layout)}
        bound={bound}
      >
        <div
          className="pb-container"
          data-container={block.id}
          style={containerStyle(layout)}
        >
          {layout.cells.map((cell) => (
            <CellShell key={cell.id} cell={cell} bound={bound}>
              {(cell.blocks as PageBlock[]).map((child) => (
                <BlockWrapper key={child.id} block={child}>
                  {isStoryTemplateBlock(child) ? (
                    // The same component the story page and template canvas use.
                    <StoryBlockView
                      block={child as unknown as StoryTemplateBlock}
                      story={story ?? emptyStoryView}
                      showPlaceholders={!interactive}
                      featureHref={storyHref}
                    />
                  ) : isCollectionSlotBlock(child) ? (
                    <CollectionBlockView
                      block={child as unknown as CollectionSlotBlock}
                      collection={collection ?? null}
                      safeMode={sources.safeMode}
                      showPlaceholders={!interactive}
                      featureHref={collectionHref}
                    />
                  ) : (
                    <BlockView block={child} sources={sources} interactive={interactive} />
                  )}
                </BlockWrapper>
              ))}
            </CellShell>
          ))}
        </div>
      </ContainerShell>
    </>
  );
}


/* ------------------------------------------------------------ Row rendering */

export function ColumnView({
  column,
  sources,
  interactive = true,
}: {
  column: PageColumn;
  sources: PageSources;
  interactive?: boolean;
}) {
  return (
    <ColumnShell column={column}>
      {column.blocks.map((block) => (
        <BlockWrapper key={block.id} block={block}>
          <BlockView block={block} sources={sources} interactive={interactive} />
        </BlockWrapper>
      ))}
    </ColumnShell>
  );
}

export function RowView({
  row,
  sources,
  interactive = true,
}: {
  row: PageRow;
  sources: PageSources;
  interactive?: boolean;
}) {
  return (
    <RowShell row={row}>
      {row.columns.map((column) => (
        <ColumnView
          key={column.id}
          column={column}
          sources={sources}
          interactive={interactive}
        />
      ))}
    </RowShell>
  );
}

export function LayoutView({
  layout,
  sources,
  interactive = true,
  className,
  style,
}: {
  layout: PageRow[];
  sources: PageSources;
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  // One sheet for every per-view style override on the page. Empty — and so
  // not rendered at all — unless a block actually carries one.
  const responsiveCss = [
    layoutResponsiveCss(layout),
    // Calendar templates are separate layouts loaded by id, so the page
    // layout above never reaches them. Without this a per-view style set on a
    // slot works on the builder canvas and silently does nothing once
    // published.
    ...Object.values(sources.calendarLayouts).map(layoutResponsiveCss),
    // Every Calendar Style on the page, as one sheet.
    ...Object.values(sources.calendarStyles).map(calendarStyleCss),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className={className} style={style}>
      {responsiveCss ? (
        <style dangerouslySetInnerHTML={{ __html: responsiveCss }} />
      ) : null}
      {layout.map((row) => (
        <RowView key={row.id} row={row} sources={sources} interactive={interactive} />
      ))}
    </div>
  );
}

export { customStyleClassName };
