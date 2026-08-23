/**
 * Story image placement.
 *
 * Story images are not part of the rich text. They are stored alongside it and
 * interleaved between its top-level blocks at render time, which keeps the
 * prose editable without the images getting in the way and lets the same
 * placement drive both the draft preview and the published page.
 *
 * Everything here is client-safe so the editor can count paragraphs with the
 * exact function the renderer uses to place images.
 */

export const STORY_IMAGE_SIZES = ["small", "medium", "large", "full"] as const;
export type StoryImageSize = (typeof STORY_IMAGE_SIZES)[number];

export const STORY_IMAGE_ALIGNMENTS = ["left", "center", "right"] as const;
export type StoryImageAlign = (typeof STORY_IMAGE_ALIGNMENTS)[number];

/** What a click on a story image or the feature media does. */
export const MEDIA_CLICK_ACTIONS = ["none", "lightbox", "link"] as const;
export type MediaClickAction = (typeof MEDIA_CLICK_ACTIONS)[number];

export const STORY_IMAGE_SIZE_LABELS: Record<StoryImageSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  full: "Full width",
};

export const STORY_IMAGE_ALIGN_LABELS: Record<StoryImageAlign, string> = {
  left: "Left (text wraps)",
  center: "Centre",
  right: "Right (text wraps)",
};

export const MEDIA_CLICK_ACTION_LABELS: Record<MediaClickAction, string> = {
  none: "Nothing",
  lightbox: "Open in the lightbox",
  link: "Open a link",
};

export type MediaClickSettings = {
  clickAction: MediaClickAction;
  linkHref: string;
  linkNewTab: boolean;
};

export type StoryImage = MediaClickSettings & {
  mediaId: string;
  url: string;
  size: StoryImageSize;
  align: StoryImageAlign;
  /**
   * Which top-level block of the content the image follows. `0` places it
   * above the first paragraph.
   */
  afterParagraph: number;
  order: number;
};

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeClickSettings(input: any): MediaClickSettings {
  const clickAction = pick(input?.clickAction, MEDIA_CLICK_ACTIONS, "none");
  return {
    clickAction,
    // Only meaningful for `link`, and dropped otherwise so a stale url cannot
    // resurface if the action is switched back.
    linkHref: clickAction === "link" ? String(input?.linkHref ?? "") : "",
    linkNewTab: clickAction === "link" ? Boolean(input?.linkNewTab) : false,
  };
}

export function normalizeStoryImage(input: any, index = 0): StoryImage {
  const after = Number(input?.afterParagraph);

  return {
    ...normalizeClickSettings(input),
    mediaId: String(input?.mediaId ?? ""),
    url: String(input?.url ?? ""),
    size: pick(input?.size, STORY_IMAGE_SIZES, "medium"),
    align: pick(input?.align, STORY_IMAGE_ALIGNMENTS, "center"),
    afterParagraph: Number.isFinite(after) ? Math.max(0, Math.floor(after)) : 0,
    order: Number.isFinite(Number(input?.order)) ? Number(input.order) : index,
  };
}

/* ------------------------------------------------------------ Block splitting */

/** Tags that never carry a closing tag, so they must not affect nesting depth. */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

/**
 * Split rich text into its top-level block elements — the paragraphs, headings,
 * lists and quotes an author sees as separate lines.
 *
 * Depth is tracked rather than matched with a regex so that a nested list (an
 * indented bullet produces `<ul>` inside `<li>`) still counts as one block.
 */
export function splitTopLevelBlocks(html: string): string[] {
  if (!html) return [];

  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  let match: RegExpExecArray | null;

  TAG.lastIndex = 0;
  while ((match = TAG.exec(html)) !== null) {
    const [full, closing, name, selfClosing] = match;
    if (selfClosing === "/" || VOID_TAGS.has(name.toLowerCase())) continue;

    if (closing) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        const end = match.index + full.length;
        blocks.push(html.slice(start, end));
        start = end;
      }
    } else {
      depth += 1;
    }
  }

  // Anything after the last closed block, including malformed trailing markup.
  const tail = html.slice(start).trim();
  if (tail) blocks.push(tail);

  return blocks;
}

/** How many places an image can be anchored to, for the editor's dropdown. */
export function countStoryParagraphs(html: string): number {
  return splitTopLevelBlocks(html).length;
}

/**
 * Interleave rendered images between the content's top-level blocks.
 * `render` returns the HTML for one image, so the caller owns the markup.
 */
export function insertStoryImages(
  html: string,
  images: StoryImage[],
  render: (image: StoryImage) => string
): string {
  if (images.length === 0) return html;

  const blocks = splitTopLevelBlocks(html);
  const sorted = [...images].sort(
    (a, b) => a.afterParagraph - b.afterParagraph || a.order - b.order
  );

  const anchored = new Map<number, string[]>();
  for (const image of sorted) {
    // An image anchored past the end of the story falls to the bottom rather
    // than disappearing, which is what happens when paragraphs are deleted.
    const anchor = Math.min(Math.max(0, image.afterParagraph), blocks.length);
    const bucket = anchored.get(anchor) ?? [];
    bucket.push(render(image));
    anchored.set(anchor, bucket);
  }

  const out = [...(anchored.get(0) ?? [])];
  blocks.forEach((block, index) => {
    out.push(block);
    out.push(...(anchored.get(index + 1) ?? []));
  });

  return out.join("");
}
