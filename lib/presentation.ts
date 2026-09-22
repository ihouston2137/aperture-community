import { normalizePublicationBlock, normalizeBackground, type PublicationBlock, type PublicationBackground } from "./publication-layout";
import {
  createBlock,
  normalizeBlock,
  type PageBlock,
  type PageBlockType,
} from "./page-layout";
import { normalizeRichText } from "./rich-text";
import { sanitizeMediaPath } from "./protected-media-url";
export type SlideObject = {
  id: string;
  shadow?: SlideShadow;
  publication?: PublicationBlock;
  type: "publication" | "text" | "image" | "video" | "rectangle" | "ellipse" | "block" | "line";
  line?: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    startCap: "none" | "arrow" | "dot";
    endCap: "none" | "arrow" | "dot";
    curved: boolean;
    strokeWidth: number;
  };
  block?: PageBlock;
  locked?: boolean;
  aspectLocked?: boolean;
  groupId?: string;
  imageFit?: "contain" | "cover";
  imageRatio?: number;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  html: string;
  mediaUrl: string;
  mediaId: string;
  fill: string;
  color: string;
  fontSize: number;
  fontFamily?: string;
  rotation: number;
  alt: string;
};

export type SlideShadow = {
  enabled: boolean;
  x: number;
  y: number;
  blur: number;
  color: string;
};

export function normalizeSlideShadow(input?: Partial<SlideShadow>): SlideShadow {
  return {
    enabled: input?.enabled === true,
    x: number(input?.x, -1600, 1600, 0),
    y: number(input?.y, -1600, 1600, 4),
    blur: number(input?.blur, 0, 800, 12),
    color: string(input?.color, 100) || "rgba(0,0,0,0.3)",
  };
}

