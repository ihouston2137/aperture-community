import { unlink } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { MediaAsset } from "@/lib/models";
import {
  ADMIN_MEDIA_MIME_TYPES,
  generateThumbnail,
  storeUpload,
} from "@/lib/media-upload";
import { getSession } from "@/lib/session";

const TAG_LIMIT = 50;

/** Full record for the inspector; the list projection stays lean. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.view"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const asset = await MediaAsset.findById(id).lean<any>();
  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    asset: {
      ...asset,
      _id: String(asset._id),
      usedIn: (asset.usage ?? []).map((entry: any) => ({
        kind: entry.kind,
        refId: entry.refId,
        name: entry.label || entry.kind,
      })),
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.upload"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const asset = await MediaAsset.findById(id);
  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

  const formData = await request.formData();

  const assign = (field: string, value: unknown) => {
    if (formData.has(field)) asset[field] = value;
  };

  assign("title", String(formData.get("title") ?? ""));
  assign("alt", String(formData.get("alt") ?? ""));
  assign("caption", String(formData.get("caption") ?? ""));
  assign("author", String(formData.get("author") ?? ""));
  assign("authorBioId", String(formData.get("authorBioId") ?? ""));
  assign("subjectBioId", String(formData.get("subjectBioId") ?? ""));
  assign("orientation", String(formData.get("orientation") ?? ""));

  if (formData.has("isNsfw")) asset.isNsfw = formData.get("isNsfw") === "true";

  if (formData.has("captureDate")) {
    const raw = String(formData.get("captureDate") ?? "").trim();
    const parsed = raw ? new Date(raw) : null;
    asset.captureDate = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }

  if (formData.has("tags")) {
    asset.tags = String(formData.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, TAG_LIMIT);
  }

  // A replacement file must keep the same MIME type so every existing
  // reference to this asset stays valid.
  const replacement = formData.get("file");
  if (replacement instanceof File && replacement.size > 0) {
    if (replacement.type !== asset.mimeType) {
      return Response.json(
        { error: `Replacement must be the same type (${asset.mimeType}).` },
        { status: 400 }
      );
    }

    const stored = await storeUpload(replacement, "media", ADMIN_MEDIA_MIME_TYPES);
    const thumbnail = await generateThumbnail(stored.absolutePath, stored.fileName);
    const previous = [asset.url, asset.thumbnailUrl];

    asset.filename = stored.fileName;
    asset.fileName = stored.fileName;
    asset.url = stored.url;
    asset.thumbnailUrl = thumbnail?.thumbnailUrl ?? "";
    asset.width = thumbnail?.width ?? 0;
    asset.height = thumbnail?.height ?? 0;
    asset.size = stored.size;
    asset.originalName = stored.originalName;

    for (const file of previous) {
      if (file?.startsWith("/uploads/")) {
        await unlink(path.join(process.cwd(), "public", file)).catch(() => {});
      }
    }
  }

  await asset.save();
  return Response.json({ asset: { ...asset.toObject(), _id: String(asset._id) } });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.delete"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const asset = await MediaAsset.findById(id);
  if (!asset) return Response.json({ error: "Not found" }, { status: 404 });

  // Only unused assets can be deleted, so nothing on the site breaks silently.
  // This reads the asset's own stored `usage`, which every save action keeps in
  // sync — an O(1) check on the document already loaded, rather than a scan of
  // all site content.
  const usedIn: { label?: string; kind: string }[] = asset.usage ?? [];
  if (usedIn.length > 0) {
    return Response.json(
      {
        error: `This asset is still used by: ${usedIn
          .map((entry) => entry.label || entry.kind)
          .join(", ")}. Remove it there first.`,
      },
      { status: 409 }
    );
  }

  for (const file of [asset.url, asset.thumbnailUrl]) {
    if (asset.provider === "local" && file?.startsWith("/uploads/")) {
      await unlink(path.join(process.cwd(), "public", file)).catch(() => {});
    }
  }

  await MediaAsset.findByIdAndDelete(id);
  return Response.json({ ok: true });
}
