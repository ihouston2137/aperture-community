import { normalizeSlideShadow, type SlideObject } from "./presentation";

const isShape = (object: SlideObject) => ["shape", "customShape"].includes(object.block?.type || object.publication?.type || "");

/** A detached clipboard snapshot. Content and geometry are never pasted. */
export function copyBlockStyles(object: SlideObject): SlideObject {
  return structuredClone(object);
}

export function pasteBlockStyles(target: SlideObject, source: SlideObject): SlideObject {
  const block = source.block;
  const publication = source.publication;
  const shape = isShape(source);
  const fill = shape ? publication?.shapeStyle?.backgroundColor || publication?.color || block?.color || source.fill : source.fill;
  const borderWidth = shape ? (publication?.shapeStyle?.borderWidth ?? block?.borderWidth ?? 0) * 16 : source.borderWidth;
  const borderColor = shape ? publication?.shapeStyle?.borderColor || block?.borderColor : source.borderColor;
  const radius = shape ? (publication?.shapeStyle?.borderRadius ?? block?.radius ?? 0) * 16 : source.borderRadius;
  const textStyle = publication?.textStyle || (shape ? block?.shapeTextStyle : block?.textStyle);
  const color = textStyle?.color || source.color;
  const fontSize = textStyle?.fontSize !== undefined ? textStyle.fontSize * 16 : source.fontSize;
  const fontFamily = textStyle?.fontFamily ?? source.fontFamily;
  const result: SlideObject = {
    ...target, fill, color, fontSize, fontFamily, borderWidth, borderColor,
    borderRadius: radius, shadow: normalizeSlideShadow(source.shadow),
  };
  const typography = { ...textStyle, color, fontSize: fontSize / 16, fontFamily };
  if (target.block) result.block = {
    ...target.block,
    styleSlug: block?.styleSlug ?? publication?.styleSlug,
    textStyle: typography,
    color: shape ? fill : block?.color ?? publication?.color ?? color,
    borderWidth: (borderWidth || 0) / 16, borderColor, radius: (radius || 0) / 16,
    ...(isShape(target) ? {
      shapeTextStyle: typography, shapeTextStyleSlug: block?.shapeTextStyleSlug,
      strokeWidth: block?.strokeWidth,
    } : {}),
  };
  if (target.publication) result.publication = {
    ...target.publication,
    styleSlug: publication?.styleSlug ?? block?.styleSlug,
    textStyle: typography,
    color: shape ? fill : publication?.color ?? block?.color ?? color,
    radius: (radius || 0) / 16,
    ...(isShape(target) ? { shapeStyle: {
      ...publication?.shapeStyle, backgroundColor: fill,
      borderWidth: (borderWidth || 0) / 16, borderColor, borderRadius: (radius || 0) / 16,
    } } : {}),
  };
  if (target.line && source.line) result.line = {
    ...target.line, strokeWidth: source.line.strokeWidth,
    startCap: source.line.startCap, endCap: source.line.endCap,
  };
  if (result.publication?.table && publication?.table) {
    const table = publication.table;
    result.publication.table = {
      ...result.publication.table,
      accentColor: table.accentColor, tableStyle: table.tableStyle,
      cellStyle: table.cellStyle, headerStyle: table.headerStyle,
      bandedRows: table.bandedRows,
    };
  }
  return structuredClone(result);
}
