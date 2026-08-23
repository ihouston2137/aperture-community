import type { UsageCategory } from "./media-usage-types";

/** A plain query object; deliberately not Mongoose's heavy `FilterQuery`. */
type Query = Record<string, unknown>;

/**
 * Translates the admin's media filters into an indexed MongoDB query.
 *
 * Filtering happens in the database, not the browser: a library with thousands
 * of assets must never ship the whole collection to the client just to narrow
 * it down.
 */

/** Usage kinds that make up each filter category. */
export const CATEGORY_KINDS: Record<Exclude<UsageCategory, "unused">, string[]> = {
  page: ["page"],
  story: ["story-feature", "story-content"],
  collection: ["collection"],
  publication: ["publication"],
  other: ["bio-headshot", "form-content", "form-upload", "site-logo"],
};

export const MEDIA_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;

/** Fields the grids actually render — never the whole document. */
export const MEDIA_LIST_PROJECTION =
  "url thumbnailUrl title alt caption originalName mediaType provider embedUrl isNsfw tags usage width height createdAt";

export type MediaQueryInput = {
  q?: string | null;
  type?: string | null;
  use?: string | null;
  ref?: string | null;
  page?: string | null;
  limit?: string | null;
};

export type MediaQuery = {
  filter: Query;
  skip: number;
  limit: number;
  page: number;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildMediaQuery(input: MediaQueryInput): MediaQuery {
  const conditions: Query[] = [];

  const type = (input.type ?? "all").trim();
  if (type && type !== "all") conditions.push({ mediaType: type });

  const use = (input.use ?? "all").trim() as UsageCategory | "all";
  const ref = (input.ref ?? "all").trim();

  if (use === "unused") {
    // Both shapes count as unused: never set, or emptied by a later save.
    conditions.push({ $or: [{ usage: { $size: 0 } }, { usage: { $exists: false } }] });
  } else if (use !== "all" && use in CATEGORY_KINDS) {
    const kinds = CATEGORY_KINDS[use as Exclude<UsageCategory, "unused">];
    conditions.push(
      ref && ref !== "all"
        ? { usage: { $elemMatch: { kind: { $in: kinds }, refId: ref } } }
        : { usage: { $elemMatch: { kind: { $in: kinds } } } }
    );
  }

  const q = (input.q ?? "").trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    conditions.push({
      $or: [
        { title: pattern },
        { originalName: pattern },
        { caption: pattern },
        { tags: pattern },
        { "usage.label": pattern },
      ],
    });
  }

  const page = Math.max(0, Number(input.page ?? 0) || 0);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(input.limit ?? MEDIA_PAGE_SIZE) || MEDIA_PAGE_SIZE)
  );

  return {
    filter: conditions.length > 0 ? { $and: conditions } : {},
    skip: page * limit,
    limit,
    page,
  };
}
