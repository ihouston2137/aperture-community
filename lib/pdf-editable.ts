import type { PDFPageProxy, PDFOperatorList, TextContent } from "pdfjs-dist/types/src/display/api";
import { newSlideBlock, type SlideObject } from "./presentation";

type Matrix = number[];
type State = { matrix: Matrix; fill: string; stroke: string; width: number; fillAlpha: number; strokeAlpha: number; font: string; textMode: number; cap: number; join: number; miter: number; dash: boolean };
export type EditablePdfObject = { object: SlideObject; png?: Buffer; pixelWidth?: number; pixelHeight?: number };
export type EditablePdfPage = { objects: EditablePdfObject[]; warnings: string[]; fallbackReason?: string };
class UnsupportedPdfFeature extends Error {}
const unsupported = (reason: string): never => { throw new UnsupportedPdfFeature(reason); };
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
const point = (m: Matrix, x: number, y: number) => ({ x: m[0]*x+m[2]*y+m[4], y: m[1]*x+m[3]*y+m[5] });
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const compact = (text: string) => text.normalize("NFKC").replace(/\s/g, "");
const color = (value: string, alpha: number) => {
  if (value === "transparent") return value;
  if (!/^#[\da-f]{6}$/i.test(value)) return unsupported("Pattern or non-solid colors");
  return `rgba(${parseInt(value.slice(1,3),16)},${parseInt(value.slice(3,5),16)},${parseInt(value.slice(5,7),16)},${alpha})`;
};

/** Capture before rendering: PDF.js replaces numeric paths with native Path2D objects. */
export async function captureEditablePdf(page: PDFPageProxy) {
  const operators = await page.getOperatorList();
  if (operators.fnArray.length > 30000) return null;
  return { operators: structuredClone(operators), text: await page.getTextContent() };
}

/** Conservative conversion: unsupported painting falls back as an entire page. */
export async function convertEditablePdf(page: PDFPageProxy, captured: { operators: PDFOperatorList; text: TextContent } | null, viewport: { transform: number[]; width: number; height: number }, signal?: AbortSignal): Promise<EditablePdfPage> {
  try {
    if (!captured) return unsupported("Page is too complex for editable conversion");
    const { OPS, ImageKind } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas, ImageData } = await import("@napi-rs/canvas");
    const { operators, text } = captured;
    let state: State = { matrix: [...viewport.transform], fill: "#000000", stroke: "#000000", width: 1, fillAlpha: 1, strokeAlpha: 1, font: "", textMode: 0, cap: 0, join: 0, miter: 10, dash: false };
    const stack: State[] = [];
    const entries: (EditablePdfObject & { order: number })[] = [];
    const characters: { char: string; color: string; font: string; order: number }[] = [];
    const warnings = new Set<string>();
    let imageBytes = 0;
    const add = (entry: EditablePdfObject, order: number) => {
      if (entries.length >= 100) unsupported("Page exceeds the builder's 100-block limit");
      const o = entry.object;
      if (![o.x, o.y, o.width, o.height, o.fontSize, o.rotation].every(Number.isFinite) || Math.abs(o.x) > 32000 || Math.abs(o.y) > 32000 || o.width > 32000 || o.height > 32000)
        unsupported("Unsupported object dimensions");
      entries.push({ ...entry, order });
    };
    const plainOps = new Set<number>([OPS.dependency, OPS.beginText, OPS.endText, OPS.setCharSpacing, OPS.setWordSpacing, OPS.setHScale, OPS.setLeading, OPS.setTextRise, OPS.moveText, OPS.setLeadingMoveText, OPS.setTextMatrix, OPS.nextLine, OPS.setRenderingIntent, OPS.setFlatness, OPS.markPoint, OPS.markPointProps, OPS.beginMarkedContent, OPS.endMarkedContent, OPS.beginCompat, OPS.endCompat]);
    for (let index = 0; index < operators.fnArray.length; index++) {
      signal?.throwIfAborted();
      const op = operators.fnArray[index], args = operators.argsArray[index] ?? [];
      if (plainOps.has(op)) continue;
      if (op === OPS.save) { stack.push(structuredClone(state)); continue; }
      if (op === OPS.restore) { state = stack.pop() ?? unsupported("Unbalanced graphics state"); continue; }
      if (op === OPS.transform) { state.matrix = multiply(state.matrix, args); continue; }
      if (op === OPS.setFillRGBColor) { state.fill = args[0]; continue; }
      if (op === OPS.setStrokeRGBColor) { state.stroke = args[0]; continue; }
      if (op === OPS.setFillTransparent) { state.fill = "transparent"; continue; }
      if (op === OPS.setStrokeTransparent) { state.stroke = "transparent"; continue; }
      if (op === OPS.setLineWidth) { state.width = args[0]; continue; }
      if (op === OPS.setLineCap) { state.cap = args[0]; continue; }
      if (op === OPS.setLineJoin) { state.join = args[0]; continue; }
      if (op === OPS.setMiterLimit) { state.miter = args[0]; continue; }
      if (op === OPS.setDash) { state.dash = args[0].length > 0; continue; }
      if (op === OPS.setFont) { state.font = args[0]; continue; }
      if (op === OPS.setTextRenderingMode) { state.textMode = args[0]; continue; }
      if (op === OPS.setGState) {
        for (const [key, value] of args[0]) {
          if (key === "ca") state.fillAlpha = value;
          else if (key === "CA") state.strokeAlpha = value;
          else if (key === "LW") state.width = value;
          else if (key === "LC") state.cap = value;
          else if (key === "LJ") state.join = value;
          else if (key === "ML") state.miter = value;
          else if (key === "D") state.dash = value[0].length > 0;
          else if (key === "Font") state.font = value[0];
          else if ((key === "BM" && value === "source-over") || (key === "SMask" && !value)) continue;
          else unsupported("Transparency masks, blend modes, or transfer effects");
        }
        continue;
      }
      if (op === OPS.showText) {
        if (state.textMode !== 0) unsupported("Outlined, clipped, or invisible text");
        for (const glyph of args[0]) {
          if (typeof glyph === "number") continue;
          for (const char of compact(glyph.unicode ?? "")) characters.push({ char, color: color(state.fill, state.fillAlpha), font: state.font, order: index });
          if (characters.length > 100000) unsupported("Page contains too much text for editable conversion");
        }
        continue;
      }
      if (op === OPS.constructPath) {
        const [paint, paths] = args;
        if (![OPS.fill, OPS.eoFill, OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint)) unsupported("Clipping paths");
        const raw = paths[0];
        if (!ArrayBuffer.isView(raw) && !Array.isArray(raw)) unsupported("Unsupported vector path");
        const values = Array.from(raw as ArrayLike<number>);
        if (values.length > 12000) unsupported("Vector path is too complex");
        const commands: { op: string; points: { x: number; y: number }[] }[] = [];
        const all: { x: number; y: number }[] = [];
        for (let i = 0; i < values.length;) {
          const command = values[i++];
          const count = command === 0 || command === 1 ? 1 : command === 2 ? 3 : command === 3 ? 2 : command === 4 ? 0 : unsupported("Unsupported vector command");
          const points = [];
          for (let n = 0; n < count; n++) { const p = point(state.matrix, values[i++], values[i++]); points.push(p); all.push(p); }
          commands.push({ op: ["M", "L", "C", "Q", "Z"][command], points });
        }
        if (!all.length) continue;
        if (all.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) unsupported("Invalid vector coordinates");
        const x = Math.min(...all.map(p => p.x)), y = Math.min(...all.map(p => p.y));
        const width = Math.max(1, Math.max(...all.map(p => p.x)) - x), height = Math.max(1, Math.max(...all.map(p => p.y)) - y);
        let d = commands.map(c => c.op + c.points.map(p => `${+(p.x-x).toFixed(4)} ${+(p.y-y).toFixed(4)}`).join(" ")).join(" ");
        if ([OPS.closeStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint)) d += " Z";
        if (d.length > 100000) unsupported("Vector path is too complex");
        const fill = ![OPS.stroke, OPS.closeStroke].includes(paint);
        const stroke = ![OPS.fill, OPS.eoFill].includes(paint);
        const sx = Math.hypot(state.matrix[0],state.matrix[1]), sy = Math.hypot(state.matrix[2],state.matrix[3]);
        if (stroke && (state.dash || Math.abs(sx-sy) > 0.01 || Math.abs(state.matrix[0]*state.matrix[2]+state.matrix[1]*state.matrix[3]) > 0.01)) unsupported("Dashed or distorted vector strokes");
        const strokeWidth = state.width * sx;
        if (stroke && (strokeWidth <= 0 || strokeWidth > 800)) unsupported("Unsupported stroke width");
        const object = newSlideBlock("customShape");
        object.x = x; object.y = y; object.width = width; object.height = height;
        object.block = { ...object.block!, color: fill ? color(state.fill, state.fillAlpha) : "transparent", borderColor: color(state.stroke, state.strokeAlpha), borderWidth: stroke ? strokeWidth / 16 : 0 };
        object.vectorPath = { d, viewBox: `0 0 ${width.toFixed(4)} ${height.toFixed(4)}`, fillRule: [OPS.eoFill, OPS.eoFillStroke, OPS.closeEOFillStroke].includes(paint) ? "evenodd" : "nonzero", lineCap: (["butt", "round", "square"] as const)[state.cap] ?? "butt", lineJoin: (["miter", "round", "bevel"] as const)[state.join] ?? "miter", miterLimit: state.miter };
        add({ object }, index);
        continue;
      }
      if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject) {
        if (state.fillAlpha !== 1) unsupported("Image transparency effects");
        const image = op === OPS.paintInlineImageXObject ? args[0] : (args[0].startsWith("g_") ? page.commonObjs : page.objs).get(args[0]);
        const m = state.matrix;
        // Unit PDF image coordinates point up; image pixel coordinates point down.
        if (Math.abs(m[1]) > 0.001 || Math.abs(m[2]) > 0.001 || m[0] <= 0 || m[3] >= 0) unsupported("Rotated, mirrored, or skewed images");
        if (!image?.data || image.width * image.height > 16000000) unsupported("Image data is unavailable or too large");
        const rgba = new Uint8ClampedArray(image.width * image.height * 4);
        if (image.kind === ImageKind.RGBA_32BPP) rgba.set(image.data);
        else if (image.kind === ImageKind.RGB_24BPP) {
          for (let i = 0, p = 0; i < rgba.length; i += 4, p += 3) { rgba[i] = image.data[p]; rgba[i+1] = image.data[p+1]; rgba[i+2] = image.data[p+2]; rgba[i+3] = 255; }
        } else if (image.kind === ImageKind.GRAYSCALE_1BPP) {
          const stride = Math.ceil(image.width / 8);
          for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
            const i = (y*image.width+x)*4, value = image.data[y*stride+(x>>3)] & (128>>(x&7)) ? 255 : 0;
            rgba[i] = rgba[i+1] = rgba[i+2] = value; rgba[i+3] = 255;
          }
        } else unsupported("Unsupported image format");
        const canvas = createCanvas(image.width, image.height);
        try {
          canvas.getContext("2d").putImageData(new ImageData(rgba, image.width, image.height), 0, 0);
          const object = { ...newSlideBlock("image"), x: m[4], y: m[5]+m[3], width: m[0], height: -m[3], imageFit: "contain" as const, imageRatio: m[0]/-m[3], alt: "Imported PDF image" };
          // Contain image blocks cannot reproduce intentional image stretching.
          if (Math.abs(image.width/image.height-object.imageRatio) > 0.01) unsupported("Stretched images");
          const png = await canvas.encode("png");
          imageBytes += png.length;
          if (imageBytes > 50 * 1024 * 1024) unsupported("Extracted images exceed the per-page storage limit");
          add({ object, png, pixelWidth: image.width, pixelHeight: image.height }, index);
        } finally { canvas.width = canvas.height = 1; }
        continue;
      }
      const reason = new Map<number, string>([
        [OPS.clip, "Clipping paths"], [OPS.eoClip, "Clipping paths"],
        [OPS.paintFormXObjectBegin, "Embedded graphics with their own clipping area"],
        [OPS.beginGroup, "Transparency groups"],
        [OPS.shadingFill, "Gradient or shaded fills"],
        [OPS.setFillColorN, "Pattern fills"], [OPS.setStrokeColorN, "Pattern strokes"],
        [OPS.paintImageMaskXObject, "Image masks"], [OPS.paintImageMaskXObjectGroup, "Image masks"],
        [OPS.beginAnnotation, "Annotations or form fields"],
        [OPS.beginMarkedContentProps, "Optional layers or marked content"],
      ]).get(op);
      unsupported(reason ?? "Graphics effects not supported by editable conversion");
    }
    let cursor = 0;
    for (const item of text.items) {
      if (!("str" in item) || !compact(item.str)) continue;
      const chars = Array.from(compact(item.str));
      const styles = characters.slice(cursor, cursor + chars.length);
      if (styles.length !== chars.length || styles.some((s, i) => s.char !== chars[i])) unsupported("Text order could not be matched reliably");
      cursor += chars.length;
      const first = styles[0];
      if (styles.some(s => s.color !== first.color || s.font !== first.font)) unsupported("Mixed styles inside a text run");
      if (entries.some(e => e.order > first.order && e.order < styles.at(-1)!.order)) unsupported("Interleaved text and artwork");
      const font = page.commonObjs.get(item.fontName);
      const metrics = text.styles[item.fontName];
      if (metrics.vertical || item.dir !== "ltr" || font?.isType3Font) unsupported("Vertical, right-to-left, or Type 3 text");
      const m = multiply(viewport.transform, item.transform);
      const fontSize = Math.hypot(m[2], m[3]), horizontal = Math.hypot(m[0], m[1]);
      if (fontSize < 1 || fontSize > 512 || horizontal === 0 || Math.abs(m[0]*m[2]+m[1]*m[3]) > 0.01 || m[0]*m[3]-m[1]*m[2] >= 0) unsupported("Skewed, mirrored, or oversized text");
      const name = String(font?.name ?? metrics.fontFamily);
      const family = /courier|mono/i.test(name) ? "Courier New" : /times|serif/i.test(name) && !/sans/i.test(name) ? "Times New Roman" : "Arial";
      const weight = /bold|black|heavy/i.test(name) ? "bold" : "normal";
      const italic = /italic|oblique/i.test(name) ? "italic" : "normal";
      const width = Math.max(1, item.width * Math.hypot(viewport.transform[0], viewport.transform[1]) + fontSize * 0.15);
      const height = fontSize * 1.3;
      const angle = Math.atan2(m[1],m[0]), cos = Math.cos(angle), sin = Math.sin(angle);
      const left = m[4] + sin*fontSize, top = m[5] - cos*fontSize;
      const object = { ...newSlideBlock("richText"), x: left+(cos*width-sin*height)/2-width/2, y: top+(sin*width+cos*height)/2-height/2,
        width, height, rotation: angle*180/Math.PI, fontSize, fontFamily: family, color: first.color,
        html: `<p style="margin:0;line-height:1.3;white-space:pre;font-weight:${weight};font-style:${italic}">${escape(item.str)}</p>` };
      warnings.add("Text uses substitute browser fonts; review line lengths and spacing.");
      add({ object }, first.order);
    }
    if (cursor !== characters.length) unsupported("Some PDF text could not be extracted");
    if (!entries.length) unsupported("No editable content was found (OCR is not supported)");
    if (entries.every(entry => entry.object.type === "image")) warnings.add("This page contains only images. Scanned text remains inside its image; OCR is not supported.");
    entries.sort((a,b) => a.order-b.order);
    return { objects: entries.map(({ order: _order, ...entry }) => entry), warnings: [...warnings] };
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof UnsupportedPdfFeature)) console.warn("Editable PDF conversion fell back", error);
    return { objects: [], warnings: [], fallbackReason: error instanceof UnsupportedPdfFeature ? error.message : "Page conversion could not be completed reliably" };
  }
}
