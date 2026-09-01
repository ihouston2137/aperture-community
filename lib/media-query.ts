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
  sponsorship: ["sponsor-logo"],
  other: ["bio-headshot", "form-content", "form-upload", "site-logo"],
};

export const MEDIA_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 200;

/** Fields the grids actually render — never the whole document. */
export const MEDIA_LIST_PROJECTION =
  "url thumbnailUrl title alt caption originalName mediaType provider embedUrl isNsfw origin tags usage width height createdAt";

/**
 * What a browser does about media that arrived off somebody's clipboard.
 *
 * `exclude` is the default everywhere. A pasted screenshot is a by-product of
 * an edit rather than something anybody chose to file, and a library that
 * fills up with them stops being a library. `only` is how they are found again
 * to be tidied away — without it, excluding them by default would mean
 * hunting for them among everything else, which is the same problem again.
 */
export const PASTED_FILTERS = ["exclude", "include", "only"] as const;
export type PastedFilter = (typeof PASTED_FILTERS)[number];

export const PASTED_FILTER_LABELS: Record<PastedFilter, string> = {
  exclude: "Hide pasted media",
  include: "Include pasted media",
  only: "Only pasted media",
};

export type MediaQueryInput = {
  q?: string | null;
  type?: string | null;
  use?: string | null;
  ref?: string | null;
  page?: string | null;
  limit?: string | null;
  pasted?: string | null;
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

  /*
   * Tested as "not paste" rather than "is upload".
   *
   * Everything filed before this was recorded carries no `origin` at all, and
   * `{ origin: "upload" }` would not match a missing field — turning a new
   * default into a library that appears to have emptied itself.
   */
  const pasted = (input.pasted ?? "exclude").trim() as PastedFilter;
  if (pasted === "only") conditions.push({ origin: "paste" });
  else if (pasted !== "include") conditions.push({ origin: { $ne: "paste" } });

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
