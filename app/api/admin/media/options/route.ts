import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { CATEGORY_KINDS } from "@/lib/media-query";
import type { UsageCategory } from "@/lib/media-usage-types";
import { Bio, MediaAsset } from "@/lib/models";
import { getSession } from "@/lib/session";

/**
 * Small, page-independent data for the media UI: the profile lists used by the
 * metadata form, and the set of documents that currently reference media (which
 * populates the "used in" by-name filter).
 *
 * Kept out of the paged listing so it is fetched once rather than per page.
 */

const KIND_TO_CATEGORY = new Map<string, UsageCategory>();
for (const [category, kinds] of Object.entries(CATEGORY_KINDS)) {
  for (const kind of kinds) KIND_TO_CATEGORY.set(kind, category as UsageCategory);
}

export async function GET() {
  const session = await getSession();
  if (!(await checkPermission(session, "media.view"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const [bios, usageEntries] = await Promise.all([
    Bio.find().select("name type").sort({ name: 1 }).lean<any[]>(),
    // `distinct` collapses the usage subdocuments across the whole collection
    // in one pass, so the option list costs one query regardless of size.
    MediaAsset.distinct("usage") as Promise<any[]>,
  ]);

  const seen = new Map<string, { category: UsageCategory; refId: string; name: string }>();
  for (const entry of usageEntries) {
    const category = KIND_TO_CATEGORY.get(entry?.kind);
    if (!category || !entry.refId) continue;

    const key = `${category}:${entry.refId}`;
    if (!seen.has(key)) {
      seen.set(key, { category, refId: entry.refId, name: entry.label || entry.kind });
    }
  }

  return Response.json({
    bios: bios.map((bio) => ({ _id: String(bio._id), name: bio.name, type: bio.type })),
    usageOptions: [...seen.values()].sort((a, b) => a.name.localeCompare(b.name)),
  });
}
