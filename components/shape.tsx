"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

import { REM_BASE as REM_IN_PX } from "@/lib/rich-text";
import type { ShapeKind } from "@/lib/page-layout";

/**
 * A five-pointed star on the same 0–100 grid: ten vertices alternating between
 * an outer and an inner radius, starting at the top.
 */
const STAR_POINTS = Array.from({ length: 10 }, (_, index) => {
  const radius = index % 2 === 0 ? 50 : 20;
  const angle = ((-90 + index * 36) * Math.PI) / 180;
  const x = 50 + radius * Math.cos(angle);
  const y = 50 + radius * Math.sin(angle);
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}).join(" ");

/**
 * The silhouette a shape's text is clipped to, as a CSS `clip-path`.
 *
 * The SVG draws on a 0–100 grid stretched over the whole box, so every
 * percentage here lands on the same point the drawing does — the clip and the
 * outline are the same edge, and a word can never hang off the side of a
 * triangle.
 *
 * A `line` is excluded: it has no interior, so clipping to it would erase the
 * text entirely rather than constrain it.
 */
function shapeClipPath(kind: ShapeKind, radius: number, width: number): string | undefined {
  switch (kind) {
    case "rectangle":
      return radius > 0 ? `inset(0 round ${radius}rem)` : "inset(0)";
    case "ellipse":
      return "ellipse(50% 50% at 50% 50%)";
    case "triangle":
      return "polygon(50% 0%, 100% 100%, 0% 100%)";
    case "star":
      return `polygon(${STAR_POINTS.split(" ")
        .map((point) => point.replace(",", "% ") + "%")
        .join(", ")})`;
    case "trapezoid":
      return "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)";
    case "rhombus":
      return "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    case "parallelogram":
      return "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)";
    default:
      return undefined;
  }
}

/**
 * The box text is laid into, inset from the shape's own box so a line of it
 * starts inside the outline rather than at a corner the shape does not fill.
 *
 * Roughly the largest rectangle each silhouette contains. It only decides where
 * the text starts wrapping — the clip above is what actually holds it in — so
 * spacing set in the style editor can push against these freely.
 */
const SHAPE_TEXT_INSET: Record<ShapeKind, [number, number, number, number]> = {
  // top, right, bottom, left, as percentages of the shape's box.
  rectangle: [0, 0, 0, 0],
  ellipse: [15, 15, 15, 15],
  // A triangle is widest at its base, so its text box sits low in it.
  triangle: [52, 26, 3, 26],
  star: [36, 32, 32, 32],
  trapezoid: [4, 22, 4, 22],
  rhombus: [28, 28, 28, 28],
  parallelogram: [3, 27, 3, 27],
  line: [0, 0, 0, 0],
};

/** A custom shape's outline is unknown, so its text starts modestly inside it. */
const CUSTOM_SHAPE_TEXT_INSET: [number, number, number, number] = [12, 12, 12, 12];

function insetStyle([top, right, bottom, left]: [number, number, number, number]): CSSProperties {
  return { top: `${top}%`, right: `${right}%`, bottom: `${bottom}%`, left: `${left}%` };
}

export type ShapeTextProps = {
  /** Laid inside the shape and clipped to it. Nothing renders when empty. */
  text?: ReactNode;
  textClassName?: string;
  textStyle?: CSSProperties;
};

/**
 * The text layer over a shape: clipped to the silhouette, laid into the box the
 * silhouette contains.
 */
function ShapeText({
  clipPath,
  inset,
  text,
  textClassName,
  textStyle,
}: ShapeTextProps & {
  clipPath: string | undefined;
  inset: [number, number, number, number];
}) {
  return (
    <span className="pb-shape-clip" style={{ clipPath }}>
      <span
        className={`pb-shape-text${textClassName ? ` ${textClassName}` : ""}`}
        style={{ ...insetStyle(inset), ...textStyle }}
      >
        {text}
      </span>
    </span>
  );
}

/** Whether a text node has anything in it worth drawing a layer for. */
function hasText(text: ReactNode): boolean {
  return typeof text === "string" ? text.trim() !== "" : Boolean(text);
}

/**
 * Rectangle and ellipse render as filled SVG areas with explicit width and
 * height — never as a border-only element that collapses to a hairline.
 */
