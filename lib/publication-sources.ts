import type {
  PublicationSources,
} from "@/components/publication-blocks";
import type { SponsorLogo } from "@/components/sponsor-scroll";

import { normalizeSponsorScroll } from "./page-layout";
import { isPubliclyNamed, primaryLogo, sponsorLogoSrc } from "./sponsorship-types";
import {
  getRecognitionLevels,
  getSponsors,
  sponsorScrollLogos,
} from "./sponsorships";

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
  const sponsorScrollBlocks: { id: string; levelIds: string[] }[] = [];

  for (const block of [...repeatedBlocks, ...pages.flatMap((page) => page.blocks)]) {
    if (block.type === "sponsorScroll") {
      const settings = normalizeSponsorScroll(block.sponsorScroll);
      sponsorScrollBlocks.push({ id: block.id, levelIds: settings.levelIds });
    }
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

  /*
   * Sponsor logos per scroll block.
   *
   * The sponsors and levels are read once however many scrolls a publication
   * holds. A sponsor at a level marked anonymous is never included: the level
   * says the site does not name them, and a logo names them louder than a line
   * of type would.
   */
  const sponsorLogos: Record<string, SponsorLogo[]> = {};
  if (sponsorScrollBlocks.length > 0) {
    const [levels, sponsors] = await Promise.all([
      getRecognitionLevels(),
      getSponsors(),
    ]);

    // Highest recognition first, then alphabetically — the order the rest of
    // the site lists sponsors in, so a run agrees with a wall of them.
    const rank = new Map(levels.map((level, index) => [level._id, index]));
    const ordered = [...sponsors].sort(
      (a, b) =>
        (rank.get(a.recognitionLevelId) ?? 999) - (rank.get(b.recognitionLevelId) ?? 999) ||
        a.name.localeCompare(b.name)
    );

    for (const entry of sponsorScrollBlocks) {
      // Thumbnails, capped, and carrying each logo's shape — see
      // `sponsorScrollLogos`. Doing it any other way is what made the run
      // stutter and half-draw on a phone.
      sponsorLogos[entry.id] = await sponsorScrollLogos(
        ordered.filter((sponsor) => {
          if (!isPubliclyNamed(sponsor, levels)) return false;
          if (entry.levelIds.length === 0) return Boolean(sponsor.recognitionLevelId);
          return entry.levelIds.includes(sponsor.recognitionLevelId);
        })
      );
    }
  }

  return {
    sponsorLogos,
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
