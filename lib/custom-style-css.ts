import { fontFaceCss, normalizeSiteFont } from "./site-fonts";
import { normalizeStyleValues, styleValuesToDeclarations } from "./style-values";

export type CustomStyleRecord = {
  slug: string;
  style?: unknown;
  hoverEnabled?: boolean;
  hoverStyle?: unknown;
  transitionDuration?: number;
};

/**
 * Turn saved `CustomStyle` records into `.custom-style-{slug}` rules. The
 * generated sheet is injected once per page so both builder previews and public
 * renderers resolve named styles identically.
 */
export function customStyleCss(styles: CustomStyleRecord[]): string {
  const blocks: string[] = [];

  for (const record of styles) {
    if (!record?.slug) continue;
    const selector = `.custom-style-${record.slug}`;
    const base = styleValuesToDeclarations(normalizeStyleValues(record.style));
    const duration = record.transitionDuration ?? 200;

    const baseLines = [base, `  transition: all ${duration}ms ease;`]
      .filter(Boolean)
      .join("\n");
    blocks.push(`${selector} {\n${baseLines}\n}`);

    /*
     * The same shadow, cast by what is drawn, inside a publication.
     *
     * A publication block is a rectangle on a canvas holding a word or an
     * icon, and the rectangle is a place rather than a thing — a shadow of it
     * is a shadow of nothing anybody put there. Elsewhere the box is usually a
     * card and a shadow of it is right, so the swap is scoped to publications
     * rather than made everywhere: one saved style, dressing a heading on a
     * page and a heading on a slide, should not have to choose between them.
     *
     * `drop-shadow` follows the element's own alpha, so a block that does
     * carry a background or a border still casts the shadow of that box.
     */
    const drop = styleValuesToDeclarations(
      normalizeStyleValues(record.style),
      "drop"
    )
      .split("\n")
      .filter((line) => line.includes("filter:"))
      .join("\n");

    if (drop) {
      blocks.push(
        `.pub-block ${selector},\n.pub-editor-block ${selector} {\n  box-shadow: none;\n${drop}\n}`
      );
    }

    if (record.hoverEnabled) {
      const hover = styleValuesToDeclarations(normalizeStyleValues(record.hoverStyle));
      if (hover.trim()) {
        blocks.push(`${selector}:hover, ${selector}:focus-visible {\n${hover}\n}`);
      }
    }
  }

  return blocks.join("\n\n");
}

/** A font as stored, before `normalizeSiteFont` makes sense of it. */
type FontRecord = {
  cssUrl?: string;
  faces?: unknown[];
};

export function customStyleClassName(slug: string | null | undefined): string {
  return slug ? `custom-style-${slug}` : "";
}

/**
 * Every design-library family, however it is served.
 *
 * A Google family arrives as a hosted stylesheet to `@import`; an uploaded one
 * as `@font-face` rules over the stored files. The two are emitted together
 * because nothing downstream tells them apart — a family is a name in a
 * picker, and this is where that name is made to mean something.
 *
 * The imports lead: CSS ignores an `@import` that follows a rule.
 */
export function fontImportCss(fonts: FontRecord[]): string {
  const imports = fonts
    .map((font) => (font.faces?.length ? "" : String(font.cssUrl ?? "").trim()))
    .filter(Boolean)
    .map((url) => `@import url("${url}");`)
    .join("\n");

  const faces = fontFaceCss(fonts.map(normalizeSiteFont));

  return [imports, faces].filter(Boolean).join("\n\n");
}
