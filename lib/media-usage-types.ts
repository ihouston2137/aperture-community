/**
 * Usage vocabulary shared with client components. Kept separate from
 * `lib/media-usage.ts` so importing these values never pulls Mongoose into the
 * browser bundle.
 */

export const USAGE_CATEGORIES = [
  "page",
  "story",
  "collection",
  "publication",
  "other",
  "unused",
] as const;

export type UsageCategory = (typeof USAGE_CATEGORIES)[number];

export const USAGE_CATEGORY_LABELS: Record<UsageCategory, string> = {
  page: "Pages",
  story: "Stories",
  collection: "Collections",
  publication: "Publications",
  other: "Other",
  unused: "Unused",
};

export type UsageRef = {
  category: Exclude<UsageCategory, "unused">;
  /** The stored `MediaAsset.usage` kind this reference corresponds to. */
  kind?: string;
  /** Document id, or a stable key for singletons like site content. */
  refId: string;
  name: string;
};

/** Asset id -> every place it is referenced. */
export type MediaUsageIndex = Record<string, UsageRef[]>;

/** The category filter an asset belongs to, given its usage entries. */
export function usageCategoriesFor(refs: UsageRef[] | undefined): UsageCategory[] {
  if (!refs || refs.length === 0) return ["unused"];
  return [...new Set(refs.map((ref) => ref.category))];
}
