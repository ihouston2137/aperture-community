/**
 * Font families that come from a file rather than from Google.
 *
 * A design library family is a name — every picker on the site, from the
 * appearance editor to a publication block, stores the family name and nothing
 * else. Where that name resolves from is this module's business: a hosted
 * stylesheet for a Google family, an `@font-face` rule pointing at an uploaded
 * file for one somebody owns. Both end up in the same stylesheet in the root
 * layout, so a bought or commissioned typeface is usable everywhere a Google
 * one is, with nothing downstream needing to know the difference.
 *
 * Imported by client components, so it stays dependency-free.
 */

import { protectedMediaUrl } from "./protected-media-url";

/** Where a family's letterforms come from. */
export type FontSource = "google" | "file";

/**
 * The file formats a browser will take.
 *
 * TrueType is what people have — a bought face, a foundry download, something
 * exported from a type tool — so it is the one this exists for. The others are
 * accepted because refusing a `.woff2` that would load smaller and faster than
 * the `.ttf` beside it would be perverse.
 */
export const FONT_FILE_FORMATS: Record<string, string> = {
  ".ttf": "truetype",
  ".otf": "opentype",
  ".woff": "woff",
  ".woff2": "woff2",
};

/** What the browser file picker should offer. */
export const FONT_FILE_ACCEPT = Object.keys(FONT_FILE_FORMATS).join(",");

export const FONT_WEIGHTS = [
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
] as const;

export const FONT_STYLES = ["normal", "italic"] as const;

/**
 * One file: one weight, one slant.
 *
 * A family is several of these. A browser handed only a 400 will fake the bold
 * by smearing it, which is why the upload form asks which weight a file is
 * rather than guessing from its name — "Whitney-Semibold.ttf" and
 * "whitney_600_v2.ttf" are the same thing and no rule reads both.
 */
export type FontFace = {
  /** The stored path, under `/uploads/fonts`. */
  url: string;
  weight: string;
  style: "normal" | "italic";
  /** The `format()` hint, from the extension at upload time. */
  format: string;
  /** What it was called when it arrived, so the list is recognisable. */
  originalName: string;
};

export type SiteFont = {
  family: string;
  category: string;
  variants: string[];
  source: FontSource;
  /** Set for a Google family; empty for an uploaded one. */
  cssUrl: string;
  faces: FontFace[];
};

export function fontFormatForExtension(extension: string): string {
  return FONT_FILE_FORMATS[extension.toLowerCase()] ?? "";
}

export function normalizeFontWeight(value: unknown): string {
  const text = String(value ?? "").trim();
  return (FONT_WEIGHTS as readonly string[]).includes(text) ? text : "400";
}

export function normalizeFontStyle(value: unknown): "normal" | "italic" {
  return value === "italic" ? "italic" : "normal";
}

export function normalizeFontFace(record: any): FontFace | null {
  const url = String(record?.url ?? "").trim();
  if (!url) return null;

  const extension = url.slice(url.lastIndexOf(".")).toLowerCase();

  return {
    url,
    weight: normalizeFontWeight(record?.weight),
    style: normalizeFontStyle(record?.style),
    // Records written before the format was stored fall back to the
    // extension, which is where it came from in the first place.
    format: String(record?.format ?? "") || fontFormatForExtension(extension),
    originalName: String(record?.originalName ?? "") || url.split("/").pop() || "",
  };
}

export function normalizeSiteFont(record: any): SiteFont {
  const faces: FontFace[] = [];
  if (Array.isArray(record?.faces)) {
    for (const entry of record.faces) {
      const face = normalizeFontFace(entry);
      if (face) faces.push(face);
    }
  }

  // A family with files is a file family whatever it says, and one without is
  // a Google family — the flag is a convenience, not the truth of it.
  const source: FontSource = faces.length > 0 ? "file" : "google";

  return {
    family: String(record?.family ?? ""),
    category: String(record?.category ?? "sans-serif"),
    variants: Array.isArray(record?.variants) ? record.variants.map(String) : ["400"],
    source,
    cssUrl: source === "file" ? "" : String(record?.cssUrl ?? ""),
    faces,
  };
}

/**
 * `@font-face` rules for the uploaded families.
 *
 * The file is served through the media route like everything else under
 * `/uploads`, so the path checks and cache headers are the ones already
 * written rather than a second set for fonts alone.
 *
 * `font-display: swap` on purpose: text in a fallback face for a moment beats
 * text that is not there at all, and a heading font is exactly the thing a
 * blocking load would hide.
 */
export function fontFaceCss(fonts: SiteFont[]): string {
  const rules: string[] = [];

  for (const font of fonts) {
    if (!font.family) continue;

    for (const face of font.faces) {
      const src = protectedMediaUrl(face.url);
      if (!src) continue;

      const format = face.format ? ` format("${face.format}")` : "";
      rules.push(
        `@font-face {\n` +
          `  font-family: "${font.family}";\n` +
          `  src: url("${src}")${format};\n` +
          `  font-weight: ${face.weight};\n` +
          `  font-style: ${face.style};\n` +
          `  font-display: swap;\n` +
          `}`
      );
    }
  }

  return rules.join("\n\n");
}
