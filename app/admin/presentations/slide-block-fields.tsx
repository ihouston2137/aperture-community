"use client";
import { ColorPicker } from "@/components/color-field";
import { IconSearchField } from "@/components/icon-search";
import {
  SHAPE_KINDS,
  SHAPE_KIND_LABELS,
  type PageBlock,
} from "@/lib/page-layout";
export function SlideBlockFields({
  block,
  update,
  shapes = [],
}: {
  block: PageBlock;
  shapes?: { name: string; slug: string }[];
  update: (patch: Partial<PageBlock>) => void;
}) {
  return (
    <section className="deck-block-fields">
      {block.type === "customShape" && (
        <label className="field">
          Custom shape
          <select
            aria-label="Custom shape"
            value={block.shapeSlug || ""}
            onChange={(e) => update({ shapeSlug: e.target.value })}
          >
            <option value="">Select a shape</option>
            {shapes.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
          {!shapes.length && (
            <a href="/admin/design-library" target="_blank" rel="noreferrer">
              Create a custom shape in Design
            </a>
          )}
        </label>
      )}
      {block.type === "icon" && (
        <IconSearchField
          label="Block icon"
          value={block.iconName ?? "Star"}
          onChange={(iconName) => update({ iconName })}
        />
      )}
      {block.type === "shape" && (
        <>
          <label className="field">
            Shape
            <select
              aria-label="Block shape"
              value={block.shapeKind ?? "rectangle"}
              onChange={(e) =>
                update({ shapeKind: e.target.value as PageBlock["shapeKind"] })
              }
            >
              {SHAPE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {SHAPE_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </label>
          <p className="help-text">
            Click inside the shape to type. Use the toolbar above the slide to
            change font, size, emphasis, alignment, text color, and highlight.
          </p>
        </>
      )}
      {block.type === "button" && (
        <>
          <label className="field">
            Label
            <input
              aria-label="Button label"
              value={block.label ?? ""}
              onChange={(e) => update({ label: e.target.value })}
            />
          </label>
          <label className="field">
            Link
            <input
              aria-label="Button link"
              value={block.href ?? ""}
              onChange={(e) => update({ href: e.target.value })}
            />
          </label>
          <p className="help-text">
            Links open in a new tab during presentation preview.
          </p>
        </>
      )}
      {block.type === "qrCode" && (
        <label className="field">
          QR content
          <input
            aria-label="QR content"
            value={block.qrValue ?? ""}
            onChange={(e) => update({ qrValue: e.target.value })}
          />
        </label>
      )}
      {block.type === "videoEmbed" && (
        <label className="field">
          YouTube or Vimeo link
          <input
            aria-label="Video embed link"
            value={block.embedUrl ?? ""}
            onChange={(e) => update({ embedUrl: e.target.value })}
          />
        </label>
      )}
      {["icon", "shape", "customShape", "qrCode"].includes(block.type) && (
        <ColorPicker
          label={block.type === "shape" ? "Fill" : "Foreground"}
          value={block.color}
          onChange={(color) => update({ color })}
        />
      )}
    </section>
  );
}
