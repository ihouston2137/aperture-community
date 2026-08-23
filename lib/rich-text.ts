/**
 * Rich text is authored in Quill and rendered with `dangerouslySetInnerHTML`,
 * so every string is normalized on save:
 *
 * - dangerous markup (scripts, event handlers, javascript: urls) is removed
 * - non-breaking spaces become ordinary spaces so text wraps
 * - pixel font sizes are converted to rem so text scales with the viewport
 * - empty paragraph spam is collapsed to a single spacer
 */

export const REM_BASE = 16;

export function pxToRem(px: number): number {
  return Math.round((px / REM_BASE) * 1000) / 1000;
}

export function remToPx(rem: number): number {
  return Math.round(rem * REM_BASE);
}

const BLOCKED_TAGS = /<\/?(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi;
const SCRIPT_BLOCK = /<script\b[\s\S]*?<\/script>/gi;
const STYLE_BLOCK = /<style\b[\s\S]*?<\/style>/gi;
const EVENT_ATTRS = /\s on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /\s(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi;

export function sanitizeRichText(html: string): string {
  if (!html) return "";
  return html
    .replace(SCRIPT_BLOCK, "")
    .replace(STYLE_BLOCK, "")
    .replace(BLOCKED_TAGS, "")
    .replace(EVENT_ATTRS, "")
    .replace(JS_URLS, "");
}

/**
 * Quill serializes every space inside a text run as `&nbsp;`
 * (`escapedText.replaceAll(' ', '&nbsp;')` in its `convertHTML`). Non-breaking
 * spaces are never allowed to wrap, so left alone a paragraph renders as one
 * unbreakable line that overflows its column. Ordinary spaces are what the
 * author meant in every case; a deliberate non-breaking space is not something
 * the toolbar can produce.
 */
export function normalizeRichTextSpaces(html: string): string {
  if (!html) return "";
  // The escape rather than a literal U+00A0, which is invisible in source.
  return html.replace(/&nbsp;|&#160;|&#xa0;|\u00a0/gi, " ");
}

/** Rewrite inline `font-size: 24px` declarations to their rem equivalent. */
export function convertFontSizesToRem(html: string): string {
  if (!html) return "";
  return html.replace(
    /font-size\s*:\s*([\d.]+)px/gi,
    (_match, value: string) => `font-size: ${pxToRem(Number(value))}rem`
  );
}

/** Collapse runs of empty paragraphs to a single spacer paragraph. */
export function normalizeSpacing(html: string): string {
  if (!html) return "";
  return html
    .replace(/(<p>(\s|&nbsp;|<br\s*\/?>)*<\/p>\s*){2,}/gi, "<p><br></p>")
    .replace(/^\s+|\s+$/g, "");
}

export function normalizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  return normalizeSpacing(
    convertFontSizesToRem(normalizeRichTextSpaces(sanitizeRichText(html)))
  );
}

export function richTextToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeRichText(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
