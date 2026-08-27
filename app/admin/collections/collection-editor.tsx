"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { createNamedStyleAction } from "@/app/admin/design-library/actions";
import { MediaPicker, type MediaAssetSummary } from "@/app/admin/media/media-picker";
import { UploadDialog } from "@/app/admin/media/upload-dialog";
import {
  CheckField,
  NumField,
  RemField,
  SelectField,
  TextField,
} from "@/components/builder/settings-fields";
import {
  CollectionGallery,
  type SelectModifiers,
} from "@/components/collection-gallery";
import { CollectionHeader } from "@/components/collection-header";
import {
  ChromeStyle,
  PreviewHeader,
  PreviewFooter,
} from "@/components/site-chrome-preview";
import { StyleEditor } from "@/components/style-editor";
import type { AdminExit } from "@/lib/admin-exit";
import { ASPECT_RATIOS, aspectRatioLabel } from "@/lib/aspect-ratio";
import {
  sortCollectionImages,
  type CollectionImage,
  type ResolvedCollection,
} from "@/lib/collection-types";
import type { CollectionSettingsPreset } from "@/lib/collections";
import {
  COLLECTION_LAYOUTS,
  emptyStyleSlot,
  styleSlotProps,
  META_FIELDS,
  META_FIELD_LABELS,
  META_PLACEMENTS,
  type CollectionDisplay,
  type CollectionHeader as HeaderSettings,
  type MetaField,
  type MetadataDisplay,
  type StyleSlot,
} from "@/lib/display-templates";
import { CONTENT_WIDTHS, CONTENT_WIDTH_LABELS, CONTENT_WIDTH_VALUES } from "@/lib/site-values";
import type { AppearanceValues, SiteContentValues } from "@/lib/site-values";

import { addCollectionImagesAction, saveCollectionAction } from "./actions";
import { SelectionInspector, type CollectionMediaPatch } from "./selection-inspector";

export type CollectionRecord = {
  _id?: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  isPublic: boolean;
  imageIds: string[];
  images: CollectionImage[];
  sortMode: string;
  sortDirection: string;
  customOrder: string[];
  display: CollectionDisplay;
  overlay: MetadataDisplay;
  lightbox: MetadataDisplay;
  mosaicSpans: Record<string, { colSpan?: number; rowSpan?: number }>;
  header: HeaderSettings;
  share: StyleSlot;
  imageShare: StyleSlot;
  pageStyle: StyleSlot;
  imageStyle: StyleSlot;
  imageExitStyle: StyleSlot;
  imageContentStyle: StyleSlot;
  /** Empty means "whichever image comes first in the current order". */
  featureImageId: string;
};

/** Which style slot the popup is editing, and where to write the result. */
type StyleTarget = {
  title: string;
  slot: StyleSlot;
  apply: (slot: StyleSlot) => void;
};

/**
 * A foldable settings group in the left column. `details` needs no state to
 * fold, and every group starts closed so the column reads as a list of what a
 * collection can be told rather than a wall of inputs.
 */
function Group({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="inspector-fold" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="inspector-fold-body">{children}</div>
    </details>
  );
}

/**
 * Copy another collection's settings onto this one.
 *
 * Deliberately two steps — choose, then press — because it replaces every
 * display setting at once and is not something to trip into from a dropdown.
 */
