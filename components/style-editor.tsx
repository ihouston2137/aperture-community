"use client";

import { useState } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { ColorPicker } from "@/components/color-field";
import {
  CORNER_KEYS,
  normalizeStyleValues,
  styleValuesToCss,
  type StyleValues,
} from "@/lib/style-values";

/**
 * The one style editor used by every builder (pages, forms, story templates,
 * publications, collections). It edits a `StyleValues` object and can save the
 * result as a reusable named style. Every size is authored, stored and rendered
 * in rem, so what the inputs show is exactly what lands in the CSS.
 */

export type SavedStyle = {
  _id: string;
  name: string;
  slug: string;
  style?: StyleValues;
  hoverEnabled?: boolean;
  hoverStyle?: StyleValues;
  transitionDuration?: number;
};

export type StyleEditorResult = {
  values: StyleValues;
  hoverEnabled: boolean;
  hoverValues: StyleValues;
  transitionDuration: number;
  /** Set when the user picked a saved style instead of editing locally. */
  styleSlug: string;
  /** Set when the user asked to save these values as a new named style. */
  saveAsName: string;
};

const FONT_WEIGHTS = ["300", "400", "500", "600", "700", "800", "900"];

export function NumberField({
  label,
  value,
  onChange,
  step,
  suffix = "rem",
  /** Sizes are edited in rem directly — no pixel conversion anywhere. */
  remScaled = true,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  step?: number;
  suffix?: string;
  remScaled?: boolean;
}) {
  return (
    <div className="field">
      <label>
        {label} <span className="help-text">({suffix})</span>
      </label>
      <input
        type="number"
        step={step ?? (remScaled ? 0.125 : 1)}
        value={value === undefined ? "" : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw === "") return onChange(undefined);
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </div>
  );
}

/** Optional colour: clearing it falls back to whatever the block inherits. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <ColorPicker
      label={label}
      value={value}
      onChange={onChange}
      onClear={() => onChange(undefined)}
    />
  );
}

/**
 * A row of four side values with a leading control that drives all of them.
 *
 * The "all" box shows a value only when the sides agree, so it reads as a
 * shortcut rather than a separate setting; typing in it writes every side, and
 * clearing it clears them.
 */
function SideFields({
  label,
  keys,
  sideLabels,
  values,
  onChange,
  allKey,
}: {
  label: string;
  keys: readonly (keyof StyleValues)[];
  sideLabels: readonly string[];
  values: StyleValues;
  onChange: (patch: Partial<StyleValues>) => void;
  /**
   * For corner radius, the shortcut writes the single `borderRadius` and clears
   * the per-corner overrides. Spacing has no such key, so it writes all four.
   */
  allKey?: keyof StyleValues;
}) {
  const sides = keys.map((key) => values[key] as number | undefined);
  const anySide = sides.some((value) => value !== undefined);
  const sidesAgree = sides.every((value) => value !== undefined && value === sides[0]);

  const allValue = anySide
    ? sidesAgree
      ? sides[0]
      : undefined
    : allKey
      ? (values[allKey] as number | undefined)
      : undefined;

  function setAll(value: number | undefined) {
    if (allKey) {
      const cleared = Object.fromEntries(keys.map((key) => [key, undefined]));
      onChange({ ...cleared, [allKey]: value } as Partial<StyleValues>);
      return;
    }
    onChange(Object.fromEntries(keys.map((key) => [key, value])) as Partial<StyleValues>);
  }

  return (
    <div className="style-sides">
      <div className="style-sides-all">
        <NumberField label={`${label} — all`} value={allValue} onChange={setAll} />
      </div>
      {keys.map((key, index) => (
        <NumberField
          key={String(key)}
          label={sideLabels[index]}
          value={values[key] as number | undefined}
          onChange={(value) => onChange({ [key]: value } as Partial<StyleValues>)}
        />
      ))}
    </div>
  );
}

