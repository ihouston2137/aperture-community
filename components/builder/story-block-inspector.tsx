"use client";

import { IconField } from "@/components/icon-picker";
import { ASPECT_RATIOS, aspectRatioLabel } from "@/lib/aspect-ratio";
import type { PageBlock } from "@/lib/page-layout";
import type { StyleValues } from "@/lib/style-values";
import {
  STORY_MEDIA_SIZES,
  STORY_META_FIELDS,
  type StoryMediaSize,
  type StoryTemplateBlock,
} from "@/lib/story-template-layout";

import { CheckField, RemField, SelectField, TextField } from "./settings-fields";

/**
 * Settings for a story slot.
 *
 * Shared by the story template builder and the page builder, because a
 * story-bound container holds exactly the same slots — a control added here
 * reaches both, which is the trap this codebase keeps falling into when a
 * builder grows its own copy.
 */

/**
 * Which pair of fields the style popup is editing. A block has a container
 * style plus one per part (image, caption, icon), and they all go through the
 * same popup.
 */
export type StyleTarget = {
  title: string;
  slugKey: string;
  valuesKey: string;
  slug?: string;
  values?: StyleValues;
  showTypography: boolean;
  /**
   * No saved styles and no per-view overrides for this slot.
   *
   * Both of those arrive as a CSS class, and a class can only be laid on an
   * element. A shape's style is not laid on anything — it is read apart and
   * handed to the drawing, so its fill can be the fill and its shadow can
   * follow the silhouette. There is no way to take a fill back out of a class.
   */
  valuesOnly?: boolean;
};

export type OpenStyleEditor = (
  target: StyleTarget,
  update: (patch: Partial<PageBlock>) => void
) => void;

/** The block's own style, the one every slot type has. */
export function blockStyleTarget(
  block: { styleSlug?: string; textStyle?: StyleValues },
  title = "Block style",
  showTypography = true,
  valuesOnly = false
): StyleTarget {
  return {
    title,
    slugKey: "styleSlug",
    valuesKey: "textStyle",
    slug: block.styleSlug,
    values: block.textStyle,
    showTypography,
    valuesOnly,
  };
}

const SLOT_LABELS: Record<string, string> = {
  storyHeadline: "Headline",
  storySubHeadline: "Sub headline",
  storyDate: "Date",
  storyCategory: "Category",
  storyLocation: "Location",
  storyAuthor: "Author",
  storyMeta: "Meta line",
  storyFeatureMedia: "Feature media",
  storyContent: "Story content",
  storyLink: "Link to the story",
};

const SLOT_ICONS: Record<string, string> = {
  storyHeadline: "Heading",
  storySubHeadline: "Type",
  storyDate: "Calendar",
  storyCategory: "Tag",
  storyLocation: "MapPin",
  storyAuthor: "User",
  storyMeta: "Info",
  storyFeatureMedia: "Image",
  storyContent: "Pilcrow",
  storyLink: "Link",
};

const META_FIELD_LABELS: Record<string, string> = {
  date: "Date",
  category: "Category",
  location: "Location",
  author: "Author",
};

const SIZE_LABELS: Record<StoryMediaSize, string> = {
  full: "Full — the media's own size",
  scaledWidth: "Scaled to width",
  scaledHeight: "Scaled to height",
  custom: "Custom size",
};

export { SLOT_LABELS, SLOT_ICONS };

