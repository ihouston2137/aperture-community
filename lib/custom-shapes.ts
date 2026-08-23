/**
 * Uploaded SVGs are reduced to a viewBox plus a list of path `d` strings.
 * Nothing else from the source file is kept, so scripts, external references
 * and styling tricks cannot survive the import.
 */

export type SanitizedShape = {
  viewBox: string;
  paths: string[];
};

const VIEWBOX_RE = /viewBox\s*=\s*["']([\d.\-\s]+)["']/i;
const PATH_D_RE = /<path\b[^>]*\bd\s*=\s*["']([^"']+)["'][^>]*>/gi;
const SAFE_PATH_RE = /^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s eE]+$/;

export function sanitizeSvgShape(svg: string): SanitizedShape | null {
  if (!svg || !/<svg[\s>]/i.test(svg)) return null;

  const viewBoxMatch = VIEWBOX_RE.exec(svg);
  const viewBox = viewBoxMatch
    ? viewBoxMatch[1].trim().replace(/\s+/g, " ")
    : "0 0 100 100";

  if (!/^-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/.test(viewBox)) return null;

  const paths: string[] = [];
  let match: RegExpExecArray | null;
  PATH_D_RE.lastIndex = 0;
  while ((match = PATH_D_RE.exec(svg)) !== null) {
    const d = match[1].trim();
    if (d && SAFE_PATH_RE.test(d) && d.length < 100_000) paths.push(d);
    if (paths.length >= 64) break;
  }

  if (paths.length === 0) return null;
  return { viewBox, paths };
}

export function shapeToSvgMarkup(
  shape: SanitizedShape,
  fill: string,
  className?: string
): string {
  const body = shape.paths
    .map((d) => `<path d="${d}" fill="${fill}" />`)
    .join("");
  return `<svg viewBox="${shape.viewBox}" xmlns="http://www.w3.org/2000/svg"${
    className ? ` class="${className}"` : ""
  } preserveAspectRatio="none">${body}</svg>`;
}
