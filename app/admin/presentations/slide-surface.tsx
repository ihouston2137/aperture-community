"use client";
import Image from "next/image";
import { PublicationBlockView, emptyPublicationSources, type PublicationSources } from "@/components/publication-blocks";
export const PresentationSources = createContext<PublicationSources>(emptyPublicationSources);
export const PresentationNavigation = createContext<(id: string) => void>(() => {});

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CustomShapeView, Shape } from "@/components/shape";
import { styleValuesToCss } from "@/lib/style-values";
import { BlockView } from "@/components/page-blocks";
import { emptyPageSources } from "@/lib/page-source-types";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { defaultLine, lineGeometry, slideShadowFilter, type Slide, type SlideObject } from "@/lib/presentation";
export type PresentationShape = {
  name: string;
  slug: string;
  viewBox: string;
  paths: string[];
};
export const PresentationShapes = createContext<PresentationShape[]>([]);
export function Surface({
  slide,
  dimensions,
  editing = false,
  children,
  interactive = false,
  preload = false,
}: {
  slide: Slide;
  dimensions: { width: number; height: number };
  editing?: boolean;
  children?: ReactNode;
  interactive?: boolean;
  preload?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / dimensions.width),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [dimensions.width]);
  return (
    <div
      ref={host}
      className={`deck-surface${editing ? " is-editing" : ""}`}
      style={{
        aspectRatio: `${dimensions.width}/${dimensions.height}`,
        background: slide.background,
      }}
    >
      <div
        className="deck-slide"
        style={{
          width: dimensions.width,
          height: dimensions.height,
          transform: `scale(${scale})`,
        }}
      >
        {slide.publicationBackground && slide.publicationBackground.backgroundType !== "none" && <div className={`pub-bg${slide.publicationBackground.kenBurns ? " is-ken-burns" : ""}`} style={{ background: slide.publicationBackground.backgroundColor }}>
          {slide.publicationBackground.backgroundType === "image" && <Image unoptimized width={dimensions.width} height={dimensions.height} src={protectedMediaUrl(slide.publicationBackground.backgroundMediaUrl)} alt="" style={{ objectFit: slide.publicationBackground.backgroundFit, objectPosition: `${50 + slide.publicationBackground.backgroundOffsetX}% ${50 + slide.publicationBackground.backgroundOffsetY}%` }} />}
          {slide.publicationBackground.backgroundType === "video" && <video src={protectedMediaUrl(slide.publicationBackground.backgroundMediaUrl)} autoPlay={interactive} muted={slide.publicationBackground.videoMuted} loop={slide.publicationBackground.videoLoop} playsInline style={{ objectFit: slide.publicationBackground.backgroundFit }} />}
        </div>}
        {children ??
          slide.objects.map((object) => (
            <div key={object.id} style={objectStyle(object)}>
              <ObjectContent
                object={object}
                playing={interactive}
                preload={preload}
              />
            </div>
          ))}
      </div>
    </div>
  );
}
export function objectStyle(object: SlideObject): React.CSSProperties {
  const hasShapeOutline = object.block?.type === "shape" || object.block?.type === "customShape";
  return {
    position: "absolute",
    left: object.x,
    top: object.y,
    width: object.width,
    height: object.height,
    transform: `rotate(${object.rotation}deg)`,
    filter: slideShadowFilter(object.shadow),
    background: ["rectangle", "ellipse", "text"].includes(object.type)
      ? object.fill
      : undefined,
    borderRadius: hasShapeOutline ? undefined : object.type === "ellipse" ? "50%" : object.borderRadius,
    border: !hasShapeOutline && object.type !== "line" && object.borderWidth
      ? `${object.borderWidth}px solid ${object.borderColor || "#16181d"}`
      : undefined,
    boxSizing: "border-box",
    color: object.color,
    fontSize: object.fontSize,
    fontFamily: object.fontFamily || undefined,
    overflow: object.type === "line" || hasShapeOutline ? "visible" : "hidden",
  };
}
export function shapeHtml(object: SlideObject) {
  return (
    object.html ||
    `<p>${(object.block?.text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`
  );
}
export function SlideShape({
  object,
  children,
}: {
  object: SlideObject;
  children?: ReactNode;
}) {
  const block = object.block!;
  const shapes = useContext(PresentationShapes);
  const Component = block.type === "customShape" ? CustomShapeView : Shape;
  return (
    <Component
      shape={shapes.find((s) => s.slug === block.shapeSlug)}
      kind={block.shapeKind ?? "rectangle"}
      width={object.width / 16}
      height={object.height / 16}
      color={block.color || "#3b82f6"}
      borderWidth={block.borderWidth}
      borderColor={block.borderColor}
      radius={block.radius}
      strokeWidth={block.strokeWidth}
      text={
        children ?? (
          <div
            className="deck-shape-label"
            dangerouslySetInnerHTML={{ __html: shapeHtml(object) }}
          />
        )
      }
      textStyle={{
        fontSize: object.fontSize,
    fontFamily: object.fontFamily || undefined,
        color: object.color,
        ...styleValuesToCss(block.shapeTextStyle),
      }}
    />
  );
}
export function ObjectContent({
  object,
  playing = false,
  preload = false,
  onImageLoad,
}: {
  object: SlideObject;
  playing?: boolean;
  preload?: boolean;
  onImageLoad?: (ratio: number) => void;
}) {
  const sources = useContext(PresentationSources);
  const navigate = useContext(PresentationNavigation);
  if (object.publication) return <div className="deck-publication-block" style={{ width: "100%", height: "100%", fontSize: "1rem" }}><PublicationBlockView
    block={{ ...object.publication, width: object.width, height: object.height }} sources={sources} interactive={playing} onNavigate={navigate} /></div>;
  if (object.type === "line") return <SlideLine object={object} />;
  if (object.block?.type === "shape" || object.block?.type === "customShape")
    return <SlideShape object={object} />;
  if (object.type === "block" && object.block) {
    const block = {
      ...object.block,
      id: object.id,
      width: object.width / 16,
      height: object.height / 16,
      iconSize: Math.min(object.width, object.height) / 16,
      newTab: true,
    };
    if (
      block.href &&
      !/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(block.href)
    )
      block.href = "";
    return (
      <div
        className="deck-shared-block"
        style={{ pointerEvents: playing ? "auto" : "none" }}
      >
        <BlockView
          block={block}
          sources={emptyPageSources}
          interactive={playing}
        />
      </div>
    );
  }
  if (object.type === "text")
    return (
      <div
        className="deck-text rich-text"
        dangerouslySetInnerHTML={{ __html: object.html }}
      />
    );
  if (object.type === "image")
    return object.mediaUrl ? (
      <Image
        src={protectedMediaUrl(object.mediaUrl)}
        alt={object.alt}
        width={object.width}
        height={object.height}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight)
            onImageLoad?.(img.naturalWidth / img.naturalHeight);
        }}
        style={{ objectFit: object.imageFit || "contain" }}
        loading={preload ? "eager" : undefined}
        unoptimized
        draggable={false}
      />
    ) : (
      <div className="deck-media-placeholder">Select image</div>
    );
  if (object.type === "video")
    return object.mediaUrl ? (
      <video
        src={protectedMediaUrl(object.mediaUrl)}
        controls={playing}
        preload="metadata"
      />
    ) : (
      <div className="deck-media-placeholder">Select video</div>
    );
  return null;
}

