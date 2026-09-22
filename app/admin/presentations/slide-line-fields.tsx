"use client";

import { ColorPicker } from "@/components/color-field";
import type { PointerEvent } from "react";
import { defaultLine, lineEndpoints, lineFromPoints, type SlideObject } from "@/lib/presentation";

export function SlideLineHandles({ object, update, onDrag }: {
  object: SlideObject;
  update: (patch: Partial<SlideObject>) => void;
  onDrag: (event: PointerEvent<HTMLDivElement>, endpoint: "start" | "end") => void;
}) {
  const line = object.line ?? defaultLine();
  return (["start", "end"] as const).map((endpoint) => (
    <div key={endpoint} className="deck-line-endpoint" role="button" tabIndex={0}
      aria-label={`Line ${endpoint} point`} title="Drag endpoint; arrow keys move it"
      style={{ left: line[endpoint].x * object.width, top: line[endpoint].y * object.height }}
      onPointerDown={(e) => { e.currentTarget.focus({ preventScroll: true }); onDrag(e, endpoint); }}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const ends = lineEndpoints(object), step = e.shiftKey ? 10 : 1;
        ends[endpoint] = { x: ends[endpoint].x + (e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0), y: ends[endpoint].y + (e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0) };
        update(lineFromPoints(object, ends.start, ends.end));
      }} />
  ));
}

export function SlideLineControls({ object, update }: { object: SlideObject; update: (patch: Partial<SlideObject>) => void }) {
  const line = object.line ?? defaultLine();
  return <>
    <label className="field">Line width (rem)
      <input aria-label="Line width" type="number" min={0.03125} max={3.125} step={0.0625} value={line.strokeWidth / 16}
        onChange={(e) => { const value = Number(e.target.value); if (Number.isFinite(value)) update({ line: { ...line, strokeWidth: Math.max(0.5, Math.min(50, value * 16)) } }); }} />
    </label>
    <label className="field">Connection
      <select aria-label="Line connection" value={line.curved ? "curved" : "straight"} onChange={(e) => update({ line: { ...line, curved: e.target.value === "curved" } })}>
        <option value="straight">Straight</option><option value="curved">Natural curve</option>
      </select>
    </label>
    {(["start", "end"] as const).map((endpoint) => {
      const key = endpoint === "start" ? "startCap" : "endCap";
      const label = endpoint === "start" ? "Start" : "End";
      return <label className="field" key={endpoint}>{label} marker
          <select aria-label={`Line ${endpoint} marker`} value={line[key]} onChange={(e) => update({ line: { ...line, [key]: e.target.value as typeof line.startCap } })}>
            <option value="none">None</option><option value="arrow">Arrow</option><option value="dot">Dot</option>
          </select>
        </label>;
    })}
  </>;
}

export function SlideLineFields({ object, update }: { object: SlideObject; update: (patch: Partial<SlideObject>) => void }) {
  const ends = lineEndpoints(object);
  return <section className="deck-line-fields">
    <h4>Line</h4>
    <ColorPicker label="Line color" value={object.color} onChange={(color) => update({ color })} />
    <SlideLineControls object={object} update={update} />
    {(["start", "end"] as const).map((endpoint) => {
      const label = endpoint === "start" ? "Start" : "End";
      return <div key={endpoint}>
        {(["x", "y"] as const).map((axis) => <label className="field" key={axis}>{label} {axis === "x" ? "horizontal" : "vertical"} position (rem)
          <input aria-label={`Line ${endpoint} ${axis}`} type="number" step={0.125} value={Math.round(ends[endpoint][axis] / 16 * 10000) / 10000}
            onChange={(e) => {
              const value = Number(e.target.value) * 16;
              if (!Number.isFinite(value)) return;
              const next = { ...ends, [endpoint]: { ...ends[endpoint], [axis]: Math.max(-16000, Math.min(16000, value)) } };
              update(lineFromPoints(object, next.start, next.end));
            }} />
        </label>)}
      </div>;
    })}
  </section>;
}
