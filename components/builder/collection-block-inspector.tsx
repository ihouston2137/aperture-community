"use client";

import { IconField } from "@/components/icon-picker";
import { ASPECT_RATIOS, aspectRatioLabel } from "@/lib/aspect-ratio";
import type { CollectionSlotBlock } from "@/lib/collection-slot-layout";
import type { PageBlock } from "@/lib/page-layout";
import { STORY_MEDIA_SIZES, type StoryMediaSize } from "@/lib/story-template-layout";

import { CheckField, RemField, SelectField, TextField } from "./settings-fields";
import { blockStyleTarget, type OpenStyleEditor, type StyleTarget } from "./story-block-inspector";

/**
 * Settings for a collection slot, the mirror of the story slot panel.
 *
 * The two are deliberately the same shape — a style button per part, the same
 * feature-media sizing — so an editor who has arranged one already knows this.
 */

const SIZE_LABELS: Record<StoryMediaSize, string> = {
  full: "Full — the media's own size",
  scaledWidth: "Scaled to width",
  scaledHeight: "Scaled to height",
  custom: "Custom size",
};

export const COLLECTION_SLOT_LABELS: Record<string, string> = {
  collectionName: "Collection name",
  collectionCategory: "Collection category",
  collectionDescription: "Collection description",
  collectionFeatureMedia: "Collection feature image",
  collectionGallery: "Collection gallery",
  collectionLink: "Collection link",
};

export const COLLECTION_SLOT_ICONS: Record<string, string> = {
  collectionName: "Heading",
  collectionCategory: "Tag",
  collectionDescription: "Pilcrow",
  collectionFeatureMedia: "Image",
  collectionGallery: "Images",
  collectionLink: "Link",
};

export function CollectionBlockInspector({
  block,
  update,
  onEditStyle,
}: {
  block: CollectionSlotBlock;
  update: (patch: Partial<PageBlock>) => void;
  onEditStyle: OpenStyleEditor;
}) {
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

  const patch = (values: Partial<CollectionSlotBlock>) =>
    update(values as Partial<PageBlock>);

  const size = block.mediaSize ?? "scaledWidth";
  const fixedAspect = (block.mediaAspect ?? "actual") !== "actual";

  return (
    <>
      <div className="inspector-section">
        <h4 className="inspector-title">Style</h4>
        {styleButton("Edit style…", blockStyleTarget(block))}

        {block.type === "collectionFeatureMedia" ? (
          <>
            {styleButton("Image…", slotTarget("image", "Image style", false))}
            {block.showCaption !== false
              ? styleButton("Caption…", slotTarget("caption", "Caption style", true))
              : null}
          </>
        ) : null}

        {block.type === "collectionLink" && block.iconName
          ? styleButton("Icon…", slotTarget("icon", "Icon style", false))
          : null}

        <p className="help-text">
          {block.styleSlug
            ? `Using the “${block.styleSlug}” named style.`
            : "Spacing, line height and colours all live here — nothing is applied by default."}
        </p>
      </div>

      {block.type === "collectionGallery" ? (
        <div className="inspector-section">
          <p className="help-text" style={{ marginTop: 0 }}>
            The gallery renders with the collection&rsquo;s own layout, columns
            and metadata settings. Change those on the collection itself.
          </p>
        </div>
      ) : null}

      {block.type === "collectionFeatureMedia" ? (
        <>
          <div className="inspector-section">
            <h4 className="inspector-title">Caption</h4>
            <CheckField
              label="Show the caption"
              value={block.showCaption !== false}
              onChange={(value) => patch({ showCaption: value })}
            />
            <p className="help-text">
              Comes from the media file&rsquo;s own details.
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
                The image renders at its own size, never wider than its column.
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
                  {/* An aspect ratio already supplies the second axis. */}
                  {size === "scaledHeight" || (size === "custom" && !fixedAspect) ? (
                    <RemField
                      label="Fixed height"
                      value={block.mediaHeight ?? 16}
                      onChange={(value) => patch({ mediaHeight: Math.max(0.5, value) })}
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>
        </>
      ) : null}

      {block.type === "collectionLink" ? (
        <>
          <div className="inspector-section">
            <h4 className="inspector-title">Link</h4>
            <TextField
              label="Text"
              value={block.linkText ?? ""}
              onChange={(value) => patch({ linkText: value })}
            />
            <p className="help-text">
              Points at the bound collection&rsquo;s page. On the canvas it
              renders as plain text so a click cannot navigate away.
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
    </>
  );
}