/** Pixel values scale with the slide, including previews and exports. */
export function slideShadowFilter(input?: SlideShadow): string | undefined {
  if (!input?.enabled) return undefined;
  const shadow = normalizeSlideShadow(input);
  return `drop-shadow(${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color})`;
}
export type Slide = {
  publicationBackground?: PublicationBackground;
  hidden?: boolean;
  showBack?: boolean;
  backLabel?: string;
  id: string;
  name: string;
  background: string;
  notes: string;
  duration?: number;
  transition?: "cut" | "fade" | "flip" | "slide";
  audioUrl?: string;
  audioId?: string;
  waitForAudio?: boolean;
  objects: SlideObject[];
};
export type SlideLayout = { id: string; name: string; slide: Slide };
export type PresentationDefaults = {
  pageBackground: string;
  shapeBackground: string;
  fontColor: string;
  borderColor: string;
  fontFamily: string;
  fontSize: number;
};
export const DEFAULT_PRESENTATION_STYLE: PresentationDefaults = {
  pageBackground: "#ffffff", shapeBackground: "#3b82f6", fontColor: "#16181d",
  borderColor: "#16181d", fontFamily: "", fontSize: 32,
};
export function presentationDefaults(input?: Partial<PresentationDefaults>): PresentationDefaults {
  const result = { ...DEFAULT_PRESENTATION_STYLE };
  for (const key of ["pageBackground", "shapeBackground", "fontColor", "borderColor", "fontFamily"] as const)
    if (typeof input?.[key] === "string") result[key] = input[key].slice(0, 200);
  if (typeof input?.fontSize === "number" && Number.isFinite(input.fontSize))
    result.fontSize = Math.max(1, Math.min(512, input.fontSize));
  return result;
}
export type Deck = {
  defaults?: PresentationDefaults;
  layouts?: SlideLayout[];
  autoPlay?: boolean;
  loop?: boolean;
  audioLoop?: boolean;
  audioAutoplay?: boolean;
  audioVolume?: number;
  duration?: number;
  transition?: "cut" | "fade" | "flip" | "slide";
  audioUrl?: string;
  audioId?: string;
  title: string;
  aspect: "16:9" | "4:3" | "9:16" | "3:4" | "custom";
  pageUnit?: "px" | "in";
  resolution?: "hd" | "4k";
  dpi?: 72 | 144 | 200 | 300;
  customWidth?: number;
  customHeight?: number;
  slides: Slide[];
};
export const PAGE_DPI = [72, 144, 200, 300] as const;
export const MAX_PAGE_PIXELS = 8000;
type PageSize = Pick<Deck, "aspect" | "customWidth" | "customHeight" | "pageUnit" | "resolution" | "dpi">;
export function slideDimensions(deck: PageSize) {
  // Documents without a unit predate pixel sizing. Preserve their original canvas.
  if (!deck.pageUnit) return {
    width: deck.aspect === "custom" ? (deck.customWidth ?? 60) * 16 : deck.aspect === "9:16" ? 540 : deck.aspect === "3:4" ? 720 : 960,
    height: deck.aspect === "custom" ? (deck.customHeight ?? 33.75) * 16 : deck.aspect === "4:3" ? 720 : deck.aspect === "9:16" || deck.aspect === "3:4" ? 960 : 540,
  };
  if (deck.aspect === "custom") {
    const scale = deck.pageUnit === "in" ? deck.dpi ?? 144 : 1;
    return { width: Math.round((deck.customWidth ?? 1920 / scale) * scale), height: Math.round((deck.customHeight ?? 1080 / scale) * scale) };
  }
  if (deck.aspect === "4:3") return { width: 1600, height: 1200 };
  if (deck.aspect === "3:4") return { width: 1200, height: 1600 };
  const long = deck.resolution === "4k" ? 3840 : 1920;
  const short = deck.resolution === "4k" ? 2160 : 1080;
  return deck.aspect === "9:16" ? { width: short, height: long } : { width: long, height: short };
}
export function migratePageSize<T extends PageSize>(deck: T): T {
  if (deck.pageUnit) return deck;
  const size = slideDimensions(deck);
  return { ...deck, aspect: "custom", pageUnit: "px", resolution: "hd", dpi: 144, customWidth: size.width, customHeight: size.height };
}
export const slideId = () => crypto.randomUUID();
export function newSlide(defaults?: Partial<PresentationDefaults>): Slide {
  return {
    id: slideId(),
    name: "",
    background: presentationDefaults(defaults).pageBackground,
    notes: "",
    objects: [],
  };
}
export function newObject(type: SlideObject["type"], defaults?: Partial<PresentationDefaults>): SlideObject {
  const style = presentationDefaults(defaults);
  return {
    id: slideId(),
    type,
    ...(type === "line" ? { line: defaultLine() } : {}),
    x: 80,
    y: 80,
    width: type === "text" ? 600 : 320,
    height: type === "text" ? 140 : 220,
    html: type === "text" ? "<p>Enter text</p>" : "",
    mediaUrl: "",
    mediaId: "",
    fill: type === "text" ? "transparent" : style.shapeBackground,
    color: style.fontColor,
    borderColor: style.borderColor,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    rotation: 0,
    alt: "",
  };
}
export function duplicateObjects(objects: SlideObject[], offset = 20): SlideObject[] {
  const groups = new Map<string, string>();
  for (const o of objects)
    if (o.groupId && !groups.has(o.groupId)) groups.set(o.groupId, slideId());
  return objects.map((o) => ({
      ...structuredClone(o),
      groupId: o.groupId ? groups.get(o.groupId) : undefined,
      id: slideId(),
      x: o.x + offset,
      y: o.y + offset,
      block: o.block
        ? { ...structuredClone(o.block), id: slideId() }
        : undefined,
      publication: o.publication
        ? { ...structuredClone(o.publication), id: slideId() }
        : undefined,
    }));
}
export function duplicateSlide(slide: Slide): Slide {
  return {
    ...structuredClone(slide),
    id: slideId(),
    name: slide.name ? `${slide.name} copy` : "",
    objects: duplicateObjects(slide.objects, 0),
  };
}

export type LinePoint = { x: number; y: number };
export function defaultLine(): NonNullable<SlideObject["line"]> {
  return { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, startCap: "none", endCap: "none", curved: false, strokeWidth: 3 };
}

