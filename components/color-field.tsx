"use client";

import { formatColor, parseColor } from "@/lib/color";

/**
 * The single colour control used everywhere in the admin: a swatch, the hex
 * value, and an opacity slider. The stored value stays a hex string while fully
 * opaque and becomes `rgba()` as soon as opacity drops below 100%.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  onClear,
  help,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  /** Shown as a Clear button when the value is optional. */
  onClear?: () => void;
  help?: string;
}) {
  const { hex, alpha } = parseColor(value);
  const percent = Math.round(alpha * 100);

  return (
    <div className="field">
      <label>{label}</label>

      <div className="color-control">
        {/* A checkerboard behind the swatch makes transparency visible. */}
        <span className="color-swatch">
          <span className="color-swatch-fill" style={{ background: value || "transparent" }} />
          <input
            type="color"
            value={hex}
            aria-label={`${label} colour`}
            onChange={(event) => onChange(formatColor(event.target.value, alpha))}
          />
        </span>

        <input
          type="text"
          className="color-value"
          value={value ?? ""}
          placeholder="#000000"
          aria-label={`${label} value`}
          onChange={(event) => onChange(event.target.value)}
        />

        {onClear ? (
          <button type="button" className="btn btn-sm" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="color-alpha">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          aria-label={`${label} opacity`}
          onChange={(event) => onChange(formatColor(hex, Number(event.target.value) / 100))}
        />
        <span className="help-text">{percent}%</span>
      </div>

      {help ? <span className="help-text">{help}</span> : null}
    </div>
  );
}
