/**
 * Uploaded SVGs are reduced to a viewBox plus a list of path `d` strings.
 * Nothing else from the source file is kept, so scripts, external references
 * and styling tricks cannot survive the import.
 *
 * A drawing rarely uses `<path>` alone: an editor writes a plain circle out as
 * `<circle>` or `<ellipse>`, a box as `<rect>`, a polygon as `<polygon>`. Those
 * are geometry rather than styling, so each is converted to the `d` that draws
 * the same outline instead of being dropped — dropping them loses whole parts
 * of a shape (the dots off an icon, the eyes off a face) while the import
 * still reports success.
 */

export type SanitizedShape = {
  viewBox: string;
  paths: string[];
};

const VIEWBOX_RE = /viewBox\s*=\s*["']([\d.\-\s]+)["']/i;
/** Every element that carries a fillable outline, in the order they are drawn. */
const SHAPE_TAG_RE = /<(path|circle|ellipse|rect|polygon|polyline)\b([^>]*)>/gi;
const SAFE_PATH_RE = /^[MmZzLlHhVvCcSsQqTtAa0-9,.\-\s eE]+$/;

function attr(attrs: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i").exec(attrs);
  return match ? match[1].trim() : null;
}

/**
 * A length attribute as a number. A percentage resolves against the viewport
 * rather than the viewBox, so it is refused rather than guessed at.
 */
function num(attrs: string, name: string): number {
  const raw = attr(attrs, name);
  if (raw === null || raw === "" || raw.includes("%")) return NaN;
  return parseFloat(raw);
}

/** Rounded so the generated `d` reads like handwritten path data. */
function fmt(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** Two half arcs, which is the only way arc commands can close a full one. */
function ellipseToPath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M${fmt(cx - rx)},${fmt(cy)}` +
    `a${fmt(rx)},${fmt(ry)} 0 1,0 ${fmt(rx * 2)},0` +
    `a${fmt(rx)},${fmt(ry)} 0 1,0 ${fmt(-rx * 2)},0Z`
  );
}

function rectToPath(
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number,
  ry: number
): string {
  if (rx <= 0 || ry <= 0) {
    return `M${fmt(x)},${fmt(y)}H${fmt(x + width)}V${fmt(y + height)}H${fmt(x)}Z`;
  }
  // A radius past half the side is clamped, the way a renderer clamps it.
  const cornerX = Math.min(rx, width / 2);
  const cornerY = Math.min(ry, height / 2);
  const arc = `a${fmt(cornerX)},${fmt(cornerY)} 0 0,1`;
  return (
    `M${fmt(x + cornerX)},${fmt(y)}` +
    `H${fmt(x + width - cornerX)}${arc} ${fmt(cornerX)},${fmt(cornerY)}` +
    `V${fmt(y + height - cornerY)}${arc} ${fmt(-cornerX)},${fmt(cornerY)}` +
    `H${fmt(x + cornerX)}${arc} ${fmt(-cornerX)},${fmt(-cornerY)}` +
    `V${fmt(y + cornerY)}${arc} ${fmt(cornerX)},${fmt(-cornerY)}Z`
  );
}

function pointsToPath(points: string | null, close: boolean): string | null {
  if (!points) return null;
  const values = points.trim().split(/[\s,]+/).map(Number);
  // An odd count leaves a coordinate without its pair, and a triangle is the
  // smallest thing worth filling.
  if (values.length < 6 || values.length % 2 !== 0) return null;
  if (values.some((value) => !Number.isFinite(value))) return null;

  const pairs: string[] = [];
  for (let index = 0; index < values.length; index += 2) {
    pairs.push(`${fmt(values[index])},${fmt(values[index + 1])}`);
  }
  // A polyline fills exactly the way a polygon does — a fill closes the
  // subpath either way — so only the explicit close differs.
  return `M${pairs[0]}L${pairs.slice(1).join("L")}${close ? "Z" : ""}`;
}

/** The `d` an element contributes, or null when it draws nothing fillable. */
function elementToPath(tag: string, attrs: string): string | null {
  switch (tag.toLowerCase()) {
    case "path":
      return attr(attrs, "d");

    case "circle": {
      const r = num(attrs, "r");
      if (!Number.isFinite(r) || r <= 0) return null;
      return ellipseToPath(num(attrs, "cx") || 0, num(attrs, "cy") || 0, r, r);
    }

    case "ellipse": {
      // Either radius may be left off, which means "match the other one".
      const rawX = num(attrs, "rx");
      const rawY = num(attrs, "ry");
      const rx = Number.isFinite(rawX) ? rawX : rawY;
      const ry = Number.isFinite(rawY) ? rawY : rawX;
      if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) {
        return null;
      }
      return ellipseToPath(num(attrs, "cx") || 0, num(attrs, "cy") || 0, rx, ry);
    }

    case "rect": {
      const width = num(attrs, "width");
      const height = num(attrs, "height");
      if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
      if (width <= 0 || height <= 0) return null;
      const rawX = num(attrs, "rx");
      const rawY = num(attrs, "ry");
      const rx = Number.isFinite(rawX) ? rawX : Number.isFinite(rawY) ? rawY : 0;
      const ry = Number.isFinite(rawY) ? rawY : rx;
      return rectToPath(
        num(attrs, "x") || 0,
        num(attrs, "y") || 0,
        width,
        height,
        rx,
        ry
      );
    }

    case "polygon":
      return pointsToPath(attr(attrs, "points"), true);

    case "polyline":
      return pointsToPath(attr(attrs, "points"), false);

    default:
      return null;
  }
}

export function sanitizeSvgShape(svg: string): SanitizedShape | null {
  if (!svg || !/<svg[\s>]/i.test(svg)) return null;

  const viewBoxMatch = VIEWBOX_RE.exec(svg);
  const viewBox = viewBoxMatch
    ? viewBoxMatch[1].trim().replace(/\s+/g, " ")
    : "0 0 100 100";

  if (!/^-?[\d.]+ -?[\d.]+ -?[\d.]+ -?[\d.]+$/.test(viewBox)) return null;

  const paths: string[] = [];
  let match: RegExpExecArray | null;
  SHAPE_TAG_RE.lastIndex = 0;
  // Read in document order, so parts drawn over each other keep their
  // stacking whichever element each one was written as.
  while ((match = SHAPE_TAG_RE.exec(svg)) !== null) {
    const d = elementToPath(match[1], match[2])?.trim();
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
