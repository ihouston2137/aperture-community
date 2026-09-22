"use client";

import { Link2, Unlink, SlidersHorizontal } from "lucide-react";
import { formatColor, parseColor } from "@/lib/color";
import { SHAPE_KINDS, SHAPE_KIND_LABELS, type PageBlock } from "@/lib/page-layout";
import type { SlideObject } from "@/lib/presentation";

export function ShapeToolbar({ object, shapes, disabled, update, onSettings }: {
  object: SlideObject;
  shapes: { name: string; slug: string }[];
  disabled: boolean;
  update: (patch: Partial<SlideObject>) => void;
  onSettings: () => void;
}) {
  const block = object.publication || object.block;
  if (!block || (block.type !== "shape" && block.type !== "customShape")) return null;
  const custom = block.type === "customShape";
  const color = object.publication?.shapeStyle?.backgroundColor || block.color || "#3b82f6";
  const { hex, alpha } = parseColor(color);
  function setColor(color: string) {
    if (object.publication) update({ publication: { ...object.publication, color, shapeStyle: { ...object.publication.shapeStyle, backgroundColor: color } } });
    else update({ block: { ...object.block!, color } });
  }
  function select(value: string) {
    const patch = custom ? { shapeSlug: value } : { shapeKind: value as PageBlock["shapeKind"] };
    if (object.publication) update({ publication: { ...object.publication, ...patch } });
    else update({ block: { ...object.block!, ...patch } });
  }
  return <div className="deck-shape-tools">
    <fieldset className="deck-shape-toolbar" aria-label={custom ? "Custom shape controls" : "Shape controls"} disabled={disabled}>
      <label>Shape<select aria-label={custom ? "Toolbar custom shape" : "Toolbar shape"} value={(custom ? block.shapeSlug : block.shapeKind) || (custom ? "" : "rectangle")} onChange={event => select(event.target.value)}>
        {custom ? <><option value="">Select a shape</option>{shapes.map(shape => <option key={shape.slug} value={shape.slug}>{shape.name}</option>)}</> : SHAPE_KINDS.map(kind => <option key={kind} value={kind}>{SHAPE_KIND_LABELS[kind]}</option>)}
      </select></label>
      <label>Foreground<input type="color" aria-label="Shape foreground color" value={hex} onChange={event => setColor(formatColor(event.target.value, alpha))} /></label>
      <label>Transparency <span className="deck-shape-alpha"><input type="range" aria-label="Shape transparency" min={0} max={100} value={Math.round((1 - alpha) * 100)} onChange={event => setColor(formatColor(hex, 1 - Number(event.target.value) / 100))} /><output>{Math.round((1 - alpha) * 100)}%</output></span></label>
      {(["width", "height"] as const).map(key => <label key={key}>{key === "width" ? "Width" : "Height"} (rem)<input type="number" aria-label={`Shape ${key}`} min={0.0625} max={2000} step={0.125} value={Math.round(object[key] / 16 * 10000) / 10000} onChange={event => {
        const value = event.target.valueAsNumber;
        if (Number.isFinite(value)) update({ [key]: Math.max(1, Math.min(32000, value * 16)) });
      }} /></label>)}
      <button type="button" className="btn btn-sm" aria-label="Lock shape aspect ratio" title={object.aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"} aria-pressed={!!object.aspectLocked} onClick={() => update({ aspectLocked: !object.aspectLocked })}>
        {object.aspectLocked ? <Link2 size={18} aria-hidden="true" /> : <Unlink size={18} aria-hidden="true" />}
      </button>
    </fieldset>
    <button type="button" className="btn btn-sm" aria-label="Shape settings" title="Shape settings" onClick={onSettings}><SlidersHorizontal size={18} aria-hidden="true" /></button>
  </div>;
}