function CopySettings({
  presets,
  onCopy,
}: {
  presets: CollectionSettingsPreset[];
  onCopy: (preset: CollectionSettingsPreset) => void;
}) {
  const [chosen, setChosen] = useState("");
  const [done, setDone] = useState(false);

  return (
    <div className="field">
      <label>Copy settings from</label>
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <select
          value={chosen}
          onChange={(event) => {
            setChosen(event.target.value);
            setDone(false);
          }}
        >
          <option value="">Another collection…</option>
          {presets.map((preset) => (
            <option key={preset._id} value={preset._id}>
              {preset.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!chosen}
          onClick={() => {
            const preset = presets.find((item) => item._id === chosen);
            if (!preset) return;
            onCopy(preset);
            setDone(true);
          }}
        >
          Copy
        </button>
      </div>
      <span className="help-text">
        {done
          ? "Settings copied. Save to keep them."
          : "Layout, metadata, header and styles. Images, order and the feature image stay as they are."}
      </span>
    </div>
  );
}

/** A show/hide toggle paired with the style button for the same thing. */
function StyledToggle({
  label,
  shown,
  onToggle,
  slot,
  onEditStyle,
  styleEnabled,
}: {
  label: string;
  shown: boolean;
  onToggle: (value: boolean) => void;
  slot: StyleSlot;
  onEditStyle: () => void;
  /**
   * Whether the style is worth editing, when that is not simply "this thing is
   * shown" — the opened image's style also dresses its download button, so it
   * stays editable with the share button switched off.
   */
  styleEnabled?: boolean;
}) {
  return (
    <div className="styled-toggle">
      <CheckField label={label} value={shown} onChange={onToggle} />
      <button
        type="button"
        className="btn btn-sm"
        disabled={!(styleEnabled ?? shown)}
        onClick={onEditStyle}
      >
        {slot.styleSlug ? `Style: ${slot.styleSlug}` : "Style…"}
      </button>
    </div>
  );
}

function MetadataFields({
  title,
  value,
  onChange,
  onEditStyle,
  placeable = true,
  children,
}: {
  title: string;
  value: MetadataDisplay;
  onChange: (next: MetadataDisplay) => void;
  onEditStyle: (field: MetaField) => void;
  /**
   * The grid overlay floats over its tile and can be placed. The lightbox and
   * image page lay their metadata out one way — under the picture, at its
   * width, one field per row — so there is nothing to place or to reveal.
   */
  placeable?: boolean;
  children?: ReactNode;
}) {
  return (
    <Group title={title}>
      {children}
      <CheckField
        label="Show metadata"
        value={value.enabled}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      {value.enabled ? (
        <>
          {placeable ? (
            <>
              <SelectField
                label="Placement"
                value={value.placement}
                options={META_PLACEMENTS.map((placement) => ({
                  value: placement,
                  label: placement.replace("-", " "),
                }))}
                onChange={(placement) => onChange({ ...value, placement })}
              />
              <CheckField
                label="Always visible (not only on hover)"
                value={value.alwaysVisible}
                onChange={(alwaysVisible) => onChange({ ...value, alwaysVisible })}
              />
            </>
          ) : (
            <p className="help-text" style={{ marginTop: 0 }}>
              Shown under the image, at its width, one field per row.
            </p>
          )}

          {/* Each field is switchable and dressable on its own, so a title and
              a caption in the same overlay can look nothing like each other. */}
          {META_FIELDS.map((field) => {
            const shown = value.fields.includes(field);
            return (
              <div key={field} className="styled-toggle">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={shown}
                    onChange={(event) =>
                      onChange({
                        ...value,
                        fields: event.target.checked
                          ? [...value.fields, field]
                          : value.fields.filter((item) => item !== field),
                      })
                    }
                  />
                  {META_FIELD_LABELS[field]}
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={!shown}
                  onClick={() => onEditStyle(field)}
                >
                  {value.fieldStyles?.[field]?.styleSlug ? "Styled" : "Style…"}
                </button>
              </div>
            );
          })}
        </>
      ) : null}
    </Group>
  );
}

export function CollectionEditor({
  collection,
  styles,
  fonts,
  chrome,
  presets = [],
  saved = false,
  onDelete,
  exit = { href: "/admin/collections", label: "Collections", token: "" },
}: {
  /**
   * Where the way-back link goes. Defaulted to this editor's own list, so only
   * a caller arriving from somewhere else has to say anything.
   */
  exit?: AdminExit;
  collection: CollectionRecord;
  styles: { _id: string; name: string; slug: string }[];
  fonts: string[];
  /** Other collections, so this one can be dressed like an existing gallery. */
  presets?: CollectionSettingsPreset[];
  /** Live header/footer settings, shown around the preview for context. */
  chrome: { appearance: AppearanceValues; content: SiteContentValues };
  saved?: boolean;
  onDelete?: (formData: FormData) => void;
}) {
  const [name, setName] = useState(collection.name);
  const [slug, setSlug] = useState(collection.slug);
  const [category, setCategory] = useState(collection.category);
  const [description, setDescription] = useState(collection.description);
  const [isPublic, setIsPublic] = useState(collection.isPublic);
  const [images, setImages] = useState<CollectionImage[]>(collection.images);
  const [display, setDisplay] = useState<CollectionDisplay>(collection.display);
  const [header, setHeader] = useState<HeaderSettings>(collection.header);
  const [share, setShare] = useState<StyleSlot>(collection.share);
  const [imageShare, setImageShare] = useState<StyleSlot>(collection.imageShare);
  const [pageStyle, setPageStyle] = useState<StyleSlot>(collection.pageStyle);
  const [imageStyle, setImageStyle] = useState<StyleSlot>(collection.imageStyle);
  const [imageExitStyle, setImageExitStyle] = useState<StyleSlot>(
    collection.imageExitStyle
  );
  const [imageContentStyle, setImageContentStyle] = useState<StyleSlot>(
    collection.imageContentStyle
  );
  const [featureImageId, setFeatureImageId] = useState(collection.featureImageId);
  const [sortMode, setSortMode] = useState(collection.sortMode);
  const [sortDirection, setSortDirection] = useState(collection.sortDirection);
  const [overlay, setOverlay] = useState(collection.overlay);
  const [lightbox, setLightbox] = useState(collection.lightbox);
  const [mosaicSpans, setMosaicSpans] = useState(collection.mosaicSpans);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewport, setViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Where a shift-click measures its range from. */
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState("");
  const [styleTarget, setStyleTarget] = useState<StyleTarget | null>(null);
  const [savedStyles, setSavedStyles] = useState(styles);

  const imageIds = images.map((image) => image.id);
  const selected = images.filter((image) => selectedIds.includes(image.id));

  function addAsset(asset: MediaAssetSummary) {
    setImages((current) => {
      if (current.some((image) => image.id === asset._id)) return current;
      return [
        ...current,
        {
          id: asset._id,
          url: asset.url,
          thumbnailUrl: asset.thumbnailUrl ?? "",
          width: asset.width ?? 0,
          height: asset.height ?? 0,
          title: asset.title ?? "",
          alt: asset.alt ?? "",
          caption: asset.caption ?? "",
          author: "",
          captureDate: null,
          createdAt: new Date().toISOString(),
          originalName: asset.originalName ?? "",
          tags: asset.tags ?? [],
          isNsfw: Boolean(asset.isNsfw),
          orientation: "",
          mediaType: asset.mediaType ?? "image",
        },
      ];
    });
  }

  /**
   * Dropping one tile on another moves it there. Reordering by hand only means
   * anything under a custom order, so choosing it is part of the gesture.
   */
  function reorder(draggedId: string, targetId: string) {
    setImages((current) => {
      const from = current.findIndex((image) => image.id === draggedId);
      const to = current.findIndex((image) => image.id === targetId);
      if (from < 0 || to < 0 || from === to) return current;

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSortMode("custom");
  }

  /**
   * Changing the order re-sorts the list here and now, so the preview shows
   * the gallery a reader will get rather than waiting for a save to reveal it.
   * A custom order is the arrangement already on screen, so it sorts nothing.
   */
  function changeSort(mode: string, direction = sortDirection) {
    setSortMode(mode);
    setSortDirection(direction);
    if (mode === "custom") return;
    setImages((current) => sortCollectionImages(current, mode, direction, []));
  }

  /**
   * Shift takes everything between the last click and this one; ctrl/cmd adds
   * or removes the one tile; a plain click replaces the selection. The anchor
   * is the last tile clicked without shift, so a range can be re-dragged from
   * the same starting point.
   */
  function selectImage(id: string, modifiers: SelectModifiers) {
    const order = images.map((image) => image.id);

    if (modifiers.range && anchorId && anchorId !== id) {
      const from = order.indexOf(anchorId);
      const to = order.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [start, end] = from <= to ? [from, to] : [to, from];
        setSelectedIds(order.slice(start, end + 1));
        return;
      }
    }

    setAnchorId(id);

    if (modifiers.toggle) {
      setSelectedIds((current) =>
        current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      );
      return;
    }

    setSelectedIds((current) =>
      current.length === 1 && current[0] === id ? [] : [id]
    );
  }

  /** Writes edited media fields back onto the tiles the preview is showing. */
  function applyToSelection(patch: CollectionMediaPatch) {
    setImages((current) =>
      current.map((image) =>
        selectedIds.includes(image.id) ? { ...image, ...patch } : image
      )
    );
  }

  const previewCollection: ResolvedCollection = {
    id: collection._id ?? "preview",
    name,
    slug,
    description,
    category,
    isPublic,
    images,
    display,
    overlay,
    lightbox,
    mosaicSpans,
    header,
    share,
    imageShare,
    pageStyle,
    imageStyle,
    imageExitStyle,
    imageContentStyle,
    // Same fallback the resolver uses: the first image in the current order.
    featureImage:
      images.find((image) => image.id === featureImageId) ?? images[0] ?? null,
    styleOverrides: {},
  };

  const pageStyled = styleSlotProps(pageStyle);

  /**
   * Takes on another collection's look: its layout, metadata, header and
   * styles. Nothing that identifies this collection moves — not its name, its
   * images, their order, or which one is the feature.
   */
  function applyPreset(preset: CollectionSettingsPreset) {
    const next = preset.settings;
    setSortMode(next.sortMode);
    setSortDirection(next.sortDirection);
    setDisplay(next.display);
    setOverlay(next.overlay);
    setLightbox(next.lightbox);
    setHeader(next.header);
    setShare(next.share);
    setImageShare(next.imageShare);
    setPageStyle(next.pageStyle);
    setImageStyle(next.imageStyle);
    setImageExitStyle(next.imageExitStyle);
    setImageContentStyle(next.imageContentStyle);
  }

  /** Opens the shared style popup against one slot. */
  const editStyle = (title: string, slot: StyleSlot, apply: (next: StyleSlot) => void) =>
    setStyleTarget({ title, slot, apply });

  const editFieldStyle = (
    title: string,
    value: MetadataDisplay,
    onChange: (next: MetadataDisplay) => void
  ) => (field: MetaField) =>
    editStyle(`${title} · ${META_FIELD_LABELS[field]}`, value.fieldStyles?.[field] ?? emptyStyleSlot, (slot) =>
      onChange({ ...value, fieldStyles: { ...value.fieldStyles, [field]: slot } })
    );

  return (
    // One form wraps the whole builder: the topbar carries the name and the
    // save button, and the settings column carries the rest of the fields.
    <form action={saveCollectionAction} className="builder">
      {/* The way-back token, carried through the save's own redirect —
          without it, pressing Save silently sends you back to the admin
          list instead of wherever you came from. */}
      <input type="hidden" name="from" value={exit.token} />
      {collection._id ? <input type="hidden" name="id" value={collection._id} /> : null}
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="imageIds" value={JSON.stringify(imageIds)} />
      <input type="hidden" name="customOrder" value={JSON.stringify(imageIds)} />
      <input type="hidden" name="display" value={JSON.stringify(display)} />
      <input type="hidden" name="header" value={JSON.stringify(header)} />
      <input type="hidden" name="share" value={JSON.stringify(share)} />
      <input type="hidden" name="imageShare" value={JSON.stringify(imageShare)} />
      <input type="hidden" name="pageStyle" value={JSON.stringify(pageStyle)} />
      <input type="hidden" name="imageStyle" value={JSON.stringify(imageStyle)} />
      <input
        type="hidden"
        name="imageExitStyle"
        value={JSON.stringify(imageExitStyle)}
      />
      <input
        type="hidden"
        name="imageContentStyle"
        value={JSON.stringify(imageContentStyle)}
      />
      <input type="hidden" name="featureImageId" value={featureImageId} />
      <input type="hidden" name="overlaySettings" value={JSON.stringify(overlay)} />
      <input type="hidden" name="lightboxSettings" value={JSON.stringify(lightbox)} />
      <input type="hidden" name="mosaicSpans" value={JSON.stringify(mosaicSpans)} />
      <input type="hidden" name="sortMode" value={sortMode} />
      <input type="hidden" name="sortDirection" value={sortDirection} />

      <div className="builder-topbar">
        <Link href={exit.href} className="btn btn-sm" title={`Back to ${exit.label}`}>
          ← {exit.label}
        </Link>
        <input
          className="input"
          style={{ maxWidth: "12rem" }}
          name="name"
          value={name}
          placeholder="Collection name"
          required
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className="input"
          style={{ maxWidth: "9rem" }}
          name="slug"
          value={slug}
          placeholder="slug"
          onChange={(event) => setSlug(event.target.value)}
        />
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="isPublic"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
          />
          Public
        </label>

        <button type="button" className="btn btn-sm" onClick={() => setUploadOpen(true)}>
          Upload media
        </button>
        <button type="button" className="btn btn-sm" onClick={() => setPickerOpen(true)}>
          Select media
        </button>

        <div className="spacer" />

        <div className="builder-tabs" style={{ marginBottom: 0, width: "auto" }}>
          {(["desktop", "tablet", "mobile"] as const).map((size) => (
            <button
              key={size}
              type="button"
              className={`builder-tab${viewport === size ? " is-active" : ""}`}
              onClick={() => setViewport(size)}
            >
              {size}
            </button>
          ))}
        </div>

        {uploadNote ? <span className="help-text">{uploadNote}</span> : null}
        {saved && !uploadNote ? <span className="help-text">Saved.</span> : null}
        <button type="submit" className="btn btn-primary btn-sm">
          Save
        </button>
      </div>

      <div className="builder-body is-two-column">
        {/* ------------------------------------------------------ Settings */}
        <aside className="builder-inspector is-left">
          {selected.length > 0 ? (
            // A selection takes over the column: what an editor wants next
            // after picking images is to describe them.
            <SelectionInspector
              // Remounts when the selection changes, so the fields always start
              // from what is actually selected.
              key={selectedIds.join(",")}
              selected={selected}
              isFeature={selected.length === 1 && selected[0].id === featureImageId}
              onMakeFeature={() => setFeatureImageId(selected[0].id)}
              onClear={() => setSelectedIds([])}
              onApplied={applyToSelection}
              onRemove={() => {
                setImages((current) =>
                  current.filter((image) => !selectedIds.includes(image.id))
                );
                setSelectedIds([]);
              }}
            />
          ) : (
            <>
              <Group title="Collection" defaultOpen>
                {presets.length > 0 ? <CopySettings presets={presets} onCopy={applyPreset} /> : null}

                <TextField label="Category" value={category} onChange={setCategory} />
                <div className="field">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>

                <h4 className="inspector-title">Shown at the top of the page</h4>
                <StyledToggle
                  label="Category"
                  shown={header.showCategory}
                  onToggle={(showCategory) => setHeader({ ...header, showCategory })}
                  slot={header.category}
                  onEditStyle={() =>
                    editStyle("Category style", header.category, (slot) =>
                      setHeader({ ...header, category: slot })
                    )
                  }
                />
                <StyledToggle
                  label="Title"
                  shown={header.showTitle}
                  onToggle={(showTitle) => setHeader({ ...header, showTitle })}
                  slot={header.title}
                  onEditStyle={() =>
                    editStyle("Title style", header.title, (slot) =>
                      setHeader({ ...header, title: slot })
                    )
                  }
                />
                <StyledToggle
                  label="Description"
                  shown={header.showDescription}
                  onToggle={(showDescription) => setHeader({ ...header, showDescription })}
                  slot={header.description}
                  onEditStyle={() =>
                    editStyle("Description style", header.description, (slot) =>
                      setHeader({ ...header, description: slot })
                    )
                  }
                />

                <h4 className="inspector-title">Page</h4>
                <SelectField
                  label="Page width"
                  value={display.pageWidth}
                  options={CONTENT_WIDTHS.map((width) => ({
                    value: width,
                    label: CONTENT_WIDTH_LABELS[width],
                  }))}
                  onChange={(pageWidth) => setDisplay({ ...display, pageWidth })}
                />

                <StyledToggle
                  label="Share button"
                  shown={display.shareEnabled}
                  onToggle={(shareEnabled) => setDisplay({ ...display, shareEnabled })}
                  slot={share}
                  onEditStyle={() => editStyle("Share button style", share, setShare)}
                />
                <p className="help-text" style={{ marginTop: 0 }}>
                  A share icon that copies this collection&rsquo;s address to the
                  clipboard.
                </p>
                {display.shareEnabled ? (
                  <RemField
                    label="Share icon size"
                    value={display.shareIconSize}
                    onChange={(shareIconSize) => setDisplay({ ...display, shareIconSize })}
                  />
                ) : null}

                <CheckField
                  label="Allow downloads"
                  value={display.allowDownload}
                  onChange={(allowDownload) => setDisplay({ ...display, allowDownload })}
                />
                <CheckField
                  label="Allow right-click / context menu"
                  value={display.allowContextMenu}
                  onChange={(allowContextMenu) => setDisplay({ ...display, allowContextMenu })}
                />
              </Group>

              <Group title="Page display">
                {/* Columns first and on one row: they are the setting an editor
                    reaches for most, and they read as one decision. */}
                <div className="column-row">
                  <NumField
                    label="Desktop"
                    value={display.columnsDesktop}
                    min={1}
                    max={12}
                    onChange={(columnsDesktop) => setDisplay({ ...display, columnsDesktop })}
                  />
                  <NumField
                    label="Tablet"
                    value={display.columnsTablet}
                    min={1}
                    max={12}
                    onChange={(columnsTablet) => setDisplay({ ...display, columnsTablet })}
                  />
                  <NumField
                    label="Mobile"
                    value={display.columnsMobile}
                    min={1}
                    max={12}
                    onChange={(columnsMobile) => setDisplay({ ...display, columnsMobile })}
                  />
                </div>

                <div className="field-grid">
                  <SelectField
                    label="Order by"
                    value={sortMode}
                    options={[
                      { value: "createdAt", label: "Date added" },
                      { value: "captureDate", label: "Capture date" },
                      { value: "originalName", label: "File name" },
                      { value: "custom", label: "Custom order" },
                    ]}
                    onChange={changeSort}
                  />
                  <SelectField
                    label="Direction"
                    value={sortDirection}
                    options={[
                      { value: "desc", label: "Descending" },
                      { value: "asc", label: "Ascending" },
                    ]}
                    onChange={(direction) => changeSort(sortMode, direction)}
                  />
                  <SelectField
                    label="Layout"
                    value={display.layoutMode}
                    options={COLLECTION_LAYOUTS.map((value) => ({
                      value,
                      label: value[0].toUpperCase() + value.slice(1),
                    }))}
                    onChange={(layoutMode) => setDisplay({ ...display, layoutMode })}
                  />
                  <SelectField
                    label="Loading"
                    value={display.displayMode}
                    options={[
                      { value: "all", label: "Show all" },
                      { value: "lazy", label: "Lazy load" },
                      { value: "pagination", label: "Pagination" },
                    ]}
                    onChange={(displayMode) => setDisplay({ ...display, displayMode })}
                  />
                  <NumField
                    label="Page size"
                    value={display.pageSize}
                    min={1}
                    onChange={(pageSize) => setDisplay({ ...display, pageSize })}
                  />
                  <SelectField
                    label="Image ratio"
                    value={display.imageAspect}
                    options={ASPECT_RATIOS.map((value) => ({
                      value,
                      label: aspectRatioLabel(value),
                    }))}
                    onChange={(imageAspect) => setDisplay({ ...display, imageAspect })}
                  />
                  <SelectField
                    label="Image fit"
                    value={display.imageFit}
                    options={[
                      { value: "fill", label: "Fill (cropped)" },
                      { value: "full", label: "Full" },
                    ]}
                    onChange={(imageFit) => setDisplay({ ...display, imageFit })}
                  />
                </div>

                <p className="help-text" style={{ marginTop: 0 }}>
                  {display.imageAspect === "actual"
                    ? "Each tile takes the media's own shape, so a row is as tall as its tallest image. "
                    : "Every tile is held to the ratio above. "}
                  {display.imageFit === "fill"
                    ? "Fill scales by whichever edge is needed to cover the space, cropping the other."
                    : "Full shows the whole image, centred in the space."}
                </p>

                {display.layoutMode === "mosaic" ? (
                  <p className="help-text">
                    Hover a tile in the preview to set how many columns it spans.
                  </p>
                ) : null}

                <h4 className="inspector-title">Styles</h4>
                <div className="styled-toggle">
                  <span style={{ flex: 1 }}>Page</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => editStyle("Page style", pageStyle, setPageStyle)}
                  >
                    {pageStyle.styleSlug ? `Style: ${pageStyle.styleSlug}` : "Style…"}
                  </button>
                </div>
                <div className="styled-toggle">
                  <span style={{ flex: 1 }}>Images</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => editStyle("Image style", imageStyle, setImageStyle)}
                  >
                    {imageStyle.styleSlug ? `Style: ${imageStyle.styleSlug}` : "Style…"}
                  </button>
                </div>
              </Group>

              <MetadataFields
                title="Image overlay"
                value={overlay}
                onChange={setOverlay}
                onEditStyle={editFieldStyle("Image overlay", overlay, setOverlay)}
              />
              <MetadataFields
                title="Opened image"
                value={lightbox}
                onChange={setLightbox}
                onEditStyle={editFieldStyle("Opened image", lightbox, setLightbox)}
                placeable={false}
              >
                <p className="help-text" style={{ marginTop: 0 }}>
                  Used by the lightbox and by an image&rsquo;s own page — the same
                  view at two addresses.
                </p>
                <StyledToggle
                  label="Share button"
                  shown={display.imageShareEnabled}
                  onToggle={(imageShareEnabled) =>
                    setDisplay({ ...display, imageShareEnabled })
                  }
                  slot={imageShare}
                  // Still worth setting with sharing off: the download button
                  // wears the same style.
                  styleEnabled={display.imageShareEnabled || display.allowDownload}
                  onEditStyle={() =>
                    editStyle("Share and download button style", imageShare, setImageShare)
                  }
                />
                <p className="help-text" style={{ marginTop: 0 }}>
                  Copies the address of this image&rsquo;s own page. The style and
                  icon size dress the download button too, when downloads are
                  allowed.
                </p>
                {display.imageShareEnabled || display.allowDownload ? (
                  <RemField
                    label="Icon size"
                    value={display.imageShareIconSize}
                    onChange={(imageShareIconSize) =>
                      setDisplay({ ...display, imageShareIconSize })
                    }
                  />
                ) : null}
                <CheckField
                  label="Collection name"
                  value={display.imageNameEnabled}
                  onChange={(imageNameEnabled) =>
                    setDisplay({ ...display, imageNameEnabled })
                  }
                />
                <p className="help-text" style={{ marginTop: 0 }}>
                  Above the image on its own page, wearing the title style set
                  for the collection page. Not shown in the lightbox, which is
                  already covering the gallery.
                </p>

                <div className="styled-toggle">
                  <TextField
                    label="Back to the gallery"
                    value={display.imageExitLabel}
                    onChange={(imageExitLabel) =>
                      setDisplay({ ...display, imageExitLabel })
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      editStyle("Back link style", imageExitStyle, setImageExitStyle)
                    }
                  >
                    {imageExitStyle.styleSlug
                      ? `Style: ${imageExitStyle.styleSlug}`
                      : "Style…"}
                  </button>
                </div>

                <div className="styled-toggle">
                  <span style={{ flex: 1 }}>Content</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() =>
                      editStyle("Content style", imageContentStyle, setImageContentStyle)
                    }
                  >
                    {imageContentStyle.styleSlug
                      ? `Style: ${imageContentStyle.styleSlug}`
                      : "Style…"}
                  </button>
                </div>
                <p className="help-text" style={{ marginTop: 0 }}>
                  Wraps the image and everything with it — border, background,
                  padding, corners.
                </p>
              </MetadataFields>

              {collection._id && onDelete ? (
                <Group title="Delete">
                  <p className="help-text" style={{ marginTop: 0 }}>
                    Removes the collection. The images themselves stay in the media
                    library.
                  </p>
                  {/* `formAction` rather than a nested form, which HTML forbids —
                      the delete action reads the same hidden id. `formNoValidate`
                      keeps the required name field from blocking a delete. */}
                  <button
                    type="submit"
                    className="btn btn-danger btn-sm"
                    formNoValidate
                    formAction={onDelete}
                  >
                    Delete collection
                  </button>
                </Group>
              ) : null}
            </>
          )}
        </aside>

        {/* ------------------------------------------------------- Preview */}
        <div className="builder-workspace">
          <div className="builder-canvas has-site-chrome" data-viewport={viewport}>
            <ChromeStyle
              appearance={chrome.appearance}
              scope=".builder-canvas.has-site-chrome"
            />
            <div className="builder-canvas-chrome site-shell">
              <PreviewHeader appearance={chrome.appearance} content={chrome.content} />
            </div>

            <div
              className={`page-shell collection-page ${pageStyled.className}`.trim()}
              style={{
                maxWidth: CONTENT_WIDTH_VALUES[display.pageWidth],
                ...pageStyled.style,
              }}
            >
              <CollectionHeader
                header={header}
                category={category}
                name={name}
                description={description}
              />

              {images.length === 0 ? (
                <p className="admin-subtitle">
                  Upload or select media to see the preview.
                </p>
              ) : (
                <CollectionGallery
                  collection={previewCollection}
                  safeMode={false}
                  // The canvas decides the width here, not the window.
                  breakpoint={viewport}
                  editing={{
                    selectedIds,
                    onSelect: selectImage,
                    onReorder: reorder,
                    spans: mosaicSpans,
                    onSpanChange: (id, colSpan) =>
                      setMosaicSpans((current) => ({
                        ...current,
                        [id]: { ...current[id], colSpan },
                      })),
                  }}
                />
              )}
            </div>

            <div className="builder-canvas-chrome site-shell">
              <PreviewFooter appearance={chrome.appearance} content={chrome.content} />
            </div>
          </div>
        </div>
      </div>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addAsset}
      />

      <UploadDialog
        open={uploadOpen}
        defaultFolder="collections"
        onClose={() => setUploadOpen(false)}
        onUploaded={async (created) => {
          created.forEach(addAsset);
          if (created.length === 0) return;

          // Attached now rather than at Save, so files uploaded for this
          // collection cannot be left sitting outside it.
          if (collection._id) {
            const stored = await addCollectionImagesAction(
              collection._id,
              created.map((asset) => asset._id)
            );
            setUploadNote(
              stored
                ? `Added ${created.length} to the collection.`
                : "Uploaded, but could not attach them — save to try again."
            );
          } else {
            setUploadNote(`${created.length} uploaded. Save to attach them.`);
          }
        }}
      />

      <StyleEditor
        open={Boolean(styleTarget)}
        title={styleTarget?.title ?? "Style"}
        fonts={fonts}
        savedStyles={savedStyles}
        initial={{
          values: styleTarget?.slot.style,
          styleSlug: styleTarget?.slot.styleSlug,
        }}
        onClose={() => setStyleTarget(null)}
        onApply={async (result) => {
          let slugToUse = result.styleSlug;

          // "Save as a named style" creates the style and switches to it.
          if (!slugToUse && result.saveAsName) {
            const created = await createNamedStyleAction({
              name: result.saveAsName,
              style: result.values,
              hoverEnabled: result.hoverEnabled,
              hoverStyle: result.hoverValues,
              transitionDuration: result.transitionDuration,
            });
            if (created) {
              slugToUse = created.slug;
              setSavedStyles((current) => [
                ...current,
                { _id: created.slug, name: created.name, slug: created.slug },
              ]);
            }
          }

          styleTarget?.apply({
            styleSlug: slugToUse,
            style: slugToUse ? {} : result.values,
          });
          setStyleTarget(null);
        }}
      />
    </form>
  );
}

export type { MetaField };
