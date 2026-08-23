/**
 * What each upload kind accepts.
 *
 * Split out from `lib/media-upload.ts` so a client component can build a file
 * picker's `accept` list from the same rules the server validates against —
 * that module reaches for `node:fs` and cannot cross into the browser bundle.
 */

export const UPLOAD_KIND_PREFIXES: Record<string, string[]> = {
  image: ["image/"],
  video: ["video/"],
  audio: ["audio/"],
  document: ["application/", "text/"],
  any: ["image/", "video/", "audio/", "application/", "text/"],
};

export function isAllowedUploadKind(mimeType: string, kind: string): boolean {
  const prefixes = UPLOAD_KIND_PREFIXES[kind] ?? UPLOAD_KIND_PREFIXES.any;
  return prefixes.some((prefix) => mimeType.startsWith(prefix));
}

const EXTENSIONS: Record<string, string[]> = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg", "bmp"],
  video: ["mp4", "webm", "mov", "m4v", "ogv"],
  audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac"],
};

/**
 * What a stored file is, judged from its path.
 *
 * A submission keeps only the URLs of what was attached, so the extension is
 * all there is to go on — unlike an upload in flight, which carries its MIME
 * type. Anything unrecognised is a plain file, which only costs it a thumbnail.
 */
export function mediaTypeForPath(url: string): "image" | "video" | "audio" | "file" {
  const extension = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  for (const [type, list] of Object.entries(EXTENSIONS)) {
    if (list.includes(extension)) return type as "image" | "video" | "audio";
  }
  return "file";
}
