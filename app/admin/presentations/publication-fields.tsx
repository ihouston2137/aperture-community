"use client";
import { useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import { ColorPicker } from "@/components/color-field";
import type { PublicationBlock } from "@/lib/publication-layout";
import { MediaPicker } from "@/app/admin/media/media-picker";

export function PublicationFields({ block, update, pages = [] }: { block: PublicationBlock; update: (patch: Partial<PublicationBlock>) => void; pages?: { id: string; name: string }[] }) {
  const [media, setMedia] = useState(false);
  const [expandedCell, setExpandedCell] = useState<string | null>(null);
  return <section className="deck-block-fields">
    <strong>{block.type === "table" ? "Table" : "Publication block"}</strong>
    {!["table", "image", "video", "sponsorScroll", "collection", "story", "form"].includes(block.type) &&
      <RichTextEditor value={block.html || ""} onChange={html => update({ html })} />}
    {["image", "video"].includes(block.type) && <><button className="btn btn-sm" onClick={() => setMedia(true)}>Choose media</button><MediaPicker open={media} mediaType={block.type === "video" ? "video" : "image"} onClose={() => setMedia(false)} onSelect={asset => { update({ mediaId: asset._id, mediaUrl: asset.url, alt: asset.alt }); setMedia(false); }} /></>}
    {(["mediaUrl", "alt", "qrValue", "iconName", "storyId", "collectionId", "formId"] as const).filter(key =>
      key === "mediaUrl" || key === "alt" ? ["image", "video"].includes(block.type) : key in block
    ).map(key => <label className="field" key={key}>{({ mediaUrl: "Media URL", alt: "Alternative text", qrValue: "QR value", iconName: "Icon", storyId: "Story ID", collectionId: "Collection ID", formId: "Form ID" })[key]}
      <input value={block[key] || ""} onChange={e => update({ [key]: e.target.value })} /></label>)}
    <ColorPicker label="Text color" value={block.textStyle?.color} onChange={color => update({ textStyle: { ...block.textStyle, color } })} />
    <label className="field">Click action<select value={block.clickAction || "none"} onChange={e => update({ clickAction: e.target.value as PublicationBlock["clickAction"] })}>
      <option value="none">None</option><option value="link">Link</option><option value="page">Go to page</option>
    </select></label>
    {block.clickAction === "page" && <label className="field">Page<select value={block.clickTarget || ""} onChange={e => update({ clickTarget: e.target.value })}><option value="">Choose a page</option>{pages.map((page, index) => <option key={page.id} value={page.id}>{page.name || `Page ${index + 1}`}</option>)}</select></label>}
    {block.clickAction === "link" && <label className="field">Link<input value={block.clickTarget || ""} onChange={e => update({ clickTarget: e.target.value })} /></label>}
    {block.table?.cells.map((row, r) => row.map((cell, c) => <details key={cell.id} open={expandedCell === cell.id} onToggle={e => { if (e.currentTarget.open) setExpandedCell(cell.id); else setExpandedCell(current => current === cell.id ? null : current); }}>
      <summary>Row {r + 1}, column {c + 1}</summary>
      {expandedCell === cell.id && <PublicationFields pages={pages} block={cell.block} update={patch => update({ table: { ...block.table!, cells: block.table!.cells.map((cells, ri) => cells.map((item, ci) => ri === r && ci === c ? { ...item, block: { ...item.block, ...patch } } : item)) } })} />}
    </details>))}
  </section>;
}