export function StyleFields({
  values,
  fonts,
  showTypography = true,
  onChange,
}: {
  values: StyleValues;
  fonts: string[];
  /** Hidden for blocks with no text of their own, such as an image. */
  showTypography?: boolean;
  onChange: (patch: Partial<StyleValues>) => void;
}) {
  return (
    <>
      {showTypography ? (
      <div className="inspector-section">
        <h4 className="inspector-title">Typography</h4>
        <div className="field-grid">
          <div className="field">
            <label>Font family</label>
            <select
              value={values.fontFamily ?? ""}
              onChange={(event) => onChange({ fontFamily: event.target.value || undefined })}
            >
              <option value="">Inherit</option>
              {fonts.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Weight</label>
            <select
              value={String(values.fontWeight ?? "")}
              onChange={(event) =>
                onChange({ fontWeight: event.target.value || undefined })
              }
            >
              <option value="">Inherit</option>
              {FONT_WEIGHTS.map((weight) => (
                <option key={weight} value={weight}>
                  {weight}
                </option>
              ))}
            </select>
          </div>

          <NumberField
            label="Size"
            value={values.fontSize}
            onChange={(value) => onChange({ fontSize: value })}
          />
          <NumberField
            label="Character spacing"
            value={values.letterSpacing}
            step={0.01}
            onChange={(value) => onChange({ letterSpacing: value })}
          />
          <NumberField
            label="Line spacing"
            value={values.lineHeight}
            step={0.05}
            suffix="×"
            remScaled={false}
            onChange={(value) => onChange({ lineHeight: value })}
          />

          <div className="field">
            <label>Alignment</label>
            <select
              value={values.textAlign ?? ""}
              onChange={(event) =>
                onChange({ textAlign: (event.target.value || undefined) as StyleValues["textAlign"] })
              }
            >
              <option value="">Inherit</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
          </div>

          <ColorField
            label="Text colour"
            value={values.color}
            onChange={(value) => onChange({ color: value })}
          />
        </div>

        <div style={{ display: "flex", gap: "1rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(values.italic)}
              onChange={(event) => onChange({ italic: event.target.checked })}
            />
            Italic
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(values.underline)}
              onChange={(event) => onChange({ underline: event.target.checked })}
            />
            Underline
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={Boolean(values.uppercase)}
              onChange={(event) => onChange({ uppercase: event.target.checked })}
            />
            All caps
          </label>
        </div>
      </div>
      ) : null}

      <div className="inspector-section">
        <h4 className="inspector-title">Container</h4>
        <div className="field-grid">
          <ColorField
            label="Background"
            value={values.backgroundColor}
            onChange={(value) => onChange({ backgroundColor: value })}
          />
          <div className="field">
            <label>Border style</label>
            <select
              value={values.borderStyle ?? "none"}
              onChange={(event) =>
                onChange({ borderStyle: event.target.value as StyleValues["borderStyle"] })
              }
            >
              <option value="none">None</option>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </div>
          <NumberField
            label="Border width"
            value={values.borderWidth}
            step={0.0625}
            onChange={(value) => onChange({ borderWidth: value })}
          />
          <ColorField
            label="Border colour"
            value={values.borderColor}
            onChange={(value) => onChange({ borderColor: value })}
          />
          <NumberField
            label="Opacity"
            value={values.opacity}
            step={0.05}
            suffix="0–1"
            remScaled={false}
            onChange={(value) => onChange({ opacity: value })}
          />
          <NumberField
            label="Scale"
            value={values.scale}
            step={0.01}
            suffix="×"
            remScaled={false}
            onChange={(value) => onChange({ scale: value })}
          />
        </div>

        <SideFields
          label="Radius"
          allKey="borderRadius"
          keys={CORNER_KEYS}
          sideLabels={["Top left", "Top right", "Bottom right", "Bottom left"]}
          values={values}
          onChange={onChange}
        />
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Spacing</h4>
        <SideFields
          label="Padding"
          keys={["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]}
          sideLabels={["Top", "Right", "Bottom", "Left"]}
          values={values}
          onChange={onChange}
        />
        <SideFields
          label="Margin"
          keys={["marginTop", "marginRight", "marginBottom", "marginLeft"]}
          sideLabels={["Top", "Right", "Bottom", "Left"]}
          values={values}
          onChange={onChange}
        />
      </div>

      <div className="inspector-section">
        <h4 className="inspector-title">Shadow</h4>
        <label className="checkbox-row" style={{ marginBottom: "0.6rem" }}>
          <input
            type="checkbox"
            checked={Boolean(values.shadowEnabled)}
            onChange={(event) => onChange({ shadowEnabled: event.target.checked })}
          />
          Enable shadow
        </label>
        {values.shadowEnabled ? (
          <div className="field-grid">
            <NumberField label="Offset X" value={values.shadowX} onChange={(v) => onChange({ shadowX: v })} />
            <NumberField label="Offset Y" value={values.shadowY} onChange={(v) => onChange({ shadowY: v })} />
            <NumberField label="Blur" value={values.shadowBlur} onChange={(v) => onChange({ shadowBlur: v })} />
            <ColorField
              label="Shadow colour"
              value={values.shadowColor}
              onChange={(value) => onChange({ shadowColor: value })}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * The same style controls, in a settings column rather than a popup.
 *
 * Fully controlled and applied on every keystroke, so the canvas beside it is
 * the preview — which is why there is no sample text here. Built on the same
 * `StyleFields` as the popup, so a new control reaches both.
 *
 * No hover state: this is for surfaces that store a style and a saved-style
 * slug and nothing else, and offering hover would promise something the record
 * cannot keep.
 */
export function InlineStyleEditor({
  values,
  styleSlug,
  fonts,
  savedStyles,
  showTypography = true,
  showSavedStyles = true,
  onChange,
}: {
  values: StyleValues | undefined;
  styleSlug: string;
  fonts: string[];
  savedStyles: SavedStyle[];
  showTypography?: boolean;
  /**
   * Off where a named style has nothing to say — a shape's fill and outline are
   * its own, and the saved styles are written for text.
   */
  showSavedStyles?: boolean;
  onChange: (next: { values: StyleValues; styleSlug: string }) => void;
}) {
  const current = normalizeStyleValues(values);

  return (
    <>
      {showSavedStyles ? (
        <div className="field">
          <label>Saved style</label>
          <select
            value={styleSlug}
            onChange={(event) => onChange({ values: current, styleSlug: event.target.value })}
          >
            <option value="">None — use the settings below</option>
            {savedStyles.map((style) => (
              <option key={style._id} value={style.slug}>
                {style.name}
              </option>
            ))}
          </select>
          <span className="help-text">
            A saved style replaces every local setting on this block.
          </span>
        </div>
      ) : null}

      {showSavedStyles && styleSlug ? null : (
        <StyleFields
          values={current}
          fonts={fonts}
          showTypography={showTypography}
          onChange={(patch) => onChange({ values: { ...current, ...patch }, styleSlug: "" })}
        />
      )}
    </>
  );
}

type StyleEditorProps = {
  open: boolean;
  title?: string;
  /** Hide text settings for blocks that render no text of their own. */
  showTypography?: boolean;
  initial: Partial<StyleEditorResult>;
  fonts: string[];
  savedStyles: SavedStyle[];
  onApply: (result: StyleEditorResult) => void;
  onClose: () => void;
};

/**
 * The popup is unmounted while closed, so opening it always starts from the
 * caller's current values — no reset effect, and no cascading render.
 */
export function StyleEditor(props: StyleEditorProps) {
  if (!props.open) return null;
  return <StyleEditorBody {...props} />;
}

function StyleEditorBody({
  title = "Style",
  initial,
  fonts,
  savedStyles,
  showTypography = true,
  onApply,
  onClose,
}: StyleEditorProps) {
  const [values, setValues] = useState<StyleValues>(() =>
    normalizeStyleValues(initial.values)
  );
  const [hoverValues, setHoverValues] = useState<StyleValues>(() =>
    normalizeStyleValues(initial.hoverValues)
  );
  const [hoverEnabled, setHoverEnabled] = useState(Boolean(initial.hoverEnabled));
  const [transitionDuration, setTransitionDuration] = useState(
    initial.transitionDuration ?? 200
  );
  const [styleSlug, setStyleSlug] = useState(initial.styleSlug ?? "");
  const [saveAsName, setSaveAsName] = useState("");
  const [tab, setTab] = useState<"normal" | "hover">("normal");

  const usingSavedStyle = Boolean(styleSlug);
  const previewStyle = styleValuesToCss(values);

  return (
    <ModalPortal>
      <div className="style-modal-backdrop" onClick={onClose}>
        <div className="style-modal" onClick={(event) => event.stopPropagation()}>
          <div className="style-modal-header">
            <strong>{title}</strong>
            <div className="builder-tabs" style={{ marginLeft: "auto", marginBottom: 0 }}>
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
                disabled={!hoverEnabled}
              >
                Hover
              </button>
            </div>
          </div>

          <div className="style-modal-body style-editor-body">
            <div className="style-preview">
              <span
                className={usingSavedStyle ? `custom-style-${styleSlug}` : undefined}
                style={usingSavedStyle ? undefined : previewStyle}
              >
                The quick brown fox
              </span>
            </div>

            <div className="field">
              <label>Saved style</label>
              <select value={styleSlug} onChange={(event) => setStyleSlug(event.target.value)}>
                <option value="">None — use the settings below</option>
                {savedStyles.map((style) => (
                  <option key={style._id} value={style.slug}>
                    {style.name}
                  </option>
                ))}
              </select>
              <span className="help-text">
                A saved style replaces every local setting on this block.
              </span>
            </div>

            {usingSavedStyle ? null : (
              <>
                <div className="inspector-section">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={hoverEnabled}
                      onChange={(event) => {
                        setHoverEnabled(event.target.checked);
                        if (!event.target.checked) setTab("normal");
                      }}
                    />
                    Enable hover state
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
                </div>

                {tab === "normal" ? (
                  <StyleFields
                    values={values}
                    fonts={fonts}
                    onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
                  />
                ) : (
                  <StyleFields
                    values={hoverValues}
                    fonts={fonts}
                    onChange={(patch) => setHoverValues((current) => ({ ...current, ...patch }))}
                  />
                )}

                <div className="inspector-section">
                  <h4 className="inspector-title">Reuse</h4>
                  <div className="field">
                    <label>Save as a named style</label>
                    <input
                      type="text"
                      value={saveAsName}
                      placeholder="e.g. Section heading"
                      onChange={(event) => setSaveAsName(event.target.value)}
                    />
                    <span className="help-text">
                      Leave blank to keep these settings on this block only.
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="style-modal-footer">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={() =>
                onApply({
                  values,
                  hoverEnabled,
                  hoverValues,
                  transitionDuration,
                  styleSlug,
                  saveAsName: saveAsName.trim(),
                })
              }
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
