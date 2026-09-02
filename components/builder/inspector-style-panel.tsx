"use client";

import { useState } from "react";

import {
  NumberField,
  StyleFields,
  type SavedStyle,
} from "@/components/style-editor";
import type { PageBlock } from "@/lib/page-layout";
import {
  styleValuesForView,
  styleViewEnabled,
  viewEnabledKey,
  viewValuesKey,
  type StyleView,
} from "@/lib/responsive-style";
import { normalizeStyleValues, type StyleValues } from "@/lib/style-values";

import type { StyleTarget } from "./story-block-inspector";

/**
 * The style editor, in the inspector column rather than a popup.
 *
 * Every control writes straight through to the block, so the canvas beside it
 * is the preview — there is no sample swatch here, and nothing to apply or
 * cancel. That is the whole point of moving it out of the modal: a style is
 * judged against the page it is on, at the size it will be read at.
 *
 * Which view is being edited comes from the canvas's own viewport switch, so
 * "look at the tablet layout" and "style the tablet layout" are the same
 * action. Desktop is the base; tablet and mobile are overrides that have to be
 * turned on, and a view left off simply shows the next one up.
 */

const VIEW_LABELS: Record<StyleView, string> = {
  desktop: "Desktop",
  tablet: "Tablet",
  mobile: "Mobile",
};

