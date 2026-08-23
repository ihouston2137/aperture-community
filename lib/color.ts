/**
 * Colours are stored as ordinary CSS strings. A fully opaque colour stays a hex
 * value so existing data and `<input type="color">` keep working; anything
 * transparent is written as `rgba()`.
 */

export type ParsedColor = {
  /** Six-digit hex, always opaque — what the native colour input needs. */
  hex: string;
  /** 0–1. */
  alpha: number;
};

const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_6 = /^#([0-9a-f]{6})$/i;
const HEX_8 = /^#([0-9a-f]{6})([0-9a-f]{2})$/i;
const RGBA = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

function toHexPart(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function clampAlpha(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

export function parseColor(value: string | undefined, fallback = "#000000"): ParsedColor {
  const input = (value ?? "").trim();
  if (!input) return { hex: fallback, alpha: 1 };

  const hex8 = HEX_8.exec(input);
  if (hex8) {
    return { hex: `#${hex8[1].toLowerCase()}`, alpha: clampAlpha(parseInt(hex8[2], 16) / 255) };
  }

  const hex6 = HEX_6.exec(input);
  if (hex6) return { hex: `#${hex6[1].toLowerCase()}`, alpha: 1 };

  const hex3 = HEX_3.exec(input);
  if (hex3) {
    return {
      hex: `#${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}`.toLowerCase(),
      alpha: 1,
    };
  }

  const rgba = RGBA.exec(input);
  if (rgba) {
    const alphaRaw = rgba[4];
    const alpha = alphaRaw
      ? clampAlpha(alphaRaw.endsWith("%") ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw))
      : 1;
    return {
      hex: `#${toHexPart(Number(rgba[1]))}${toHexPart(Number(rgba[2]))}${toHexPart(Number(rgba[3]))}`,
      alpha,
    };
  }

  // Named colours and anything else we cannot decompose are treated as opaque.
  return { hex: fallback, alpha: 1 };
}

export function formatColor(hex: string, alpha: number): string {
  const safeHex = HEX_6.test(hex) ? hex.toLowerCase() : "#000000";
  const safeAlpha = clampAlpha(alpha);

  if (safeAlpha >= 1) return safeHex;

  const value = safeHex.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(safeAlpha * 100) / 100})`;
}

/** True when the value carries any transparency. */
export function isTransparent(value: string | undefined): boolean {
  return parseColor(value).alpha < 1;
}
