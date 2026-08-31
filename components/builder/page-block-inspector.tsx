"use client";

import { MediaField } from "@/app/admin/media/media-picker";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  CheckField,
  ColorField,
  NumField,
  RemField,
  SelectField,
  TextField,
} from "@/components/builder/settings-fields";
import { ICON_NAMES } from "@/components/icons";
import type { BuilderSources } from "@/lib/builder-sources";
import {
  PAGE_BLOCK_TYPES,
  PAGE_LINK_TYPES,
  PAGE_LINK_TYPE_LABELS,
  SHAPE_KINDS,
  SHAPE_TEXT_PLACEMENTS,
  SHAPE_TEXT_PLACEMENT_LABELS,
  type PageBlock,
} from "@/lib/page-layout";
import {
  MEDIA_CLICK_ACTIONS,
  MEDIA_CLICK_ACTION_LABELS,
} from "@/lib/story-media";

import {
  isCalendarSlotBlock,
  type CalendarSlotBlock,
} from "@/lib/calendar-slot-layout";
import {
  isDocTemplateBlock,
  type DocTemplateBlock,
} from "@/lib/doc-template-layout";
import {
  isCollectionSlotBlock,
  type CollectionSlotBlock,
} from "@/lib/collection-slot-layout";
import { ensureContainerLayout } from "@/lib/page-container-layout";
import {
  isStoryTemplateBlock,
  type StoryTemplateBlock,
} from "@/lib/story-template-layout";

import {
  CollectionBlockInspector,
  COLLECTION_SLOT_LABELS,
} from "./collection-block-inspector";
import { CalendarBlockInspector } from "./calendar-block-inspector";
import { CalendarSlotInspector } from "./calendar-slot-inspector";
import { DocSlotInspector } from "./doc-slot-inspector";
import { EventListInspector } from "./event-list-inspector";
import { ContainerInspector } from "./container-inspector";
import type { InspectorContext, PaletteItem } from "./layout-builder";
import {
  StoryBlockInspector,
  blockStyleTarget,
  type OpenStyleEditor,
  type StyleTarget,
} from "./story-block-inspector";

/**
 * The page builder's block vocabulary and settings panel.
 *
 * Shared with the story template builder, which is the page builder plus story
 * slots — one definition means a new page block or setting reaches both.
 */

/**
 * What clicking an image does. Only the fields the chosen action uses are
 * shown; the normaliser clears the rest on save.
 */
function ImageClickFields({
  block,
  sources,
  update,
}: {
  block: PageBlock;
  sources: BuilderSources;
  update: (patch: Partial<PageBlock>) => void;
}) {
  const clickAction = block.clickAction ?? "none";
  const linkType = block.linkType ?? "page";

  // Only published pages and public collections have an address a visitor can
  // reach, so those are the only ones offered.
  const targets =
    linkType === "collection"
      ? sources.collections.filter((collection) => collection.isPublic)
      : sources.pages;

  return (
    <>
      <SelectField
        label="On click"
        value={clickAction}
        options={MEDIA_CLICK_ACTIONS.map((action) => ({
          value: action,
          label: MEDIA_CLICK_ACTION_LABELS[action],
        }))}
        onChange={(value) => update({ clickAction: value })}
      />

      {clickAction === "link" ? (
        <>
          <SelectField
            label="Link type"
            value={linkType}
            options={PAGE_LINK_TYPES.map((type) => ({
              value: type,
              label: PAGE_LINK_TYPE_LABELS[type],
            }))}
            onChange={(value) => update({ linkType: value })}
          />

          {linkType === "url" ? (
            <TextField
              label="URL"
              value={block.linkHref ?? ""}
              onChange={(value) => update({ linkHref: value })}
            />
          ) : (
            <SelectField
              label={linkType === "collection" ? "Collection" : "Page"}
              value={
                (linkType === "collection" ? block.linkCollectionId : block.linkPageId) ?? ""
              }
              options={[
                {
                  value: "",
                  label: targets.length
                    ? "Select…"
                    : `No published ${linkType === "collection" ? "collections" : "pages"}`,
                },
                ...targets.map((target) => ({ value: target._id, label: target.label })),
              ]}
              onChange={(value) =>
                update(
                  linkType === "collection"
                    ? { linkCollectionId: value }
                    : { linkPageId: value }
                )
              }
            />
          )}

          <CheckField
            label="Open in a new tab"
            value={Boolean(block.linkNewTab)}
            onChange={(checked) => update({ linkNewTab: checked })}
          />
        </>
      ) : null}
    </>
  );
}

