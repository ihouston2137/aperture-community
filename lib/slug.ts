import type { Model } from "mongoose";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Normalize a slug and append a short timestamp suffix if it collides with an
 * existing document (ignoring `excludeId`, so re-saving a record is stable).
 */
export async function uniqueSlug(
  model: Model<any>,
  desired: string,
  fallback: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(desired) || slugify(fallback) || "item";
  const query: Record<string, unknown> = { slug: base };
  if (excludeId) query._id = { $ne: excludeId };

  const clash = await model.exists(query);
  if (!clash) return base;

  return `${base}-${Date.now().toString(36).slice(-4)}`;
}
