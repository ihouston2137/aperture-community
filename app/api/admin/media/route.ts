import { unlink } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { MediaAsset } from "@/lib/models";
import {
  buildMediaQuery,
  MEDIA_LIST_PROJECTION,
} from "@/lib/media-query";
import {
  ADMIN_MEDIA_MIME_TYPES,
  generateThumbnail,
  mediaTypeForMime,
  parseExternalVideoUrl,
  storeUpload,
  UPLOAD_FOLDERS,
  type UploadFolder,
} from "@/lib/media-upload";
import { getSession } from "@/lib/session";

/**
 * Paged, filtered media listing.
 *
 * Filters are applied by MongoDB against indexed fields and only one page of
 * projected documents is returned, so the response size stays flat no matter
 * how large the library grows.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.view"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const params = request.nextUrl.searchParams;
  const { filter, skip, limit, page } = buildMediaQuery({
    q: params.get("q"),
    type: params.get("type"),
    use: params.get("use"),
    ref: params.get("ref"),
    page: params.get("page"),
    limit: params.get("limit"),
  });

  const [assets, total] = await Promise.all([
    MediaAsset.find(filter)
      .select(MEDIA_LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<any[]>(),
    MediaAsset.countDocuments(filter),
  ]);

  return Response.json({
    assets: assets.map((asset) => ({
      ...asset,
      _id: String(asset._id),
      // `usage` is the stored, indexed record maintained by every save action.
      usedIn: (asset.usage ?? []).map((entry: any) => ({
        kind: entry.kind,
        refId: entry.refId,
        name: entry.label || entry.kind,
      })),
      usage: undefined,
    })),
    page,
    limit,
    total,
    hasMore: skip + assets.length < total,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.upload"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const formData = await request.formData();

  // External providers register a record without touching the filesystem.
  const externalUrl = String(formData.get("externalUrl") ?? "").trim();
  if (externalUrl) {
    const embed = parseExternalVideoUrl(externalUrl);
    if (!embed) {
      return Response.json(
        { error: "Only YouTube and Vimeo links are supported." },
        { status: 400 }
      );
    }

    // Reuse the existing record when the same embed is submitted twice.
    const existing = await MediaAsset.findOne({
      provider: embed.provider,
      embedUrl: embed.embedUrl,
    }).lean<any>();
    if (existing) {
      return Response.json({ asset: { ...existing, _id: String(existing._id) } });
    }

    const created = await MediaAsset.create({
      title: String(formData.get("title") ?? "") || externalUrl,
      alt: String(formData.get("alt") ?? ""),
      caption: String(formData.get("caption") ?? ""),
      mediaType: "video",
      provider: embed.provider,
      embedUrl: embed.embedUrl,
      url: embed.embedUrl,
      originalName: externalUrl,
    });

    return Response.json({ asset: { ...created.toObject(), _id: String(created._id) } });
  }

  const folderInput = String(formData.get("folder") ?? "media");
  const folder: UploadFolder = UPLOAD_FOLDERS.includes(folderInput as UploadFolder)
    ? (folderInput as UploadFolder)
    : "media";

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "No files were uploaded." }, { status: 400 });
  }

  const created = [];
  for (const file of files) {
    try {
      const stored = await storeUpload(file, folder, ADMIN_MEDIA_MIME_TYPES);
      // Generated up front so admin grids never load the original file.
      const thumbnail = await generateThumbnail(stored.absolutePath, stored.fileName);

      const asset = await MediaAsset.create({
        filename: stored.fileName,
        fileName: stored.fileName,
        url: stored.url,
        thumbnailUrl: thumbnail?.thumbnailUrl ?? "",
        width: thumbnail?.width ?? 0,
        height: thumbnail?.height ?? 0,
        originalName: stored.originalName,
        mimeType: stored.mimeType,
        size: stored.size,
        title: String(formData.get("title") ?? "") || stored.originalName,
        alt: String(formData.get("alt") ?? ""),
        caption: String(formData.get("caption") ?? ""),
        isNsfw: formData.get("isNsfw") === "true",
        mediaType: mediaTypeForMime(stored.mimeType),
        provider: "local",
      });
      created.push({ ...asset.toObject(), _id: String(asset._id), usedIn: [] });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Upload failed." },
        { status: 400 }
      );
    }
  }

  return Response.json({ assets: created });
}

/* ------------------------------------------------------------ Bulk edits */

const BULK_LIMIT = 1000;
const TAG_LIMIT = 50;

/**
 * Apply one set of metadata changes to many assets at once.
 *
 * Only the fields present in `set` are written, so the inspector can leave
 * everything the editor did not opt into untouched. Tags support add/remove as
 * well as replace, because merging is the common intent when tagging a batch.
 */
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.upload"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((id: unknown) => typeof id === "string").slice(0, BULK_LIMIT)
    : [];

  if (ids.length === 0) {
    return Response.json({ error: "No media selected." }, { status: 400 });
  }

  await connectDB();

  const ALLOWED = [
    "title",
    "alt",
    "caption",
    "author",
    "authorBioId",
    "subjectBioId",
    "orientation",
    "isNsfw",
    "captureDate",
  ];

  const set: Record<string, unknown> = {};
  for (const field of ALLOWED) {
    if (body.set && field in body.set) set[field] = body.set[field];
  }

  if ("captureDate" in set) {
    const raw = String(set.captureDate ?? "").trim();
    const parsed = raw ? new Date(raw) : null;
    set.captureDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;

  const tags = body.tags as { mode?: string; values?: unknown } | undefined;
  const tagValues: string[] = Array.isArray(tags?.values)
    ? tags!.values.map((tag: unknown) => String(tag).trim()).filter(Boolean).slice(0, TAG_LIMIT)
    : [];

  if (tags?.mode === "replace") {
    update.$set = { ...(update.$set as object), tags: tagValues };
  } else if (tags?.mode === "add" && tagValues.length > 0) {
    update.$addToSet = { tags: { $each: tagValues } };
  } else if (tags?.mode === "remove" && tagValues.length > 0) {
    update.$pull = { tags: { $in: tagValues } };
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nothing to change." }, { status: 400 });
  }

  const result = await MediaAsset.updateMany({ _id: { $in: ids } }, update);
  return Response.json({ ok: true, matched: result.matchedCount ?? ids.length });
}

/**
 * Bulk delete. Assets still referenced by content are skipped and reported
 * rather than failing the whole request.
 */
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.delete"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, BULK_LIMIT);

  if (ids.length === 0) {
    return Response.json({ error: "No media selected." }, { status: 400 });
  }

  await connectDB();
  const assets = await MediaAsset.find({ _id: { $in: ids } })
    .select("url thumbnailUrl provider usage")
    .lean<any[]>();

  const deletable = assets.filter((asset) => (asset.usage ?? []).length === 0);
  const blocked = assets.filter((asset) => (asset.usage ?? []).length > 0);

  for (const asset of deletable) {
    for (const file of [asset.url, asset.thumbnailUrl]) {
      if (asset.provider === "local" && file?.startsWith("/uploads/")) {
        await unlink(path.join(process.cwd(), "public", file)).catch(() => {});
      }
    }
  }

  if (deletable.length > 0) {
    await MediaAsset.deleteMany({ _id: { $in: deletable.map((asset) => asset._id) } });
  }

  return Response.json({
    ok: true,
    deleted: deletable.length,
    blocked: blocked.length,
  });
}