const BLOCK_LABELS: Record<string, string> = {
  headline: "Headline",
  plainText: "Plain text",
  richText: "Rich text",
  image: "Image",
  video: "Video",
  panoramaImage: "Panorama image",
  panoramaVideo: "Panorama video",
  videoEmbed: "Video embed",
  icon: "Icon",
  shape: "Shape",
  customShape: "Custom shape",
  qrCode: "QR code",
  button: "Button",
  bio: "Profile",
  collection: "Collection",
  calendar: "Calendar",
  eventList: "Event list",
  form: "Form",
  menu: "Menu",
  container: "Container",

  // Story slots. Not in the palette — they are added from a story-bound
  // container — but the outline still has to name them.
  storyHeadline: "Story headline",
  storySubHeadline: "Story sub headline",
  storyDate: "Story date",
  storyCategory: "Story category",
  storyLocation: "Story location",
  storyAuthor: "Story author",
  storyMeta: "Story meta line",
  storyFeatureMedia: "Story feature media",
  storyContent: "Story content",
  storyLink: "Story link",

  // Collection slots, added from a collection-bound container.
  ...COLLECTION_SLOT_LABELS,
};

/** A recognisable glyph for each block, shown above its name in the palette. */
const BLOCK_ICONS: Record<string, string> = {
  headline: "Heading",
  plainText: "Type",
  richText: "Pilcrow",
  image: "Image",
  video: "Video",
  panoramaImage: "Orbit",
  panoramaVideo: "View",
  videoEmbed: "MonitorPlay",
  icon: "Sparkles",
  shape: "Square",
  customShape: "Shapes",
  qrCode: "QrCode",
  button: "MousePointerClick",
  bio: "Contact",
  collection: "Images",
  calendar: "Calendar",
  eventList: "Rows",
  form: "ClipboardList",
  menu: "List",
  container: "LayoutGrid",
};

const PALETTE: PaletteItem[] = PAGE_BLOCK_TYPES.map((type) => ({
  type,
  label: BLOCK_LABELS[type] ?? type,
  icon: BLOCK_ICONS[type],
}));

const TEXT_BLOCKS = new Set(["headline", "plainText", "richText", "button"]);

/** Blocks that render no text of their own — the popup hides typography for these. */
const MEDIA_BLOCKS = new Set(["image", "video"]);

/**
 * The two shape blocks, which carry two style slots rather than one: the box
 * the shape is drawn in, and the text on it.
 */
const SHAPE_BLOCKS = new Set(["shape", "customShape"]);

/** Every block whose appearance the style popup can drive. */
const STYLEABLE_BLOCKS = new Set([...TEXT_BLOCKS, ...MEDIA_BLOCKS, ...SHAPE_BLOCKS]);

/** The style slot that dresses a shape's text, separate from the shape itself. */
function shapeTextStyleTarget(block: PageBlock): StyleTarget {
  return {
    title: "Shape text style",
    slugKey: "shapeTextStyleSlug",
    valuesKey: "shapeTextStyle",
    slug: block.shapeTextStyleSlug,
    values: block.shapeTextStyle,
    showTypography: true,
  };
}

/**
 * A shape's label: the wording, and whether it sits inside the outline or above
 * it. Shared by both shape blocks, which differ only in where the outline comes
 * from.
 */
function ShapeTextFields({
  block,
  update,
}: {
  block: PageBlock;
  update: (patch: Partial<PageBlock>) => void;
}) {
  return (
    <>
      <div className="field">
        <label>Text</label>
        <textarea
          rows={2}
          value={block.text ?? ""}
          onChange={(event) => update({ text: event.target.value })}
        />
      </div>
      <SelectField
        label="Text placement"
        value={block.textPlacement ?? "inside"}
        options={SHAPE_TEXT_PLACEMENTS.map((placement) => ({
          value: placement,
          label: SHAPE_TEXT_PLACEMENT_LABELS[placement],
        }))}
        onChange={(value) => update({ textPlacement: value })}
      />
      <span className="help-text">
        {(block.textPlacement ?? "inside") === "inside"
          ? block.shapeKind === "line"
            ? "A line has no inside — text placed in it sits across the line."
            : "Text inside is held to the shape’s outline and cut off at it. Use the text style to set its size and spacing."
          : "Text above the shape is laid out normally, with nothing constraining it."}
      </span>
    </>
  );
}

