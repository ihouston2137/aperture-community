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

    if (record.hoverEnabled) {
      const hover = styleValuesToDeclarations(normalizeStyleValues(record.hoverStyle));
      if (hover.trim()) {
        blocks.push(`${selector}:hover, ${selector}:focus-visible {\n${hover}\n}`);
      }
    }
  }

  return blocks.join("\n\n");
}

export function customStyleClassName(slug: string | null | undefined): string {
  return slug ? `custom-style-${slug}` : "";
}

/** Font faces for design-library fonts that expose a hosted stylesheet. */
export function fontImportCss(fonts: { cssUrl?: string }[]): string {
  return fonts
    .map((font) => font.cssUrl?.trim())
    .filter((url): url is string => Boolean(url))
    .map((url) => `@import url("${url}");`)
    .join("\n");
}
