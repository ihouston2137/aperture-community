import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseExternalVideoUrl, type ExternalEmbed } from "./embed-url";
import { UPLOAD_KIND_PREFIXES, isAllowedUploadKind } from "./upload-kinds";

// Re-exported so server callers keep one import site for the upload domain.
export { UPLOAD_KIND_PREFIXES, isAllowedUploadKind };
export { parseExternalVideoUrl };
export type { ExternalEmbed };

/** Upload roots, mirrored under `/public/uploads`. */
export const UPLOAD_FOLDERS = [
  "media",
  "publications",
  "collections",
  "forms",
  "bios",
  "thumbnails",
  "fonts",
] as const;

export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export const ADMIN_MEDIA_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  // Favicons. Browsers send either spelling depending on the platform.
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "video/mp4": ".mp4",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
};

export const FORM_UPLOAD_MIME_TYPES: Record<string, string> = {
  ...ADMIN_MEDIA_MIME_TYPES,
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "audio/ogg": ".ogg",
};


/**
 * Font files, for the design library.
 *
 * Kept apart from the media types because a font is not media: it never
 * belongs in the picker, has no thumbnail, and is only ever reached by the
 * stylesheet. `application/octet-stream` is here because that is what a
 * browser reports for a `.ttf` about as often as it reports `font/ttf` — the
 * extension decides, and `storeFontFile` checks it before this map is built.
 */
export const FONT_UPLOAD_MIME_TYPES: Record<string, string> = {
  "font/ttf": ".ttf",
  "font/otf": ".otf",
  "font/woff": ".woff",
  "font/woff2": ".woff2",
  "application/x-font-ttf": ".ttf",
  "application/x-font-truetype": ".ttf",
  "application/x-font-opentype": ".otf",
  "application/font-woff": ".woff",
  "application/font-woff2": ".woff2",
  "application/vnd.ms-opentype": ".otf",
};

export function mediaTypeForMime(mimeType: string): "image" | "video" | "audio" | "file" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}

function safeBaseName(originalName: string): string {
  return path
    .basename(originalName, path.extname(originalName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export type StoredFile = {
  fileName: string;
  url: string;
  absolutePath: string;
  size: number;
  mimeType: string;
  originalName: string;
};

/**
 * Write an uploaded file into `/public/uploads/<folder>` with a generated name.
 * The stored name never comes from user input, so a crafted filename cannot
 * escape the folder or overwrite an existing asset.
 */
export async function storeUpload(
  file: File,
  folder: UploadFolder,
  allowedMimeTypes: Record<string, string>
): Promise<StoredFile> {
  const mimeType = file.type || "application/octet-stream";
  const extension = allowedMimeTypes[mimeType];
  if (!extension) throw new Error(`Unsupported file type: ${mimeType}`);
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File is larger than 100 MB.");

  const directory = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(directory, { recursive: true });

  const fileName = `${safeBaseName(file.name) || "file"}-${randomBytes(6).toString("hex")}${extension}`;
  const absolutePath = path.join(directory, fileName);

  await writeFile(absolutePath, Buffer.from(await file.arrayBuffer()));

  return {
    fileName,
    url: `/uploads/${folder}/${fileName}`,
    absolutePath,
    size: file.size,
    mimeType,
    originalName: file.name,
  };
}

/* ------------------------------------------------------------- Thumbnails */

export const THUMBNAIL_WIDTH = 400;

export type ThumbnailResult = {
  thumbnailUrl: string;
  width: number;
  height: number;
};

/**
 * Admin grids show hundreds of tiles at a time. Serving the original file for
 * each one is the single largest cost in a large library, so a small WebP
 * derivative is written next to the upload and used for every thumbnail.
 *
 * `sharp` ships with Next.js for image optimization. It is loaded lazily and
 * failures are swallowed: a missing thumbnail just falls back to the original.
 */
export async function generateThumbnail(
  absolutePath: string,
  fileName: string
): Promise<ThumbnailResult | null> {
  if (!/\.(jpe?g|png|webp|gif|avif|tiff?)$/i.test(fileName)) return null;

  try {
    const { default: sharp } = await import("sharp");
    const directory = path.join(process.cwd(), "public", "uploads", "thumbnails");
    await mkdir(directory, { recursive: true });

    const thumbName = `${path.basename(fileName, path.extname(fileName))}.webp`;
    const thumbPath = path.join(directory, thumbName);

    const image = sharp(absolutePath, { failOn: "none" });
    const meta = await image.metadata();

    await image
      .rotate() // honour EXIF orientation
      .resize({ width: THUMBNAIL_WIDTH, withoutEnlargement: true })
      .webp({ quality: 72 })
      .toFile(thumbPath);

    return {
      thumbnailUrl: `/uploads/thumbnails/${thumbName}`,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    };
  } catch {
    return null;
  }
}