export const PAGE_PALETTE: PaletteItem[] = PAGE_BLOCK_TYPES.map((type) => ({
  type,
  label: BLOCK_LABELS[type] ?? type,
  icon: BLOCK_ICONS[type],
}));

export { BLOCK_LABELS, BLOCK_ICONS, MEDIA_BLOCKS, STYLEABLE_BLOCKS };

export function PageBlockInspector({
  block,
  update,
  sources,
  onEditStyle,
  context,
}: {
  block: PageBlock;
  update: (patch: Partial<PageBlock>) => void;
  sources: BuilderSources;
  /** Opens the shared style popup against one of the block's style slots. */
  onEditStyle: OpenStyleEditor;
  context: InspectorContext;
}) {
  // Story slots inside a story-bound container use the same panel the template
  // builder uses, so a control added there reaches both.
  if (isStoryTemplateBlock(block)) {
    return (
      <StoryBlockInspector
        block={block as unknown as StoryTemplateBlock}
        update={update}
        onEditStyle={onEditStyle}
      />
    );
  }

  // Documentation slots inside a doc template, the same way.
  if (isDocTemplateBlock(block)) {
    return (
      <DocSlotInspector
        block={block as unknown as DocTemplateBlock}
        update={update}
        onEditStyle={onEditStyle}
        fonts={sources.fonts}
      />
    );
  }

  // Calendar slots inside a layout template, the same way.
  if (isCalendarSlotBlock(block)) {
    return (
      <CalendarSlotInspector
        block={block as unknown as CalendarSlotBlock}
        update={update}
        onEditStyle={onEditStyle}
        levels={sources.roles.filter((role) => role.kind === "community")}
      />
    );
  }

  // Collection slots inside a collection-bound container, the same way.
  if (isCollectionSlotBlock(block)) {
    return (
      <CollectionBlockInspector
        block={block as unknown as CollectionSlotBlock}
        update={update}
        onEditStyle={onEditStyle}
      />
    );
  }

  // A container has no content or placement of its own — it is a grid, and the
  // blocks inside it carry those settings. Its background, border and spacing
  // are part of its own panel.
  if (block.type === "container" && block.container) {
    return (
      <ContainerInspector
        block={block}
        layout={ensureContainerLayout(block.container)}
        breakpoint={context.viewport}
        onChange={(container) => update({ container })}
        selectedCellIndex={context.selectedCellIndex}
        onSelectCell={context.onSelectCell}
        onAddBlockToCell={context.onAddBlockToCell}
        onInsertBlockIntoCell={context.onInsertBlockIntoCell}
        onSelectCellBlock={context.onSelectCellBlock}
        blockLabel={(item) => BLOCK_LABELS[item.type] ?? item.type}
        stories={sources.stories}
        collections={sources.collections}
        savedBlocks={context.savedBlocks}
        onSaveBlock={context.onSaveBlock}
        onDeleteSavedBlock={context.onDeleteSavedBlock}
      />
    );
  }

  return (
    <>
      {SHAPE_BLOCKS.has(block.type) ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Style</h4>
          {/* Two slots, because a shape and the writing on it are two things:
              the first dresses the box the shape is drawn in, the second the
              text laid over it. */}
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginRight: "0.25rem", marginBottom: "0.25rem" }}
            onClick={() => onEditStyle(blockStyleTarget(block, "Shape style", false), update)}
          >
            Shape style…
          </button>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginBottom: "0.25rem" }}
            onClick={() => onEditStyle(shapeTextStyleTarget(block), update)}
          >
            Text style…
          </button>
          <p className="help-text">
            Shadow, spacing, opacity and scale dress the shape&rsquo;s box; its
            fill, outline and size are below. The text style sets the typeface,
            size, colour and padding of the shape&rsquo;s own text.
          </p>
        </div>
      ) : STYLEABLE_BLOCKS.has(block.type) ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Style</h4>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              onEditStyle(
                blockStyleTarget(block, "Block style", !MEDIA_BLOCKS.has(block.type)),
                update
              )
            }
          >
            Edit style…
          </button>
          <p className="help-text">
            {block.styleSlug
              ? `Using the “${block.styleSlug}” named style.`
              : MEDIA_BLOCKS.has(block.type)
                ? "Border, corners, shadow, spacing and opacity."
                : "Using local text settings."}
          </p>
        </div>
      ) : null}

      <div className="inspector-section">
        <h4 className="inspector-title">Content</h4>

        {block.type === "headline" ? (
          <>
            <TextField
              label="Text"
              value={block.text ?? ""}
              onChange={(value) => update({ text: value })}
            />
            <NumField
              label="Heading level"
              value={block.level ?? 2}
              min={1}
              max={6}
              onChange={(value) => update({ level: value as PageBlock["level"] })}
            />
          </>
        ) : null}

        {block.type === "plainText" ? (
          <div className="field">
            <label>Text</label>
            <textarea
              rows={4}
              value={block.text ?? ""}
              onChange={(event) => update({ text: event.target.value })}
            />
          </div>
        ) : null}

        {block.type === "richText" ? (
          <RichTextEditor
            value={block.html ?? ""}
            onChange={(html) => update({ html })}
            fonts={sources.fonts}
            minHeight={10}
          />
        ) : null}

        {(block.type === "image" || block.type === "panoramaImage") ? (
          <>
            <MediaField
              label="Image"
              value={block.mediaUrl ?? ""}
              mediaType="image"
              onChange={(url, asset) => update({ mediaUrl: url, mediaId: asset?._id ?? "" })}
            />
            <TextField
              label="Alt text"
              value={block.alt ?? ""}
              onChange={(value) => update({ alt: value })}
            />
            <TextField
              label="Caption"
              value={block.caption ?? ""}
              onChange={(value) => update({ caption: value })}
            />
            <div className="inspector-grid">
              <RemField
                label="Width (0 = full)"
                value={block.width ?? 0}
                onChange={(value) => update({ width: value })}
              />
              <RemField
                label="Height (0 = auto)"
                value={block.height ?? 0}
                onChange={(value) => update({ height: value })}
              />
              <SelectField
                label="Fit"
                value={block.objectFit ?? "cover"}
                options={[
                  { value: "cover", label: "Cover" },
                  { value: "contain", label: "Contain" },
                ]}
                onChange={(value) => update({ objectFit: value })}
              />
            </div>

            {block.type === "image" ? (
              <ImageClickFields block={block} sources={sources} update={update} />
            ) : null}
          </>
        ) : null}

        {block.type === "videoEmbed" ? (
          <>
            <TextField
              label="Video link"
              value={block.embedUrl ?? ""}
              onChange={(embedUrl) => update({ embedUrl })}
            />
            <span className="help-text">
              A YouTube or Vimeo address. The link from the address bar, the
              share menu or an embed snippet all work.
            </span>
            <div className="inspector-grid">
              <RemField
                label="Width (0 = full)"
                value={block.width ?? 35}
                onChange={(width) => update({ width })}
              />
              <RemField
                label="Height"
                value={block.height ?? 19.6875}
                onChange={(height) => update({ height })}
              />
            </div>
          </>
        ) : null}

        {(block.type === "video" || block.type === "panoramaVideo") ? (
          <>
            <MediaField
              label="Video"
              value={block.mediaUrl ?? ""}
              mediaType="video"
              onChange={(url, asset) => update({ mediaUrl: url, mediaId: asset?._id ?? "" })}
            />
            <TextField
              label="Caption"
              value={block.caption ?? ""}
              onChange={(value) => update({ caption: value })}
            />
            <div className="inspector-grid">
              <RemField
                label="Width (0 = full)"
                value={block.width ?? 0}
                onChange={(value) => update({ width: value })}
              />
              <RemField
                label="Height (0 = auto)"
                value={block.height ?? 0}
                onChange={(value) => update({ height: value })}
              />
            </div>
            <CheckField
              label="Show controls"
              value={block.controls !== false}
              onChange={(value) => update({ controls: value })}
            />
            <CheckField
              label="Autoplay"
              value={Boolean(block.autoplay)}
              onChange={(value) => update({ autoplay: value })}
            />
            <CheckField
              label="Loop"
              value={Boolean(block.loop)}
              onChange={(value) => update({ loop: value })}
            />
            <CheckField
              label="Muted"
              value={block.muted !== false}
              onChange={(value) => update({ muted: value })}
            />
          </>
        ) : null}

        {block.type === "icon" ? (
          <>
            <SelectField
              label="Icon"
              value={block.iconName ?? "Star"}
              options={ICON_NAMES.map((name) => ({ value: name, label: name }))}
              onChange={(value) => update({ iconName: value })}
            />
            <RemField
              label="Size"
              value={block.iconSize ?? 2}
              onChange={(value) => update({ iconSize: value })}
            />
            <ColorField
              label="Colour"
              value={block.color ?? "#16181d"}
              onChange={(value) => update({ color: value })}
            />
          </>
        ) : null}

        {block.type === "shape" ? (
          <>
            <SelectField
              label="Shape"
              value={block.shapeKind ?? "rectangle"}
              options={SHAPE_KINDS.map((kind) => ({ value: kind, label: kind }))}
              onChange={(value) => update({ shapeKind: value })}
            />
            <ColorField
              label="Fill"
              value={block.color ?? "#2b6cb0"}
              onChange={(value) => update({ color: value })}
            />
            <div className="inspector-grid">
              {/* Width and height stay explicit so filled shapes cannot collapse. */}
              <RemField
                label="Width"
                value={block.width ?? 12}
                onChange={(value) => update({ width: Math.max(0.25, value) })}
              />
              <RemField
                label="Height"
                value={block.height ?? 8}
                onChange={(value) => update({ height: Math.max(0.25, value) })}
              />
              {block.shapeKind === "rectangle" ? (
                <RemField
                  label="Corner radius"
                  value={block.radius ?? 0}
                  onChange={(value) => update({ radius: value })}
                />
              ) : null}
              {block.shapeKind === "line" ? (
                <RemField
                  label="Thickness"
                  value={block.strokeWidth ?? 0.125}
                  step={0.0625}
                  onChange={(value) => update({ strokeWidth: value })}
                />
              ) : null}
            </div>

            {block.shapeKind !== "line" ? (
              <>
                <RemField
                  label="Border width"
                  value={block.borderWidth ?? 0}
                  step={0.0625}
                  onChange={(value) => update({ borderWidth: Math.max(0, value) })}
                />
                {(block.borderWidth ?? 0) > 0 ? (
                  <ColorField
                    label="Border colour"
                    value={block.borderColor ?? "#16181d"}
                    onChange={(value) => update({ borderColor: value })}
                  />
                ) : null}
              </>
            ) : null}

            <ShapeTextFields block={block} update={update} />
          </>
        ) : null}

        {block.type === "customShape" ? (
          <>
            <SelectField
              label="Shape"
              value={block.shapeSlug ?? ""}
              options={[
                { value: "", label: "Select a shape…" },
                ...sources.shapes.map((shape) => ({ value: shape.slug, label: shape.name })),
              ]}
              onChange={(value) => update({ shapeSlug: value })}
            />
            <ColorField
              label="Fill"
              value={block.color ?? "#2b6cb0"}
              onChange={(value) => update({ color: value })}
            />
            <div className="inspector-grid">
              <RemField label="Width" value={block.width ?? 12} onChange={(v) => update({ width: v })} />
              <RemField label="Height" value={block.height ?? 12} onChange={(v) => update({ height: v })} />
            </div>
            <RemField
              label="Border width"
              value={block.borderWidth ?? 0}
              step={0.0625}
              onChange={(value) => update({ borderWidth: Math.max(0, value) })}
            />
            {(block.borderWidth ?? 0) > 0 ? (
              <ColorField
                label="Border colour"
                value={block.borderColor ?? "#16181d"}
                onChange={(value) => update({ borderColor: value })}
              />
            ) : null}

            <ShapeTextFields block={block} update={update} />
          </>
        ) : null}

        {block.type === "qrCode" ? (
          <>
            <TextField
              label="Value or URL"
              value={block.qrValue ?? ""}
              onChange={(value) => update({ qrValue: value })}
            />
            <RemField label="Size" value={block.width ?? 10} onChange={(v) => update({ width: v })} />
            <ColorField
              label="Colour"
              value={block.color ?? "#000000"}
              onChange={(value) => update({ color: value })}
            />
          </>
        ) : null}

        {block.type === "button" ? (
          <>
            <TextField
              label="Label"
              value={block.label ?? ""}
              onChange={(value) => update({ label: value })}
            />
            <TextField
              label="Link"
              value={block.href ?? ""}
              onChange={(value) => update({ href: value })}
            />
            <CheckField
              label="Open in a new tab"
              value={Boolean(block.newTab)}
              onChange={(value) => update({ newTab: value })}
            />
          </>
        ) : null}

        {block.type === "bio" ? (
          <SelectField
            label="Profile"
            value={block.bioId ?? ""}
            options={[
              { value: "", label: "Select a profile…" },
              ...sources.bios.map((bio) => ({ value: bio._id, label: bio.label })),
            ]}
            onChange={(value) => update({ bioId: value })}
          />
        ) : null}

        {block.type === "collection" ? (
          <SelectField
            label="Collection"
            value={block.collectionId ?? ""}
            options={[
              { value: "", label: "Select a collection…" },
              ...sources.collections.map((collection) => ({
                value: collection._id,
                label: collection.label,
              })),
            ]}
            onChange={(value) => update({ collectionId: value })}
          />
        ) : null}

        {block.type === "calendar" ? (
          <CalendarBlockInspector
            block={block}
            update={update}
            styles={sources.calendarStyles.map((style) => ({
              _id: style._id,
              name: style.name,
            }))}
            defaultStyleId={sources.calendarDefaultStyleId}
            categories={sources.calendarCategories}
            who={sources.calendarWho}
            tags={sources.calendarTags}
          />
        ) : null}

        {block.type === "eventList" ? (
          <EventListInspector
            block={block}
            update={update}
            templates={sources.calendarEventTemplates}
            onEditStyle={onEditStyle}
            categories={sources.calendarCategories}
            who={sources.calendarWho}
            tags={sources.calendarTags}
          />
        ) : null}

        {block.type === "form" ? (
          <SelectField
            label="Form"
            value={block.formId ?? ""}
            options={[
              { value: "", label: "Select a form…" },
              ...sources.forms.map((form) => ({ value: form._id, label: form.label })),
            ]}
            onChange={(value) => update({ formId: value })}
          />
        ) : null}

        {block.type === "menu" ? (
          <>
            <SelectField
              label="Menu"
              value={block.menuId ?? ""}
              options={[
                { value: "", label: "Select a menu…" },
                ...sources.menus.map((menu) => ({ value: menu._id, label: menu.label })),
              ]}
              onChange={(value) => update({ menuId: value })}
            />
            <span className="help-text">
              Built under Design › Menus. Items the reader may not see are left
              out for them.
            </span>

            <SelectField
              label="Shows as"
              value={block.menuLayout ?? "list"}
              options={[
                { value: "list", label: "A list of links" },
                { value: "dropdown", label: "A button that drops down" },
              ]}
              onChange={(value) => update({ menuLayout: value as PageBlock["menuLayout"] })}
            />

            {(block.menuLayout ?? "list") === "dropdown" ? (
              <TextField
                label="Button text"
                value={block.menuButtonText ?? ""}
                onChange={(value) => update({ menuButtonText: value })}
              />
            ) : (
              <SelectField
                label="Runs"
                value={block.menuDirection ?? "vertical"}
                options={[
                  { value: "vertical", label: "Down the page" },
                  { value: "horizontal", label: "Across the page" },
                ]}
                onChange={(value) =>
                  update({ menuDirection: value as PageBlock["menuDirection"] })
                }
              />
            )}
          </>
        ) : null}
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Placement</h4>
        <SelectField
          label="Alignment"
          value={block.align ?? "left"}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
          onChange={(value) => update({ align: value })}
        />
      </div>
    </>
  );
}
