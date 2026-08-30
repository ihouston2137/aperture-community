import type { CSSProperties } from "react";

/**
 * One shared style shape drives the centralized style editor, saved
 * `CustomStyle` records, and every builder's local (unnamed) style controls.
 *
 * Sizes are authored as numbers and always emitted in `rem` so text and
 * containers scale with the viewport. The editor shows pixel-ish numbers by
 * multiplying by `REM_BASE`; nothing downstream stores pixels.
 */

export type StyleValues = {
  // Typography
  fontFamily?: string;
  fontWeight?: number | string;
  fontSize?: number; // rem
  letterSpacing?: number; // rem
  lineHeight?: number; // unitless multiplier
  italic?: boolean;
  underline?: boolean;
  uppercase?: boolean;
  color?: string;
  textAlign?: "left" | "center" | "right" | "justify";

  // Container
  backgroundColor?: string;
  backgroundOpacity?: number; // 0..1
  borderWidth?: number; // rem
  borderStyle?: "none" | "solid" | "dashed" | "dotted";
  borderColor?: string;
  borderRadius?: number; // rem
  /** Per-corner overrides; each falls back to `borderRadius`. */
  borderRadiusTopLeft?: number;
  borderRadiusTopRight?: number;
  borderRadiusBottomRight?: number;
  borderRadiusBottomLeft?: number;

  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;

  shadowEnabled?: boolean;
  shadowX?: number; // rem
  shadowY?: number; // rem
  shadowBlur?: number; // rem
  shadowColor?: string;

  opacity?: number; // 0..1
  scale?: number;
};

export const EMPTY_STYLE: StyleValues = {};

/** In the order the `border-radius` shorthand expects. */
export const CORNER_KEYS = [
  "borderRadiusTopLeft",
  "borderRadiusTopRight",
  "borderRadiusBottomRight",
  "borderRadiusBottomLeft",
] as const;

export const SPACING_KEYS = [
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
] as const;

const NUMBER_KEYS = [
  "fontSize",
  "letterSpacing",
  "lineHeight",
  "backgroundOpacity",
  "borderWidth",
  "borderRadius",
  ...CORNER_KEYS,
  "shadowX",
  "shadowY",
  "shadowBlur",
  "opacity",
  "scale",
  ...SPACING_KEYS,
] as const;

const BOOLEAN_KEYS = ["italic", "underline", "uppercase", "shadowEnabled"] as const;

const STRING_KEYS = [
  "fontFamily",
  "color",
  "textAlign",
  "backgroundColor",
  "borderStyle",
  "borderColor",
  "shadowColor",
] as const;

function hexWithAlpha(color: string, opacity: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return color;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

export function normalizeStyleValues(input: unknown): StyleValues {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;
  const out: StyleValues = {};

  for (const key of NUMBER_KEYS) {
    const value = raw[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      (out as Record<string, unknown>)[key] = value;
    } else if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      (out as Record<string, unknown>)[key] = Number(value);
    }
  }

  for (const key of BOOLEAN_KEYS) {
    if (typeof raw[key] === "boolean") (out as Record<string, unknown>)[key] = raw[key];
  }

  for (const key of STRING_KEYS) {
    const value = raw[key];
    if (typeof value === "string" && value.trim() !== "") {
      (out as Record<string, unknown>)[key] = value.trim();
    }
  }

  const weight = raw.fontWeight;
  if (typeof weight === "number" || (typeof weight === "string" && weight.trim() !== "")) {
    out.fontWeight = weight as number | string;
  }

  return out;
}

/** Convert style values into React inline-style properties. */
/**
 * Which shadow a set of style values casts.
 *
 * `box` is a shadow of the element's rectangle — right for a card, a panel, a
 * picture with square corners. `drop` is a shadow of what is actually drawn:
 * the letterforms of a word, the outline of a shape, the shape of a cut-out
 * picture. They are different pictures, not two ways of drawing one, and
 * asking for a shadow on a line of text and being handed a rectangle behind it
 * is the wrong one.
 *
 * `drop` follows the element's own alpha, so a block that *does* carry a
 * background or a border still casts the shadow of that box — one setting
 * gives the right answer either way, without the author having to say which.
 */
export type ShadowMode = "box" | "drop";

export function styleValuesToCss(
  values: StyleValues | undefined,
  shadow: ShadowMode = "box"
): CSSProperties {
  const style: Record<string, string | number> = {};
  if (!values) return style as CSSProperties;

  if (values.fontFamily) style.fontFamily = values.fontFamily;
  if (values.fontWeight !== undefined) style.fontWeight = values.fontWeight;
  if (values.fontSize !== undefined) style.fontSize = `${values.fontSize}rem`;
  if (values.letterSpacing !== undefined) style.letterSpacing = `${values.letterSpacing}rem`;
  if (values.lineHeight !== undefined) style.lineHeight = values.lineHeight;
  if (values.italic) style.fontStyle = "italic";
  if (values.underline) style.textDecoration = "underline";
  if (values.uppercase) style.textTransform = "uppercase";
  if (values.color) style.color = values.color;
  if (values.textAlign) style.textAlign = values.textAlign;

  if (values.backgroundColor) {
    style.backgroundColor =
      values.backgroundOpacity !== undefined && values.backgroundOpacity < 1
        ? hexWithAlpha(values.backgroundColor, values.backgroundOpacity)
        : values.backgroundColor;
  }

  if (values.borderStyle && values.borderStyle !== "none") {
    style.borderStyle = values.borderStyle;
    style.borderWidth = `${values.borderWidth ?? 0.0625}rem`;
    style.borderColor = values.borderColor ?? "currentColor";
  }
  // Any single corner switches to the four-value shorthand, with the others
  // falling back to the overall radius.
  if (CORNER_KEYS.some((key) => values[key] !== undefined)) {
    const base = values.borderRadius ?? 0;
    style.borderRadius = CORNER_KEYS.map((key) => `${values[key] ?? base}rem`).join(" ");
  } else if (values.borderRadius !== undefined) {
    style.borderRadius = `${values.borderRadius}rem`;
  }

  for (const key of SPACING_KEYS) {
    const value = values[key];
    if (value !== undefined) style[key] = `${value}rem`;
  }

  if (values.shadowEnabled) {
    const x = values.shadowX ?? 0;
    const y = values.shadowY ?? 0.25;
    const blur = values.shadowBlur ?? 0.75;
    const colour = values.shadowColor ?? "rgba(0,0,0,0.3)";
    const cast = `${x}rem ${y}rem ${blur}rem ${colour}`;

    if (shadow === "drop") style.filter = `drop-shadow(${cast})`;
    else style.boxShadow = cast;
  }

  if (values.opacity !== undefined) style.opacity = values.opacity;
  if (values.scale !== undefined) style.transform = `scale(${values.scale})`;

  return style as CSSProperties;
}

/** Same output, but as a CSS declaration block for generated stylesheets. */
export function styleValuesToDeclarations(
  values: StyleValues | undefined,
  shadow: ShadowMode = "box"
): string {
  const css = styleValuesToCss(values, shadow) as Record<string, string | number>;
  return Object.entries(css)
    .map(([key, value]) => {
      const property = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
      return `  ${property}: ${value};`;
    })
    .join("\n");
}
