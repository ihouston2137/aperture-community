import type { CSSProperties } from "react";

import { formatColor, parseColor } from "./color";
import { styleValuesToCss, type StyleValues } from "./style-values";

/**
 * How a table cell gets its look.
 *
 * A table is the one place in a publication where several things have an
 * opinion about the same cell — the table as a whole, the column it is in, the
 * row it is in, whether that row is a heading or a banded one, and the cell
 * itself. So the look is *resolved* here, in values, and turned into CSS once
 * at the end.
 *
 * Resolving in values rather than by layering CSS objects is the whole point.
 * `styleValuesToCss` writes "no border" as the *absence* of border properties,
 * which is correct for a single element and useless in a cascade: a cell asked
 * to have no border contributed nothing, so the table's own border went on
 * showing through it. Absence cannot overrule presence. Here "none" is a value
 * like any other, it wins where it is set, and only the answer becomes CSS.
 */

/* --------------------------------------------------------------- Cascade */

/**
 * The order things get their say, weakest first:
 *
 *   the table's own default for every cell
 *   → the automatic scheme: banding, then the heading row and column
 *   → the column
 *   → the row
 *   → the cell
 *
 * Automatic before explicit, and explicit in the order of how few cells it
 * speaks for. Anything somebody set by hand therefore beats anything the
 * scheme did on their behalf: colouring one row and then switching banding on
 * leaves that row the colour it was told to be.
 */
export function resolveStyle(layers: (StyleValues | undefined)[]): StyleValues {
  const resolved: StyleValues = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      // `undefined` is "no opinion" and must not erase a stronger layer's
      // answer; every other value, `none` included, is an opinion.
      if (value !== undefined) (resolved as Record<string, unknown>)[key] = value;
    }
  }
  return resolved;
}

/**
 * A resolved style as CSS a table cell can wear.
 *
 * `border: none` is written out explicitly, because by this point "none" is a
 * decision somebody made rather than a gap in what they said.
 */
export function tableCellCss(values: StyleValues): CSSProperties {
  const css = styleValuesToCss(values) as CSSProperties;
  return values.borderStyle === "none" ? { ...css, border: "none" } : css;
}

/**
 * A style with its empty answers dropped.
 *
 * Clearing a fill is saying `backgroundColor: undefined`, and a key left
 * sitting there as `undefined` would be indistinguishable from one never set —
 * true in the cascade, but it would also be written to storage and read back
 * as noise. Removed here so "cleared" and "never said" are the same thing.
 */
export function cleanStyle(values: StyleValues): StyleValues {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") kept[key] = value;
  }
  return kept as StyleValues;
}

/* ---------------------------------------------------------------- Scheme */

/** The colour a fresh table is built around. */
export const DEFAULT_TABLE_ACCENT = "#64748b";

function withAlpha(color: string, alpha: number): string {
  const { hex } = parseColor(color, "#64748b");
  return formatColor(hex, alpha);
}

/**
 * Whether black or white reads on a colour, by its relative luminance.
 *
 * A heading row is filled with the accent and has to carry words over it, and
 * the accent is whatever somebody chose — dark navy or pale sand.
 */
export function readableOn(color: string): string {
  const { hex } = parseColor(color, "#64748b");
  const channel = (from: number) => {
    const value = parseInt(hex.slice(from, from + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.42 ? "#0f172a" : "#ffffff";
}

export type TableScheme = {
  /** Every cell: the lines between them. */
  base: StyleValues;
  /** The heading row and column. */
  header: StyleValues;
  /** Every other body row. */
  band: StyleValues;
};

/**
 * A whole look from one colour.
 *
 * Choosing a scheme should be choosing a colour, not filling in six boxes that
 * have to be kept in agreement. The heading takes the colour solid with
 * readable words over it, the banding takes a wash of it, and the lines take
 * enough of it to be seen without being drawn attention to.
 */
export function tableScheme(accent: string | undefined): TableScheme {
  const color = accent || DEFAULT_TABLE_ACCENT;

  return {
    base: {
      borderStyle: "solid",
      borderWidth: 0.0625,
      borderColor: withAlpha(color, 0.45),
    },
    header: {
      backgroundColor: color,
      color: readableOn(color),
      fontWeight: 600,
    },
    band: { backgroundColor: withAlpha(color, 0.12) },
  };
}
