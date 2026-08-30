import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import type { ReadableOptions } from "node:stream";

import { resolveImageLabel } from "@/lib/analytics/image-label";
import { recordHit } from "@/lib/analytics/record";
import { decodeMediaToken, PROTECTED_MEDIA_ROOTS } from "@/lib/protected-media-url";

/**
 * Serves local media from the two allowed roots under `/public`. Everything
 * public-facing links here instead of the raw file so we control path safety,
 * range requests, ETags and caching in one place.
 */

const PUBLIC_DIR = path.join(process.cwd(), "public");

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  // Design-library fonts. Served from here like everything else under
  // `/uploads`, so the path checks and cache headers are the same ones.
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function nodeStreamToWeb(filePath: string, options?: ReadableOptions & { start?: number; end?: number }) {
  const stream = createReadStream(filePath, options);
  return new ReadableStream({
    start(controller) {
      stream.on("data", (chunk) =>
        controller.enqueue(new Uint8Array(chunk as Buffer))
      );
      stream.on("end", () => controller.close());
      stream.on("error", (error) => controller.error(error));
    },
    cancel() {
      stream.destroy();
    },
  });
}

/**
 * Counts a download, when the link said it was one.
 *
 * The same file backs both the picture on screen and the copy taken away, so
 * the URL alone cannot tell them apart — `dl=1`, which only the download link
 * carries, is the distinction. Awaited rather than left dangling: a serverless
 * instance can be frozen the moment the response is returned, and a floating
 * promise is a hit that is sometimes recorded.
 *
 * Never mints identity cookies. This response is cached, and a `Set-Cookie` on
 * a cacheable response hands one visitor's id to the next reader of the file.
 */
async function countDownload(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("dl") !== "1") return;

  // A ranged fetch arrives in pieces; only the piece that starts the file
  // counts, or one download would be counted once per chunk.
  const range = request.headers.get("range");
  if (range && !/^bytes=0-/.test(range.trim())) return;

  try {
    const label = await resolveImageLabel(
      params.get("c") ?? "",
      params.get("m") ?? ""
    );
    if (!label) return;

    await recordHit(request, {
      kind: "download",
      path: request.nextUrl.pathname,
      label,
    });
  } catch {
    // A file the visitor asked for must be served whether or not it counted.
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("i");
  if (!token) return new Response("Missing media token", { status: 400 });

  const decoded = decodeMediaToken(token);
  if (!decoded) return new Response("Bad media token", { status: 400 });

  // Only the two allowed roots, and never a traversal out of them.
  if (!PROTECTED_MEDIA_ROOTS.some((root) => decoded.startsWith(root))) {
    return new Response("Forbidden", { status: 403 });
  }

  const absolute = path.join(PUBLIC_DIR, decoded);
  const normalized = path.normalize(absolute);
  if (!normalized.startsWith(PUBLIC_DIR + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  let info;
  try {
    info = await stat(normalized);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!info.isFile()) return new Response("Not found", { status: 404 });

  // Before the 304 branch: a copy taken from the browser cache is still a copy
  // taken, and the file has been proven to exist by this point.
  await countDownload(request);

  const contentType =
    MIME_TYPES[path.extname(normalized).toLowerCase()] || "application/octet-stream";
  const etag = `"${createHash("sha1")
    .update(`${normalized}:${info.size}:${info.mtimeMs}`)
    .digest("hex")}"`;

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  // Uploaded files carry a random suffix and are never rewritten in place —
  // replacing an asset writes a new name — so they can be cached immutably.
  // `/images/**` is hand-managed, so it keeps a conservative TTL.
  const immutable = decoded.startsWith("/uploads/");
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType,
    ETag: etag,
    "Accept-Ranges": "bytes",
    "Cache-Control": immutable
      ? "public, max-age=31536000, immutable"
      : "public, max-age=3600, stale-while-revalidate=86400",
    "Last-Modified": new Date(info.mtimeMs).toUTCString(),
  };

  // Range requests keep video and audio scrubbing responsive.
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : info.size - 1;

      if (
        Number.isNaN(start) ||
        Number.isNaN(end) ||
        start > end ||
        start >= info.size
      ) {
        return new Response("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${info.size}` },
        });
      }

      const safeEnd = Math.min(end, info.size - 1);
      return new Response(nodeStreamToWeb(normalized, { start, end: safeEnd }), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${start}-${safeEnd}/${info.size}`,
          "Content-Length": String(safeEnd - start + 1),
        },
      });
    }
  }

  return new Response(nodeStreamToWeb(normalized), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(info.size) },
  });
}
