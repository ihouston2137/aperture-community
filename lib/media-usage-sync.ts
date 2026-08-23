import { connectDB } from "./db";
import { collectMediaRefs } from "./media-usage";
import { MediaAsset, type MediaUsageKind } from "./models";

/**
 * Keeps the stored `MediaAsset.usage` array in step with the documents that
 * reference each asset.
 *
 * Every save replaces the whole set of entries for that document, so adding an
 * image records a usage and removing one drops it. That array is what the media
 * library's delete guard checks, so an asset placed on a page can no longer be
 * deleted as if it were unused.
 *
 * (`buildMediaUsageIndex` in `lib/media-usage.ts` computes the same
 * relationships by scanning content. It stays as the source of truth for the
 * library's filters, because it is also correct for documents that have not
 * been re-saved since this bookkeeping was added.)
 */

export type UsageGroup = {
  kind: MediaUsageKind;
  /** Any value — layout JSON, a document, or a bag of fields — to scan. */
  source: unknown;
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/** Drop every usage entry belonging to a document. Call this on delete. */
export async function clearMediaUsage(refId: string): Promise<void> {
  if (!refId) return;
  await connectDB();
  await MediaAsset.updateMany({ "usage.refId": refId }, { $pull: { usage: { refId } } });
}

/**
 * Replace the usage entries recorded for `refId` with whatever the supplied
 * groups currently reference.
 */
export async function syncMediaUsage(
  refId: string,
  label: string,
  groups: UsageGroup[]
): Promise<void> {
  if (!refId) return;
  await connectDB();

  // Resolve each group to a set of asset ids before touching anything, so a
  // failure part-way cannot leave usage half-rewritten.
  const resolved: { kind: MediaUsageKind; assetIds: string[] }[] = [];

  for (const group of groups) {
    const urls = new Set<string>();
    const ids = new Set<string>();
    collectMediaRefs(group.source, urls, ids);

    const assetIds = new Set<string>();
    for (const id of ids) if (OBJECT_ID.test(id)) assetIds.add(id);

    // Blocks may store only a url (older layouts, background media).
    if (urls.size > 0) {
      const matches = await MediaAsset.find({ url: { $in: [...urls] } })
        .select("_id")
        .lean<any[]>();
      for (const match of matches) assetIds.add(String(match._id));
    }

    if (assetIds.size > 0) resolved.push({ kind: group.kind, assetIds: [...assetIds] });
  }

  // Clear first so removed media loses its record, then re-add what remains.
  await clearMediaUsage(refId);

  for (const group of resolved) {
    await MediaAsset.updateMany(
      { _id: { $in: group.assetIds } },
      { $addToSet: { usage: { kind: group.kind, refId, label } } }
    );
  }
}