export function StoryBlockInspector({
  block,
  update,
  onEditStyle,
}: {
  block: StoryTemplateBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
}) {
  /** A style popup for one part of the block, e.g. its image or its icon. */
  const slotTarget = (
    slot: "image" | "caption" | "icon",
    title: string,
    showTypography: boolean
  ): StyleTarget => ({
    title,
    slugKey: `${slot}StyleSlug`,
    valuesKey: `${slot}Style`,
    slug: block[`${slot}StyleSlug`],
    values: block[`${slot}Style`],
    showTypography,
  });

  const styleButton = (label: string, target: StyleTarget) => (
    <button
      type="button"
      className="btn btn-sm"
      style={{ marginRight: "0.25rem", marginBottom: "0.25rem" }}
      onClick={() => onEditStyle(target, update)}
    >
      {label}
    </button>
  );

  const patch = (values: Partial<StoryTemplateBlock>) =>
    update(values as Partial<PageBlock>);

  const size = block.mediaSize ?? "scaledWidth";
  const fixedAspect = (block.mediaAspect ?? "actual") !== "actual";

  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">Style</h4>
        {styleButton("Edit style…", blockStyleTarget(block))}

        {block.type === "storyFeatureMedia" ? (
          <>
            {styleButton("Image…", slotTarget("image", "Image style", false))}
            {block.showCaption !== false
              ? styleButton("Caption…", slotTarget("caption", "Caption style", true))
              : null}
          </>
        ) : null}

        {block.type === "storyContent"
          ? styleButton("Images…", slotTarget("image", "Image style", false))
          : null}

        {block.type === "storyLink" && block.iconName
          ? styleButton("Icon…", slotTarget("icon", "Icon style", false))
          : null}

        <p className="help-text">
          {block.styleSlug
            ? `Using the “${block.styleSlug}” named style.`
            : "Spacing, line height and colours all live here — nothing is applied by default."}
        </p>
      </div>

      {block.type === "storyMeta" ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Meta fields</h4>
          {STORY_META_FIELDS.map((field) => (
            <CheckField
              key={field}
              label={META_FIELD_LABELS[field]}
              value={(block.metaFields ?? []).includes(field)}
              onChange={(checked) => {
                const current = block.metaFields ?? [];
                patch({
                  metaFields: checked
                    ? [...current, field]
                    : current.filter((item) => item !== field),
                });
              }}
            />
          ))}
          <TextField
            label="Separator"
            value={block.separator ?? "·"}
            onChange={(value) => patch({ separator: value })}
          />
        </div>
      ) : null}

      {block.type === "storyDate" ? (
        <div className="inspector-section">
          <SelectField
            label="Date format"
            value={block.dateFormat ?? "long"}
            options={[
              { value: "long", label: "12 March 2026" },
              { value: "short", label: "12 Mar 2026" },
              { value: "year", label: "2026" },
            ]}
            onChange={(value) => patch({ dateFormat: value })}
          />
        </div>
      ) : null}

      {block.type === "storyFeatureMedia" ? (
        <>
          <div className="inspector-section">
            <h4 className="inspector-title">Caption</h4>
            <CheckField
              label="Show the caption"
              value={block.showCaption !== false}
              onChange={(value) => patch({ showCaption: value })}
            />
            <p className="help-text">
              Comes from the media file&rsquo;s own details, not the story.
            </p>
          </div>

          <div className="inspector-section">
            <h4 className="inspector-title">Size</h4>
            <SelectField
              label="Size"
              value={size}
              options={STORY_MEDIA_SIZES.map((value) => ({
                value,
                label: SIZE_LABELS[value],
              }))}
              onChange={(value) => patch({ mediaSize: value })}
            />

            {size === "full" ? (
              <p className="help-text" style={{ marginTop: 0 }}>
                The media renders at its own size, never wider than its column.
              </p>
            ) : (
              <>
                <div className="inspector-grid">
                  <SelectField
                    label="Fit"
                    value={block.mediaFit === "fit" ? "fit" : "fill"}
                    options={[
                      { value: "fill", label: "Fill (cropped)" },
                      { value: "fit", label: "Fit" },
                    ]}
                    onChange={(value) => patch({ mediaFit: value })}
                  />
                  <SelectField
                    label="Aspect ratio"
                    value={block.mediaAspect ?? "actual"}
                    options={ASPECT_RATIOS.map((value) => ({
                      value,
                      label: aspectRatioLabel(value),
                    }))}
                    onChange={(value) => patch({ mediaAspect: value })}
                  />
                </div>

                <div className="inspector-grid">
                  {size === "custom" ? (
                    <RemField
                      label="Fixed width"
                      value={block.mediaWidth ?? 24}
                      onChange={(value) => patch({ mediaWidth: Math.max(0.5, value) })}
                    />
                  ) : null}

                  {/* An aspect ratio already supplies the second axis, so the
                      height field would only be a way to contradict it. */}
                  {size === "scaledHeight" || (size === "custom" && !fixedAspect) ? (
                    <RemField
                      label="Fixed height"
                      value={block.mediaHeight ?? 16}
                      onChange={(value) => patch({ mediaHeight: Math.max(0.5, value) })}
                    />
                  ) : null}
                </div>

                {size === "scaledHeight" && fixedAspect ? (
                  <p className="help-text" style={{ marginTop: 0 }}>
                    The height below sets the frame; the ratio sets its width.
                  </p>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : null}

      {block.type === "storyLink" ? (
        <>
          <div className="inspector-section">
            <h4 className="inspector-title">Link</h4>
            <TextField
              label="Text"
              value={block.linkText ?? ""}
              onChange={(value) => patch({ linkText: value })}
            />
            <p className="help-text">
              Points at the bound story&rsquo;s page. On the canvas it renders as
              plain text so a click cannot navigate away.
            </p>
          </div>

          <div className="inspector-section">
            <h4 className="inspector-title">Icon</h4>
            <IconField
              label="Icon"
              value={block.iconName}
              onChange={(name) => patch({ iconName: name })}
            />
            {block.iconName ? (
              <>
                <div className="inspector-grid">
                  <RemField
                    label="Size"
                    value={block.iconSize ?? 1}
                    onChange={(value) => patch({ iconSize: Math.max(0.25, value) })}
                  />
                  <SelectField
                    label="Placement"
                    value={block.iconPlacement ?? "after"}
                    options={[
                      { value: "before", label: "Before the text" },
                      { value: "after", label: "After the text" },
                    ]}
                    onChange={(value) => patch({ iconPlacement: value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => patch({ iconName: "" })}
                >
                  Remove the icon
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}

      {block.type === "storyContent" ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Text flow</h4>
          <RemField
            label="Paragraph spacing (0 = default)"
            value={block.paragraphSpacing ?? 0}
            onChange={(value) => patch({ paragraphSpacing: value })}
          />
          <p className="help-text">Line height is part of the block style above.</p>
        </div>
      ) : null}
    </>
  );
}
