import type { PublicationSources } from "@/components/publication-blocks";

import { connectDB } from "./db";
import { Collection, CustomShape, FormDefinition, MediaAsset, Story } from "./models";
import type { PublicationBlock, PublicationPage } from "./publication-layout";

/** Load every record referenced by a publication's pages, in one pass. */
export async function loadPublicationSources(
  pages: PublicationPage[],
  /** Blocks repeated on every page reference records too. */
  repeatedBlocks: PublicationBlock[] = []
): Promise<PublicationSources> {
  await connectDB();

  const storyIds = new Set<string>();
  const collectionIds = new Set<string>();
  const formIds = new Set<string>();
  const shapeSlugs = new Set<string>();
  const mediaIds = new Set<string>();

  for (const block of [...repeatedBlocks, ...pages.flatMap((page) => page.blocks)]) {
    if (block.mediaId) mediaIds.add(block.mediaId);
    if (block.storyId) storyIds.add(block.storyId);
    if (block.collectionId) collectionIds.add(block.collectionId);
    if (block.formId) formIds.add(block.formId);
    if (block.shapeSlug) shapeSlugs.add(block.shapeSlug);
  }

  const objectIds = (values: Set<string>) =>
    [...values].filter((value) => /^[a-f0-9]{24}$/i.test(value));

  const [stories, collections, forms, shapes, media] = await Promise.all([
    storyIds.size
      ? Story.find({ _id: { $in: objectIds(storyIds) } })
          .select("headline slug featureMediaUrl")
          .lean<any[]>()
      : Promise.resolve([]),
    collectionIds.size
      ? Collection.find({ _id: { $in: objectIds(collectionIds) } })
          .select("name slug")
          .lean<any[]>()
      : Promise.resolve([]),
    formIds.size
      ? FormDefinition.find({ _id: { $in: objectIds(formIds) } })
          .select("title slug")
          .lean<any[]>()
      : Promise.resolve([]),
    shapeSlugs.size
      ? CustomShape.find({ slug: { $in: [...shapeSlugs] } }).lean<any[]>()
      : Promise.resolve([]),
    mediaIds.size
      ? MediaAsset.find({ _id: { $in: objectIds(mediaIds) } })
          .select("url")
          .lean<any[]>()
      : Promise.resolve([]),
  ]);

  return {
    media: Object.fromEntries(
      media.map((asset) => [String(asset._id), asset.url ?? ""])
    ),
    stories: Object.fromEntries(
      stories.map((story) => [
        String(story._id),
        {
          headline: story.headline ?? "",
          slug: story.slug ?? "",
          featureMediaUrl: story.featureMediaUrl ?? "",
        },
      ])
    ),
    collections: Object.fromEntries(
      collections.map((collection) => [
        String(collection._id),
        { name: collection.name ?? "", slug: collection.slug ?? "" },
      ])
    ),
    forms: Object.fromEntries(
      forms.map((form) => [
        String(form._id),
        { title: form.title ?? "", slug: form.slug ?? "" },
      ])
    ),
    shapes: Object.fromEntries(
      shapes.map((shape) => [
        shape.slug,
        { viewBox: shape.viewBox ?? "0 0 100 100", paths: shape.paths ?? [] },
      ])
    ),
  };
}
