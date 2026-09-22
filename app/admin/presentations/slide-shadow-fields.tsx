"use client";

import { ColorPicker } from "@/components/color-field";
import { normalizeSlideShadow, type SlideObject, type SlideShadow } from "@/lib/presentation";

export function SlideShadowFields({ object, update }: {
  object: SlideObject;
  update: (patch: Partial<SlideObject>) => void;
}) {
  const shadow = normalizeSlideShadow(object.shadow);
  function patch(values: Partial<SlideShadow>) {
    update({ shadow: normalizeSlideShadow({ ...shadow, ...values }) });
  }
  return <section className="deck-border-fields">
    <h4>Drop shadow</h4>
    <label className="deck-lock-setting">
      <input type="checkbox" checked={shadow.enabled} onChange={event => patch({ enabled: event.target.checked })} />
      Enable drop shadow
    </label>
    {shadow.enabled && <>
      {([
        ["x", "Horizontal offset", -100, 100],
        ["y", "Vertical offset", -100, 100],
        ["blur", "Blur", 0, 50],
      ] as const).map(([key, label, min, max]) => <label className="field" key={key}>
        {label} (rem)
        <input type="number" aria-label={`Shadow ${label.toLowerCase()}`} min={min} max={max} step={0.0625}
          value={shadow[key] / 16} onChange={event => {
            const value = event.target.valueAsNumber;
            if (Number.isFinite(value)) patch({ [key]: value * 16 });
          }} />
      </label>)}
      <ColorPicker label="Shadow color" value={shadow.color} onChange={color => patch({ color })} />
    </>}
  </section>;
}
