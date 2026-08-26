import { connectDB } from "./db";
import {
  Bio,
  Collection,
  FormDefinition,
  MediaAsset,
  SiteContent,
  SitePage,
  Sponsor,
  Story,
  Zine,
} from "./models";
import {
  usageCategoriesFor,
  type MediaUsageIndex,
  type UsageCategory,
  type UsageRef,
} from "./media-usage-types";
import { sanitizeMediaPath } from "./protected-media-url";

export { usageCategoriesFor };
export type { MediaUsageIndex, UsageCategory, UsageRef };

/**
 * Where a media asset is used, computed by scanning content rather than by
 * trusting the `usage` array maintained at save time. Scanning means the media
 * library is correct for documents saved by older versions of the app, and for
 * legacy layout shapes, with no migration step.
 */

const MEDIA_ID_KEYS = /(^|[a-z])mediaId$|^sourceId$/i;
const MEDIA_PATH = /^\/(uploads|images)\//;

/**
 * Walk an arbitrary document collecting anything that could address a media
 * asset: local media paths, `*MediaId` / `sourceId` fields, and `imageIds`
 * arrays. Being shape-agnostic is what lets one scanner cover every builder,
 * including layouts written by earlier versions.
 */
export function collectMediaRefs(
  value: unknown,
  urls: Set<string>,
  ids: Set<string>,
  depth = 0
) {
  if (depth > 12 || value == null) return;

  if (typeof value === "string") {
    const path = sanitizeMediaPath(value);
    if (path && MEDIA_PATH.test(path)) urls.add(path);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectMediaRefs(item, urls, ids, depth + 1);
    return;
  }

  if (typeof value !== "object") return;

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "_id") continue;

    if (MEDIA_ID_KEYS.test(key) && typeof item === "string" && item) {
      ids.add(item);
      continue;
    }

    if (key === "imageIds" && Array.isArray(item)) {
      for (const id of item) if (typeof id === "string") ids.add(id);
      continue;
    }

    collectMediaRefs(item, urls, ids, depth + 1);
  }
}

export async function buildMediaUsageIndex(): Promise<MediaUsageIndex> {
  await connectDB();

  const [
    assets,
    pages,
    stories,
    collections,
    publications,
    bios,
    sponsors,
    forms,
    siteContent,
  ] = await Promise.all([
      MediaAsset.find().select("url").lean<any[]>(),
      SitePage.find().select("title layout").lean<any[]>(),
      Story.find()
        .select("headline featureMediaId featureMediaUrl storyImages content")
        .lean<any[]>(),
      Collection.find().select("name imageIds").lean<any[]>(),
      Zine.find()
        .select("title pages repeatedBlocks coverMediaId coverUrl audio")
        .lean<any[]>(),
      Bio.find().select("name headshotMediaId headshotUrl").lean<any[]>(),
      Sponsor.find().select("name logos").lean<any[]>(),
      FormDefinition.find().select("title layout").lean<any[]>(),
      SiteContent.findOne().select("logoUrl metaImageUrl").lean<any>(),
    ]);

  // Assets are addressed either by id or by url, so both need a lookup.
  const byId = new Map<string, string>();
  const byUrl = new Map<string, string>();
  for (const asset of assets) {
    const id = String(asset._id);
    byId.set(id, id);
    const url = sanitizeMediaPath(asset.url ?? "");
    if (url) byUrl.set(url, id);
  }

  const index: MediaUsageIndex = {};

  const record = (
    source: unknown,
    category: UsageRef["category"],
    kind: string,
    refId: string,
    name: string
  ) => {
    const urls = new Set<string>();
    const ids = new Set<string>();
    collectMediaRefs(source, urls, ids);

    const assetIds = new Set<string>();
    for (const id of ids) if (byId.has(id)) assetIds.add(id);
    for (const url of urls) {
      const id = byUrl.get(url);
      if (id) assetIds.add(id);
    }

    for (const assetId of assetIds) {
      const entries = (index[assetId] ??= []);
      if (!entries.some((entry) => entry.refId === refId && entry.category === category)) {
        entries.push({ category, kind, refId, name });
      }
    }
  };

  for (const page of pages) {
    record(page, "page", "page", String(page._id), page.title || "Untitled page");
  }
  for (const story of stories) {
    record(story, "story", "story-content", String(story._id), story.headline || "Untitled story");
  }
  for (const collection of collections) {
    record(collection, "collection", "collection", String(collection._id), collection.name || "Untitled collection");
  }
  for (const publication of publications) {
    record(
      publication,
      "publication",
      "publication",
      String(publication._id),
      publication.title || "Untitled publication"
    );
  }

  // A sponsor's approved logos are its own category: an asset cleared for use
  // by the people who gave it is not the same kind of thing as a form upload,
  // and whoever is about to delete one should be told which sponsor it
  // belongs to.
  for (const sponsor of sponsors) {
    record(
      sponsor.logos,
      "sponsorship",
      "sponsor-logo",
      String(sponsor._id),
      `Sponsor: ${sponsor.name || "Untitled"}`
    );
  }

  // Everything that is not one of the four primary content types.
  for (const bio of bios) {
    record(bio, "other", "bio-headshot", String(bio._id), `Profile: ${bio.name || "Untitled"}`);
  }
  for (const form of forms) {
    record(form, "other", "form-content", String(form._id), `Form: ${form.title || "Untitled"}`);
  }
  if (siteContent) {
    record(siteContent, "other", "site-logo", "site-content", "Site content");
  }

  return index;
}