export function Shape({
  kind,
  color,
  width,
  height,
  radius = 0,
  strokeWidth = 0.125,
  borderWidth = 0,
  borderColor = "#000000",
  className,
  style: boxStyle,
  text,
  textClassName,
  textStyle,
}: {
  kind: ShapeKind;
  color: string;
  width: number;
  height: number;
  radius?: number;
  /** Thickness of the `line` shape itself, in rem. */
  strokeWidth?: number;
  /** Outline drawn around a filled shape, in rem. */
  borderWidth?: number;
  borderColor?: string;
  /** The shape's own box, dressed by the style editor. */
  className?: string;
  style?: CSSProperties;
} & ShapeTextProps) {
  // The size comes first so a style cannot quietly take the shape's dimensions
  // away from it, but everything else the editor sets wins.
  const style = { width: `${width}rem`, height: `${height}rem`, ...boxStyle };

  // `non-scaling-stroke` keeps the outline even despite the non-uniform
  // viewBox scaling, which also makes the width resolve in CSS pixels.
  const border =
    borderWidth > 0
      ? {
          stroke: borderColor,
          strokeWidth: borderWidth * REM_IN_PX,
          vectorEffect: "non-scaling-stroke" as const,
        }
      : undefined;

  return (
    <div className={`pb-shape${className ? ` ${className}` : ""}`} style={style}>
      {/* Visible overflow so a centred stroke is not clipped at the edges. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ overflow: "visible" }}
      >
        {kind === "rectangle" ? (
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            rx={radius > 0 ? Math.min(50, (radius / width) * 100) : 0}
            fill={color}
            {...border}
          />
        ) : null}
        {kind === "ellipse" ? (
          <ellipse cx="50" cy="50" rx="50" ry="50" fill={color} {...border} />
        ) : null}
        {kind === "triangle" ? (
          <polygon points="50,0 100,100 0,100" fill={color} {...border} />
        ) : null}
        {/* Points are on a 0–100 grid and stretch with the box, the same way
            the other shapes do, so each keeps the block's aspect. */}
        {kind === "star" ? (
          <polygon points={STAR_POINTS} fill={color} {...border} />
        ) : null}
        {kind === "trapezoid" ? (
          <polygon points="20,0 80,0 100,100 0,100" fill={color} {...border} />
        ) : null}
        {kind === "rhombus" ? (
          <polygon points="50,0 100,50 50,100 0,50" fill={color} {...border} />
        ) : null}
        {kind === "parallelogram" ? (
          <polygon points="25,0 100,0 75,100 0,100" fill={color} {...border} />
        ) : null}
        {kind === "line" ? (
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke={color}
            strokeWidth={Math.max(1, (strokeWidth / height) * 100)}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>

      {hasText(text) ? (
        <ShapeText
          clipPath={shapeClipPath(kind, radius, width)}
          inset={SHAPE_TEXT_INSET[kind]}
          text={text}
          textClassName={textClassName}
          textStyle={textStyle}
        />
      ) : null}
    </div>
  );
}

/** `"0 0 24 24"` → the transform that maps it onto the unit box a clip needs. */
function viewBoxToUnitTransform(viewBox: string): string | undefined {
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined;
  const [minX, minY, boxWidth, boxHeight] = parts;
  if (boxWidth <= 0 || boxHeight <= 0) return undefined;
  return `scale(${1 / boxWidth} ${1 / boxHeight}) translate(${-minX} ${-minY})`;
}

export function CustomShapeView({
  shape,
  color,
  width,
  height,
  borderWidth = 0,
  borderColor = "#000000",
  className,
  style: boxStyle,
  text,
  textClassName,
  textStyle,
}: {
  shape: { viewBox: string; paths: string[] } | undefined;
  color: string;
  width: number;
  height: number;
  borderWidth?: number;
  borderColor?: string;
  className?: string;
  style?: CSSProperties;
} & ShapeTextProps) {
  // Hooks run before the early return, so the id is stable whether or not a
  // shape has been picked yet.
  const rawId = useId();

  if (!shape) {
    return <div className="pb-empty-drop">No shape selected</div>;
  }

  const border =
    borderWidth > 0
      ? {
          stroke: borderColor,
          strokeWidth: borderWidth * REM_IN_PX,
          vectorEffect: "non-scaling-stroke" as const,
        }
      : undefined;

  // `useId` emits colons, which a `url(#…)` reference cannot carry.
  const clipId = `${rawId.replace(/[^a-zA-Z0-9_-]/g, "-")}-shape-clip`;

  /*
   * An arbitrary path has no `clip-path` shorthand, so the clip is declared in
   * the SVG instead. `objectBoundingBox` units make it follow the box the way
   * `preserveAspectRatio="none"` makes the drawing follow it, so the two agree
   * at every size — the transform is only what carries the viewBox's own
   * coordinates into that unit square.
   */
  const unitTransform = hasText(text) ? viewBoxToUnitTransform(shape.viewBox) : undefined;

  return (
    <div
      className={`pb-shape${className ? ` ${className}` : ""}`}
      style={{ width: `${width}rem`, height: `${height}rem`, ...boxStyle }}
    >
      <svg
        viewBox={shape.viewBox}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ overflow: "visible" }}
      >
        {unitTransform ? (
          <defs>
            <clipPath id={clipId} clipPathUnits="objectBoundingBox">
              {shape.paths.map((d, index) => (
                <path key={index} d={d} transform={unitTransform} />
              ))}
            </clipPath>
          </defs>
        ) : null}
        {shape.paths.map((d, index) => (
          <path key={index} d={d} fill={color} {...border} />
        ))}
      </svg>

      {hasText(text) ? (
        <ShapeText
          clipPath={unitTransform ? `url(#${clipId})` : undefined}
          inset={CUSTOM_SHAPE_TEXT_INSET}
          text={text}
          textClassName={textClassName}
          textStyle={textStyle}
        />
      ) : null}
    </div>
  );
}