function normalizeLine(value: SlideObject["line"]) {
  const line = value ?? defaultLine();
  const point = (p: LinePoint | undefined, fallback: number) => ({
    x: number(p?.x, 0, 1, fallback), y: number(p?.y, 0, 1, fallback),
  });
  const cap = (value: unknown): "none" | "arrow" | "dot" =>
    value === "arrow" || value === "dot" ? value : "none";
  return { start: point(line.start, 0), end: point(line.end, 1), startCap: cap(line.startCap), endCap: cap(line.endCap), curved: line.curved === true, strokeWidth: number(line.strokeWidth, 0.5, 50, 3) };
}

/** Endpoint positions in slide coordinates, including object rotation. */
export function lineEndpoints(object: SlideObject) {
  const line = object.line ?? defaultLine();
  const angle = object.rotation * Math.PI / 180;
  const world = (p: LinePoint) => {
    const x = (p.x - 0.5) * object.width, y = (p.y - 0.5) * object.height;
    return { x: object.x + object.width / 2 + x * Math.cos(angle) - y * Math.sin(angle), y: object.y + object.height / 2 + x * Math.sin(angle) + y * Math.cos(angle) };
  };
  return { start: world(line.start), end: world(line.end) };
}

/** Reframe after dragging an endpoint; zero-length axes remain exactly level. */
export function lineFromPoints(object: SlideObject, start: LinePoint, end: LinePoint): SlideObject {
  const x = Math.min(start.x, end.x), y = Math.min(start.y, end.y);
  const width = Math.max(1, Math.abs(end.x - start.x)), height = Math.max(1, Math.abs(end.y - start.y));
  return { ...object, x, y, width, height, rotation: 0, line: { ...(object.line ?? defaultLine()), start: { x: (start.x - x) / width, y: (start.y - y) / height }, end: { x: (end.x - x) / width, y: (end.y - y) / height } } };
}