export function SlideLine({ object }: { object: SlideObject }) {
  const line = object.line ?? defaultLine();
  const geometry = lineGeometry(object);
  const size = Math.max(8, line.strokeWidth * 3);
  const startInset = line.startCap === "arrow" ? size : 0;
  const endInset = line.endCap === "arrow" ? size : 0;
  const shaftLength = geometry.length - startInset - endInset;
  return (
    <svg className="deck-line" width={object.width} height={object.height} style={{ overflow: "visible" }} aria-label="Line">
      <path className="deck-line-hit" d={geometry.path} fill="none" stroke="transparent" strokeWidth={Math.max(16, line.strokeWidth + 10)} />
      {(shaftLength > 0 || (!startInset && !endInset)) && <path
        d={geometry.path} fill="none" stroke={object.color} strokeWidth={line.strokeWidth} strokeLinecap="round"
        // Keep the original curve and endpoint positions, but end the shaft at
        // each arrow's base. Its round cap overlaps the arrow without passing its tip.
        pathLength={1}
        strokeDasharray={startInset || endInset ? `${shaftLength / geometry.length} 1` : undefined}
        strokeDashoffset={startInset ? -startInset / geometry.length : undefined}
      />}
      {(["start", "end"] as const).map((end) => {
        const point = geometry[end], cap = line[end === "start" ? "startCap" : "endCap"];
        if (cap === "none") return null;
        return cap === "dot" ? (
          <circle key={end} cx={point.x} cy={point.y} r={size / 2} fill={object.color} />
        ) : (
          <polygon key={end} points={`0,0 ${-size},${size / 2} ${-size},${-size / 2}`} fill={object.color} transform={`translate(${point.x} ${point.y}) rotate(${geometry[end === "start" ? "startAngle" : "endAngle"] * 180 / Math.PI})`} />
        );
      })}
    </svg>
  );
}
