import { connectDB } from "./db";
import { GalleryImage, MediaAsset, Photo } from "./models";
import { mediaTypeForMime } from "./media-upload";

/**
 * Older installs stored images in `Photo` and `GalleryImage`. This folds those
 * records into `MediaAsset` so the media library is the single source of truth.
 * It is idempotent: an asset already pointing at the same URL is left alone.
 */
export async function unifyLegacyMedia(): Promise<{ migrated: number; skipped: number }> {
  await connectDB();

  let migrated = 0;
  let skipped = 0;

  const existing = new Set(
    (await MediaAsset.find().select("url").lean<any[]>()).map((asset) => asset.url)
  );

  const galleryImages = await GalleryImage.find().lean<any[]>();
  for (const image of galleryImages) {
    if (!image.url || existing.has(image.url)) {
      skipped += 1;
      continue;
    }
    await MediaAsset.create({
      filename: image.filename ?? "",
      fileName: image.filename ?? "",
      url: image.url,
      originalName: image.filename ?? image.title ?? "",
      mimeType: guessMimeType(image.url),
      title: image.title ?? "",
      alt: image.alt ?? "",
      caption: image.caption ?? "",
      captureDate: image.captureDate ?? null,
      orientation: image.orientation ?? "",
      isNsfw: Boolean(image.isNsfw),
      tags: Array.isArray(image.tags) ? image.tags : [],
      mediaType: "image",
      provider: "local",
    });
    existing.add(image.url);
    migrated += 1;
  }

  const photos = await Photo.find().lean<any[]>();
  for (const photo of photos) {
    if (!photo.src || existing.has(photo.src)) {
      skipped += 1;
      continue;
    }
    await MediaAsset.create({
      url: photo.src,
      originalName: photo.title ?? "",
      mimeType: guessMimeType(photo.src),
      title: photo.title ?? "",
      alt: photo.alt ?? "",
      caption: photo.place ?? "",
      orientation: photo.orientation ?? "",
      mediaType: "image",
      provider: "local",
    });
    existing.add(photo.src);
    migrated += 1;
  }

  return { migrated, skipped };
}

function guessMimeType(url: string): string {
  const extension = url.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };
  return map[extension] ?? "application/octet-stream";
}

export { mediaTypeForMime };