/** A smooth node connection whose tangents follow its dominant axis. */
export function lineGeometry(object: SlideObject) {
  const line = object.line ?? defaultLine();
  const start = { x: line.start.x * object.width, y: line.start.y * object.height };
  const end = { x: line.end.x * object.width, y: line.end.y * object.height };
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const c1 = horizontal ? { x: (start.x + end.x) / 2, y: start.y } : { x: start.x, y: (start.y + end.y) / 2 };
  const c2 = horizontal ? { x: (start.x + end.x) / 2, y: end.y } : { x: end.x, y: (start.y + end.y) / 2 };
  // Approximate the curve's arc length so arrowheads can cover the stroke ends.
  // Chords slightly underestimate length, keeping the trimmed stroke behind the tip.
  let length = Math.hypot(end.x - start.x, end.y - start.y);
  if (line.curved) {
    length = 0;
    let previous = start;
    for (let i = 1; i <= 64; i++) {
      const t = i / 64, u = 1 - t;
      const point = {
        x: u ** 3 * start.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * end.x,
        y: u ** 3 * start.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * end.y,
      };
      length += Math.hypot(point.x - previous.x, point.y - previous.y);
      previous = point;
    }
  }
  return { start, end, length,
    startAngle: Math.atan2(start.y - (line.curved ? c1.y : end.y), start.x - (line.curved ? c1.x : end.x)),
    endAngle: Math.atan2(end.y - (line.curved ? c2.y : start.y), end.x - (line.curved ? c2.x : start.x)),
    path: `M ${start.x} ${start.y} ${line.curved ? `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}` : `L ${end.x} ${end.y}`}`,
  };
}
export function reorderSlides(
  slides: Slide[],
  from: number,
  to: number,
): Slide[] {
  if (from < 0 || to < 0 || from >= slides.length || to >= slides.length)
    return slides;
  const next = [...slides];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
const number = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
const string = (value: unknown, max = 10000) =>
  typeof value === "string" ? value.slice(0, max) : "";
/** Reject malformed documents rather than silently dropping slides or objects. */
export function normalizeDeck(input: unknown): Deck {
  if (!input || typeof input !== "object")
    throw new Error("Invalid presentation.");
  const raw = input as Deck;
  if (
    !Array.isArray(raw.slides) ||
    !raw.slides.length ||
    raw.slides.length > 200
  )
    throw new Error("A presentation needs 1 to 200 slides.");
  if (!["16:9", "4:3", "9:16", "3:4", "custom"].includes(raw.aspect))
    throw new Error("Choose a supported slide size.");
  if (raw.pageUnit !== undefined && raw.pageUnit !== "px" && raw.pageUnit !== "in")
    throw new Error("Choose pixels or inches for the page size.");
  if (raw.dpi !== undefined && !PAGE_DPI.includes(raw.dpi))
    throw new Error("Choose 72, 144, 200 or 300 DPI.");
  if (raw.resolution !== undefined && !["hd", "4k"].includes(raw.resolution))
    throw new Error("Choose HD or 4K resolution.");
  if (raw.pageUnit === "in" && raw.aspect !== "custom")
    throw new Error("Inch sizes require a custom page size.");
  if (raw.aspect === "custom") {
    const min = raw.pageUnit === "in" ? 0.01 : 1;
    const max = !raw.pageUnit ? 500 : MAX_PAGE_PIXELS / (raw.pageUnit === "in" ? raw.dpi ?? 144 : 1);
    if ([raw.customWidth, raw.customHeight].some((n) => typeof n !== "number" || !Number.isFinite(n) || n < min || n > max))
      throw new Error(!raw.pageUnit ? "Custom slide width and height must be between 1 and 500 rem."
        : `Page width and height must produce between 1 and ${MAX_PAGE_PIXELS} pixels per side.`);
  }
  const size = migratePageSize(raw);
  const ids = new Set<string>();
  const id = (value: unknown) => {
    const s = string(value, 80);
    if (!s || ids.has(s))
      throw new Error("Slide and object IDs must be unique.");
    ids.add(s);
    return s;
  };
  return {
    defaults: presentationDefaults(raw.defaults),
    layouts: Array.isArray(raw.layouts)
      ? raw.layouts.slice(0, 50).map((layout) => ({
          id: string(layout.id, 80) || slideId(),
          name: string(layout.name, 200) || "Layout",
          slide: normalizeDeck({
            title: "Layout",
            aspect: size.aspect,
            pageUnit: size.pageUnit,
            resolution: size.resolution,
            dpi: size.dpi,
            customWidth: size.customWidth,
            customHeight: size.customHeight,
            slides: [layout.slide],
          }).slides[0],
        }))
      : [],
    autoPlay: raw.autoPlay === true,
    loop: raw.loop === true,
    audioLoop: raw.audioLoop !== false,
    audioAutoplay: raw.audioAutoplay !== false,
    audioVolume: number(raw.audioVolume, 0, 1, 0.8),
    duration: number(raw.duration, 0.1, 86400, 5),
    transition:
      raw.transition === "fade" || raw.transition === "flip" || raw.transition === "slide"
        ? raw.transition
        : "cut",
    audioUrl: sanitizeMediaPath(string(raw.audioUrl, 2000)),
    audioId: string(raw.audioId, 24),
    title: string(raw.title, 200).trim(),
    aspect: size.aspect,
    pageUnit: size.pageUnit,
    resolution: size.resolution ?? "hd",
    dpi: size.dpi ?? 144,
    customWidth: size.customWidth ?? 1920,
    customHeight: size.customHeight ?? 1080,
    slides: raw.slides.map((slide) => {
      if (!slide || !Array.isArray(slide.objects) || slide.objects.length > 100)
        throw new Error("Invalid slide objects.");
      return {
        publicationBackground: slide.publicationBackground ? normalizeBackground(slide.publicationBackground as unknown as Record<string, unknown>) : undefined,
        hidden: slide.hidden === true,
        showBack: slide.showBack !== false,
        backLabel: string(slide.backLabel, 60) || "Back",
        id: id(slide.id),
        name: string(slide.name, 200),
        notes: string(slide.notes, 20000),
        duration:
          slide.duration === undefined
            ? undefined
            : number(slide.duration, 0.1, 86400, 5),
        transition: ["cut", "fade", "flip", "slide"].includes(slide.transition || "")
          ? slide.transition
          : undefined,
        audioUrl: sanitizeMediaPath(string(slide.audioUrl, 2000)),
        audioId: string(slide.audioId, 24),
        waitForAudio: slide.waitForAudio === true,
        background: string(slide.background, 100) || "#ffffff",
        objects: slide.objects.map((o) => {
          if (
            !o ||
            ![
              "publication",
              "text",
              "image",
              "video",
              "rectangle",
              "ellipse",
              "block",
              "line",
            ].includes(o.type)
          )
            throw new Error("Unsupported slide object.");
          const publication = o.type === "publication" ? normalizePublicationBlock(o.publication) : undefined;
          if (o.type === "publication" && !publication) throw new Error("Invalid publication object.");
          let block: PageBlock | undefined;
          if (o.type === "block") {
            if (!o.block || !PRESENTATION_BLOCK_TYPES.includes(o.block.type))
              throw new Error("Unsupported presentation block.");
            block = normalizeBlock(o.block) ?? undefined;
            if (!block) throw new Error("Invalid presentation block.");
            if (
              block.href &&
              !/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(block.href)
            )
              block.href = "";
          }
          return {
            shadow: o.shadow ? normalizeSlideShadow(o.shadow) : undefined,
            publication: publication || undefined,
            block,
            ...(o.type === "line" ? { line: normalizeLine(o.line) } : {}),
            locked: o.locked === true,
            aspectLocked: o.aspectLocked === true,
            groupId: string(o.groupId, 80) || undefined,
            imageFit: o.imageFit === "cover" ? "cover" : "contain",
            imageRatio: o.imageRatio ? number(o.imageRatio, 0.001, 1000, 0) : 0,
            borderWidth: number(o.borderWidth, 0, 50, 0),
            borderColor: string(o.borderColor, 100) || "#16181d",
            borderRadius: number(o.borderRadius, 0, 200, 0),
            id: id(o.id),
            type: o.type,
            x: number(o.x, -32000, 32000, 80),
            y: number(o.y, -32000, 32000, 80),
            width: number(o.width, 1, 32000, 320),
            height: number(o.height, 1, 32000, 140),
            html: normalizeRichText(string(o.html, 100000)),
            mediaUrl: sanitizeMediaPath(string(o.mediaUrl, 2000)),
            mediaId: string(o.mediaId, 24),
            fill: string(o.fill, 100),
            color: string(o.color, 100),
            fontFamily: string(o.fontFamily, 200),
            fontSize: number(o.fontSize, 1, 512, 32),
            rotation: number(o.rotation, -360, 360, 0),
            alt: string(o.alt, 1000),
          };
        }),
      };
    }),
  };
}

export const PRESENTATION_BLOCK_TYPES: PageBlockType[] = [
  "richText",
  "image",
  "video",
  "videoEmbed",
  "icon",
  "shape",
  "customShape",
  "button",
  "qrCode",
];
export function newSlideBlock(type: PageBlockType, defaults?: Partial<PresentationDefaults>): SlideObject {
  if (!PRESENTATION_BLOCK_TYPES.includes(type))
    throw new Error("Unsupported presentation block.");
  if (type === "richText") return newObject("text", defaults);
  if (type === "image" || type === "video") return newObject(type, defaults);
  const object = newObject("block", defaults);
  const block = createBlock(type);
  const style = presentationDefaults(defaults);
  block.textStyle = { ...block.textStyle, fontFamily: style.fontFamily, fontSize: style.fontSize / 16, color: style.fontColor, borderColor: style.borderColor };
  if (type === "icon") {
    block.iconName = "Star";
    object.width = 120;
    object.height = 120;
  }
  if (type === "qrCode") {
    block.qrValue = "https://example.com";
    object.width = 180;
    object.height = 180;
  }
  if (type === "button") {
    block.label = "Learn more";
    block.href = "https://example.com";
    block.newTab = true;
    object.width = 240;
    object.height = 80;
  }
  if (type === "shape") {
    block.shapeKind = "rectangle";
    block.color = presentationDefaults(defaults).shapeBackground;
  }
  if (type === "videoEmbed") {
    object.width = 480;
    object.height = 270;
  }
  if (type === "shape" || type === "customShape") {
    block.color = presentationDefaults(defaults).shapeBackground;
    block.borderColor = presentationDefaults(defaults).borderColor;
  }
  return { ...object, block };
}

/** Maintain a contain image's actual bounds whenever either dimension changes. */
export function fitObject(object: SlideObject, patch: Partial<SlideObject>): SlideObject {
  const next = { ...object, ...patch };
  const type = next.publication?.type || next.block?.type;
  if (next.aspectLocked && (type === "shape" || type === "customShape") && (patch.width !== undefined || patch.height !== undefined)) {
    const width = Math.max(1, object.width), height = Math.max(1, object.height);
    const widthScale = (patch.width ?? width) / width;
    const heightScale = (patch.height ?? height) / height;
    const requested = patch.width === undefined ? heightScale : patch.height === undefined ? widthScale : Math.abs(heightScale - 1) > Math.abs(widthScale - 1) ? heightScale : widthScale;
    const scale = Math.max(1 / width, 1 / height, Math.min(32000 / width, 32000 / height, requested));
    return { ...next, width: width * scale, height: height * scale };
  }
  return fitImage(object, patch);
}

export function fitImage(
  object: SlideObject,
  patch: Partial<SlideObject>,
): SlideObject {
  const next = { ...object, ...patch };
  if (next.type === "image" && next.imageFit !== "cover" && next.imageRatio) {
    const border = (next.borderWidth || 0) * 2;
    if (patch.height !== undefined && patch.width === undefined)
      next.width = Math.max(1, next.height - border) * next.imageRatio + border;
    else
      next.height = Math.max(1, next.width - border) / next.imageRatio + border;
  }
  return next;
}
export function objectBounds(object: SlideObject) {
  const angle = (object.rotation * Math.PI) / 180;
  const width =
    Math.abs(object.width * Math.cos(angle)) +
    Math.abs(object.height * Math.sin(angle));
  const height =
    Math.abs(object.width * Math.sin(angle)) +
    Math.abs(object.height * Math.cos(angle));
  return {
    x: object.x + (object.width - width) / 2,
    y: object.y + (object.height - height) / 2,
    width,
    height,
  };
}
export function arrangeObjects(
  objects: SlideObject[],
  ids: string[],
  action: string,
): SlideObject[] {
  const selected = objects
    .filter((o) => ids.includes(o.id) && !o.locked)
    .map((o) => ({ ...o, ...objectBounds(o) }));
  if (selected.length < 2) return objects;
  const horizontal =
    action.includes("horizontal") ||
    ["left", "right", "center"].includes(action);
  const axis = horizontal ? "x" : "y",
    size = horizontal ? "width" : "height";
  const ordered = [...selected].sort((a, b) => a[axis] - b[axis]);
  const start = Math.min(...selected.map((o) => o[axis]));
  const end = Math.max(...selected.map((o) => o[axis] + o[size]));
  const gap =
    (end - start - selected.reduce((sum, o) => sum + o[size], 0)) /
    (selected.length - 1);
  let cursor = start;
  const changes = new Map<string, number>();
  for (const o of ordered) {
    const value = action.startsWith("distribute")
      ? cursor
      : ["right", "bottom"].includes(action)
        ? end - o[size]
        : ["center", "middle"].includes(action)
          ? (start + end - o[size]) / 2
          : start;
    changes.set(o.id, value);
    cursor += o[size] + gap;
  }
  return objects.map((o) =>
    changes.has(o.id)
      ? { ...o, [axis]: o[axis] + changes.get(o.id)! - objectBounds(o)[axis] }
      : o,
  );
}
