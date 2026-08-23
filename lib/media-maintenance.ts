import path from "node:path";

import { connectDB } from "./db";
import { buildMediaUsageIndex } from "./media-usage";
import { generateThumbnail } from "./media-upload";
import { MediaAsset } from "./models";

/**
 * One-off repair jobs for the media library.
 *
 * The hot paths (listing, filtering, the delete guard) all read the stored
 * `usage` array and `thumbnailUrl`, which every save and upload keeps current.
 * These jobs populate both for assets and content that predate that
 * bookkeeping, so nothing needs a migration script.
 */

/** Recompute `usage` for every asset by scanning all site content. */
export async function rebuildMediaUsage(): Promise<{ assets: number; references: number }> {
  await connectDB();

  const index = await buildMediaUsageIndex();
  const assets = await MediaAsset.find().select("_id").lean<any[]>();

  let references = 0;
  const operations = assets.map((asset) => {
    const refs = index[String(asset._id)] ?? [];
    references += refs.length;

    return {
      updateOne: {
        filter: { _id: asset._id },
        update: {
          $set: {
            usage: refs.map((ref) => ({
              kind: ref.kind ?? ref.category,
              refId: ref.refId,
              label: ref.name,
            })),
          },
        },
      },
    };
  });

  // Chunked so a large library does not build one enormous write batch.
  for (let index = 0; index < operations.length; index += 500) {
    await MediaAsset.bulkWrite(operations.slice(index, index + 500));
  }

  return { assets: assets.length, references };
}

/** Generate the missing grid thumbnails for existing local images. */
export async function backfillThumbnails(): Promise<{ created: number; skipped: number }> {
  await connectDB();

  const assets = await MediaAsset.find({
    mediaType: "image",
    provider: "local",
    $or: [{ thumbnailUrl: "" }, { thumbnailUrl: { $exists: false } }],
  })
    .select("url fileName filename")
    .lean<any[]>();

  let created = 0;
  let skipped = 0;

  for (const asset of assets) {
    const url: string = asset.url ?? "";
    if (!url.startsWith("/uploads/")) {
      skipped += 1;
      continue;
    }

    const absolutePath = path.join(process.cwd(), "public", url);
    const fileName = asset.fileName || asset.filename || path.basename(url);

    const thumbnail = await generateThumbnail(absolutePath, fileName);
    if (!thumbnail) {
      skipped += 1;
      continue;
    }

    await MediaAsset.updateOne(
      { _id: asset._id },
      {
        $set: {
          thumbnailUrl: thumbnail.thumbnailUrl,
          width: thumbnail.width,
          height: thumbnail.height,
        },
      }
    );
    created += 1;
  }

  return { created, skipped };
}