export function InspectorStylePanel({
  block,
  target,
  view,
  fonts,
  savedStyles,
  update,
  onClose,
  onCreateNamedStyle,
}: {
  block: PageBlock;
  /** Which pair of keys on the block this panel writes to. */
  target: StyleTarget;
  /** The canvas viewport, which is also the view being styled. */
  view: StyleView;
  fonts: string[];
  savedStyles: SavedStyle[];
  update: (patch: Partial<PageBlock>) => void;
  onClose: () => void;
  /** Creates a reusable style from these values and returns its slug. */
  onCreateNamedStyle: (input: {
    name: string;
    style: StyleValues;
    hoverEnabled: boolean;
    hoverStyle: StyleValues;
    transitionDuration: number;
  }) => Promise<string | null>;
}) {
  const { valuesKey, slugKey } = target;
  const host = block as unknown as Record<string, unknown>;
  const slug = (host[slugKey] as string | undefined) ?? "";
  const usingSavedStyle = Boolean(slug);

  // Hover lives on the saved `CustomStyle` record, never on a block, so it is
  // only ever a draft of the style about to be created.
  const [hoverEnabled, setHoverEnabled] = useState(false);
  const [hoverValues, setHoverValues] = useState<StyleValues>({});
  const [transitionDuration, setTransitionDuration] = useState(200);
  const [saveAsName, setSaveAsName] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"normal" | "hover">("normal");

  const isBaseView = view === "desktop";
  const overrideOn = isBaseView || styleViewEnabled(host, valuesKey, view);

  // What this view renders with right now: its own values when overridden,
  // otherwise whatever it inherits.
  const shown = normalizeStyleValues(styleValuesForView(host, valuesKey, view));

  /** Writes the edited values back to whichever view is active. */
  function writeValues(next: StyleValues) {
    // One set of settings, whichever viewport the canvas happens to be on:
    // a values-only slot has no per-view rules to write into.
    if (isBaseView || target.valuesOnly) {
      // Local settings and a named style are exclusive; typing here means the
      // block is no longer using the named one.
      update({ [slugKey]: "", [valuesKey]: next } as Partial<PageBlock>);
      return;
    }
    update({ [viewValuesKey(valuesKey, view)]: next } as Partial<PageBlock>);
  }

  /**
   * Turning a view on seeds it from what it was already showing, so the canvas
   * does not jump; turning it off keeps those values for a later change of
   * mind, since only the flag decides whether they are used.
   */
  function toggleOverride(on: boolean) {
    if (view === "desktop") return;
    update({
      [viewEnabledKey(valuesKey, view)]: on,
      ...(on ? { [viewValuesKey(valuesKey, view)]: shown } : {}),
    } as Partial<PageBlock>);
  }

  async function saveAsNamedStyle() {
    const name = saveAsName.trim();
    if (!name || saving) return;
    setSaving(true);
    const created = await onCreateNamedStyle({
      name,
      style: shown,
      hoverEnabled,
      hoverStyle: hoverValues,
      transitionDuration,
    });
    setSaving(false);
    if (!created) return;
    setSaveAsName("");
    update({ [slugKey]: created, [valuesKey]: undefined } as Partial<PageBlock>);
  }

  return (
    <>
      <div className="inspector-section">
        <div className="inspector-panel-head">
          <h4 className="inspector-title" style={{ margin: 0 }}>
            {target.title}
          </h4>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="help-text" style={{ marginTop: "0.4rem" }}>
          Editing the <strong>{VIEW_LABELS[view].toLowerCase()}</strong> view.
          Changes show in the canvas as you make them.
        </p>
      </div>

      {target.valuesOnly ? null : (
      <div className="inspector-section">
        <div className="field">
          <label>Saved style</label>
          <select
            value={slug}
            onChange={(event) =>
              update({ [slugKey]: event.target.value } as Partial<PageBlock>)
            }
          >
            <option value="">None — use the settings below</option>
            {savedStyles.map((style) => (
              <option key={style._id} value={style.slug}>
                {style.name}
              </option>
            ))}
          </select>
          <span className="help-text">
            A saved style replaces every local setting on this block, in every view.
          </span>
        </div>
      </div>
      )}

      {usingSavedStyle ? null : (
        <>
          {isBaseView || target.valuesOnly ? null : (
            <div className="inspector-section">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={overrideOn}
                  onChange={(event) => toggleOverride(event.target.checked)}
                />
                Separate {VIEW_LABELS[view].toLowerCase()} styles
              </label>
              <p className="help-text">
                {overrideOn
                  ? `These settings apply on ${VIEW_LABELS[view].toLowerCase()} only.`
                  : view === "mobile"
                    ? "Off — mobile shows the tablet settings, or the desktop ones when tablet has none of its own."
                    : "Off — tablet shows the desktop settings."}
              </p>
            </div>
          )}

          {/* A view that is off is shown read-only: the values on screen belong
              to a wider view, and editing them here would silently change it. */}
          {/* A slot with no per-view overrides is one set of settings, so it
              stays editable whichever viewport the canvas is showing — the
              alternative is a panel that goes read-only for no stated reason. */}
          <fieldset
            className="inspector-fieldset"
            disabled={!overrideOn && !target.valuesOnly}
          >
            {isBaseView && hoverEnabled ? (
              <div className="builder-tabs">
                <button
                  type="button"
                  className={`builder-tab${tab === "normal" ? " is-active" : ""}`}
                  onClick={() => setTab("normal")}
                >
                  Normal
                </button>
                <button
                  type="button"
                  className={`builder-tab${tab === "hover" ? " is-active" : ""}`}
                  onClick={() => setTab("hover")}
                >
                  Hover
                </button>
              </div>
            ) : null}

            {isBaseView && hoverEnabled && tab === "hover" ? (
              <StyleFields
                values={hoverValues}
                fonts={fonts}
                showTypography={target.showTypography}
                onChange={(patch) =>
                  setHoverValues((current) => ({ ...current, ...patch }))
                }
              />
            ) : (
              <StyleFields
                values={shown}
                fonts={fonts}
                showTypography={target.showTypography}
                onChange={(patch) => writeValues({ ...shown, ...patch })}
              />
            )}
          </fieldset>

          {/* A named style has no per-view form, so it can only be built from
              the base view — offering it elsewhere would promise a record shape
              that does not exist. */}
          {isBaseView ? (
            <div className="inspector-section">
              <h4 className="inspector-title">Reuse</h4>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={hoverEnabled}
                  onChange={(event) => {
                    setHoverEnabled(event.target.checked);
                    if (!event.target.checked) setTab("normal");
                  }}
                />
                Include a hover state
              </label>
              {hoverEnabled ? (
                <NumberField
                  label="Transition"
                  value={transitionDuration}
                  suffix="ms"
                  step={50}
                  remScaled={false}
                  onChange={(value) => setTransitionDuration(value ?? 200)}
                />
              ) : null}
              <div className="field">
                <label>Save as a named style</label>
                <input
                  type="text"
                  value={saveAsName}
                  placeholder="e.g. Section heading"
                  onChange={(event) => setSaveAsName(event.target.value)}
                />
                <span className="help-text">
                  Saves these desktop settings for reuse and switches this block to
                  them. Per-view overrides are dropped.
                </span>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!saveAsName.trim() || saving}
                onClick={saveAsNamedStyle}
              >
                {saving ? "Saving…" : "Save style"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
