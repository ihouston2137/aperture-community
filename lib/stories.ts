import type { StoryView } from "@/components/story-blocks";

import {
  emptyColorOverrides,
  normalizeColorOverrides,
  type ColorOverrides,
} from "./color-overrides";
import { connectDB } from "./db";
import { Bio, MediaAsset, Story, StoryTemplate } from "./models";
import type { PageRow } from "./page-layout";
import { normalizeRichText } from "./rich-text";
import { isProtectedMediaPath, protectedMediaUrl } from "./protected-media-url";
import {
  insertStoryImages,
  normalizeClickSettings,
  normalizeStoryImage,
  type MediaClickSettings,
  type StoryImage,
} from "./story-media";
import {
  defaultStoryTemplateLayout,
  normalizeStoryTemplateLayout,
} from "./story-template-layout";

/**
 * Rewrite `<img src="/uploads/…">` inside rich content through the protected
 * media route, so inline story images keep their placement in the prose but are
 * still served with the same safety and caching rules as every other asset.
 */
export function rewriteContentMedia(html: string): string {
  return html.replace(
    /(<(?:img|video|source)\b[^>]*\bsrc=")([^"]+)(")/gi,
    (match, prefix: string, src: string, suffix: string) =>
      isProtectedMediaPath(src) ? `${prefix}${protectedMediaUrl(src)}${suffix}` : match
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* -------------------------------------------------------------- Media lookup */

/** Description, credit and caption all follow the file rather than the story. */
export type MediaMeta = {
  alt: string;
  caption: string;
  title: string;
  /** The credit recorded on the file, or the linked profile's name. */
  author: string;
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const emptyMeta: MediaMeta = { alt: "", caption: "", title: "", author: "" };

/**
 * Resolve the `MediaAsset` behind each reference in one query.
 *
 * Older rows recorded only a url, so assets are matched by id or by url and
 * indexed under both.
 */
async function loadMediaMeta(
  refs: { mediaId?: string; url?: string }[]
): Promise<Map<string, MediaMeta>> {
  const ids = new Set<string>();
  const urls = new Set<string>();

  for (const ref of refs) {
    if (ref.mediaId && OBJECT_ID.test(ref.mediaId)) ids.add(ref.mediaId);
    else if (ref.url) urls.add(ref.url);
  }
  if (ids.size === 0 && urls.size === 0) return new Map();

  await connectDB();

  const conditions: Record<string, unknown>[] = [];
  if (ids.size > 0) conditions.push({ _id: { $in: [...ids] } });
  if (urls.size > 0) conditions.push({ url: { $in: [...urls] } });

  const assets = await MediaAsset.find({ $or: conditions })
    .select("url alt caption title author authorBioId")
    .lean<any[]>();

  // A credit can be free text or a link to a profile; resolve the names in one
  // extra query rather than one per asset.
  const bioIds = [
    ...new Set(
      assets
        .map((asset) => String(asset.authorBioId ?? ""))
        .filter((id) => OBJECT_ID.test(id))
    ),
  ];
  const bioNames = new Map<string, string>();
  if (bioIds.length > 0) {
    const bios = await Bio.find({ _id: { $in: bioIds } }).select("name").lean<any[]>();
    for (const bio of bios) bioNames.set(String(bio._id), bio.name ?? "");
  }

  const map = new Map<string, MediaMeta>();
  for (const asset of assets) {
    const meta: MediaMeta = {
      alt: asset.alt ?? "",
      caption: asset.caption ?? "",
      title: asset.title ?? "",
      author: asset.author || bioNames.get(String(asset.authorBioId ?? "")) || "",
    };
    map.set(String(asset._id), meta);
    if (asset.url) map.set(asset.url, meta);
  }
  return map;
}

/**
 * The same lookup as a plain object, for passing to the story editor so it can
 * show the description a file will actually render with.
 */
export async function loadMediaMetaRecord(
  refs: { mediaId?: string; url?: string }[]
): Promise<Record<string, MediaMeta>> {
  return Object.fromEntries(await loadMediaMeta(refs));
}

function metaFor(
  map: Map<string, MediaMeta>,
  ref: { mediaId?: string; url?: string }
): MediaMeta {
  return (
    (ref.mediaId ? map.get(ref.mediaId) : undefined) ??
    (ref.url ? map.get(ref.url) : undefined) ??
    emptyMeta
  );
}

/* ------------------------------------------------------------ Image rendering */

/**
 * Story images are woven into the content HTML rather than rendered as React,
 * so the prose keeps its single `rich-text` container and the existing typography
 * rules still apply. A lightbox click is marked with a data attribute and picked
 * up by a delegated handler in the renderer.
 */
function renderStoryImage(image: StoryImage, meta: MediaMeta): string {
  const src = protectedMediaUrl(image.url);
  const alt = escapeHtml(meta.alt || meta.title);
  const caption = meta.caption ? `<figcaption>${escapeHtml(meta.caption)}</figcaption>` : "";

  let media = `<img src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />`;

  if (image.clickAction === "lightbox") {
    media =
      `<button type="button" class="story-image-trigger"` +
      ` data-story-lightbox="${escapeHtml(src)}"` +
      ` data-story-lightbox-alt="${alt}"` +
      ` data-story-lightbox-caption="${escapeHtml(meta.caption)}">${media}</button>`;
  } else if (image.clickAction === "link" && image.linkHref) {
    const target = image.linkNewTab ? ` target="_blank" rel="noreferrer"` : "";
    media = `<a href="${escapeHtml(image.linkHref)}"${target}>${media}</a>`;
  }

  return (
    `<figure class="story-image" data-size="${image.size}" data-align="${image.align}">` +
    `${media}${caption}</figure>`
  );
}

/* ------------------------------------------------------------------- Story view */

export async function toStoryView(doc: Record<string, any>): Promise<StoryView> {
  const images: StoryImage[] = (Array.isArray(doc.storyImages) ? doc.storyImages : [])
    .map((image: any, index: number) => normalizeStoryImage(image, index))
    .filter((image: StoryImage) => Boolean(image.url));

  const feature = {
    mediaId: String(doc.featureMediaId ?? ""),
    url: String(doc.featureMediaUrl ?? ""),
  };

  const mediaMeta = await loadMediaMeta([feature, ...images]);

  const content = insertStoryImages(
    rewriteContentMedia(normalizeRichText(doc.content ?? "")),
    images,
    (image) => renderStoryImage(image, metaFor(mediaMeta, image))
  );

  const featureMeta = metaFor(mediaMeta, feature);
  const featureClick: MediaClickSettings = normalizeClickSettings({
    clickAction: doc.featureClickAction,
    linkHref: doc.featureLinkHref,
    linkNewTab: doc.featureLinkNewTab,
  });

  return {
    slug: doc.slug ?? "",
    headline: doc.headline ?? "",
    subHeadline: doc.subHeadline ?? "",
    category: doc.category ?? "",
    location: doc.location ?? "",
    author: doc.author ?? "",
    publishDate: doc.publishDate ? new Date(doc.publishDate).toISOString() : null,
    featureMediaUrl: feature.url,
    featureMediaType: doc.featureMediaType ?? "image",
    featureAlt: featureMeta.alt || featureMeta.title,
    featureCaption: featureMeta.caption,
    featureAuthor: featureMeta.author,
    featureClick,
    content,
  };
}

/**
 * Selected template → default template → built-in default layout, along with
 * the template's colour overrides so both travel together.
 */
export async function resolveStoryTemplate(templateId: string | undefined): Promise<{
  layout: PageRow[];
  colors: ColorOverrides;
}> {
  await connectDB();

  const resolve = (doc: any) => ({
    layout: normalizeStoryTemplateLayout(doc.layout, doc.layoutVersion),
    colors: normalizeColorOverrides(doc.colors),
  });

  if (templateId && /^[a-f0-9]{24}$/i.test(templateId)) {
    const selected = await StoryTemplate.findById(templateId).lean<any>();
    if (selected?.layout?.length) return resolve(selected);
  }

  const fallback = await StoryTemplate.findOne({ isDefault: true }).lean<any>();
  if (fallback?.layout?.length) return resolve(fallback);

  return { layout: defaultStoryTemplateLayout(), colors: emptyColorOverrides };
}

export async function getStoryBySlug(slug: string) {
  await connectDB();
  return Story.findOne({ slug }).lean<any>();
}
