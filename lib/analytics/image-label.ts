import { connectDB } from "@/lib/db";
import { Collection, MediaAsset } from "@/lib/models";

/**
 * The name an image event is reported under: `Collection Name - Image Title`.
 *
 * Always built here, from the stored records, and never taken from the request.
 * A client that could send the label could write any row it liked into a
 * report — including one impersonating a real page — so the routes send ids and
 * this resolves them.
 *
 * Shared by the beacon (image views) and the media route (downloads) so the two
 * cannot report the same picture under two different names.
 */

function isObjectId(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

export async function resolveImageLabel(
  collectionRef: string,
  mediaId: string
): Promise<string> {
  if (!collectionRef || !mediaId) return "";

  try {
    await connectDB();

    const [collection, media] = await Promise.all([
      Collection.findOne(
        {
          $or: [
            { slug: collectionRef },
            ...(isObjectId(collectionRef) ? [{ _id: collectionRef }] : []),
          ],
        },
        { name: 1 }
      ).lean<any>(),
      isObjectId(mediaId)
        ? MediaAsset.findById(mediaId, { title: 1, alt: 1, originalName: 1 }).lean<any>()
        : null,
    ]);

    // An unknown collection means the reference was wrong or forged; either way
    // there is nothing to report it under.
    if (!collection?.name) return "";

    // An untitled image still needs a name to be counted under — the filename
    // is the last thing that identifies it to whoever reads the report.
    const image =
      media?.title || media?.alt || media?.originalName || "Untitled image";

    return `${collection.name} - ${image}`.slice(0, 200);
  } catch {
    return "";
  }
}
