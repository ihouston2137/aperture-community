"use client";

import { useState } from "react";

import { StyleEditor, type SavedStyle } from "@/components/style-editor";
import type { StyleValues } from "@/lib/style-values";

import { saveStyleAction } from "./actions";

/**
 * Wraps the shared style editor for the design library, where the values are
 * submitted as JSON alongside the style's name.
 */
export function StyleForm({
  style,
  fonts,
}: {
  style?: SavedStyle;
  fonts: string[];
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<StyleValues>(style?.style ?? {});
  const [hoverValues, setHoverValues] = useState<StyleValues>(style?.hoverStyle ?? {});
  const [hoverEnabled, setHoverEnabled] = useState(Boolean(style?.hoverEnabled));
  const [duration, setDuration] = useState(style?.transitionDuration ?? 200);

  return (
    <form action={saveStyleAction} style={{ marginTop: "1rem" }}>
      {style ? <input type="hidden" name="id" value={style._id} /> : null}
      <input type="hidden" name="style" value={JSON.stringify(values)} />
      <input type="hidden" name="hoverStyle" value={JSON.stringify(hoverValues)} />
      <input type="hidden" name="transitionDuration" value={duration} />
      {hoverEnabled ? <input type="hidden" name="hoverEnabled" value="on" /> : null}

      <div className="field-grid">
        <div className="field">
          <label>Name</label>
          <input type="text" name="name" defaultValue={style?.name ?? ""} required />
        </div>
        <div className="field">
          <label>Settings</label>
          <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Edit style…
          </button>
          <span className="help-text">
            {hoverEnabled ? "Hover state enabled." : "Normal state only."}
          </span>
        </div>
      </div>

      <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: "0.75rem" }}>
        {style ? "Save style" : "Create style"}
      </button>

      <StyleEditor
        open={open}
        title={style ? `Edit “${style.name}”` : "New style"}
        fonts={fonts}
        savedStyles={[]}
        initial={{
          values,
          hoverValues,
          hoverEnabled,
          transitionDuration: duration,
        }}
        onClose={() => setOpen(false)}
        onApply={(result) => {
          setValues(result.values);
          setHoverValues(result.hoverValues);
          setHoverEnabled(result.hoverEnabled);
          setDuration(result.transitionDuration);
          setOpen(false);
        }}
      />
    </form>
  );
}
