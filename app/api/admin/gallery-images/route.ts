import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { MediaAsset } from "@/lib/models";
import { getSession } from "@/lib/session";

/** Bulk metadata editing for the media library grid. */

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.view"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const query = request.nextUrl.searchParams.get("q")?.trim();
  const filter = query
    ? {
        $or: [
          { title: { $regex: query, $options: "i" } },
          { originalName: { $regex: query, $options: "i" } },
          { tags: { $regex: query, $options: "i" } },
        ],
      }
    : {};

  const images = await MediaAsset.find({ ...filter, mediaType: "image" })
    .sort({ createdAt: -1 })
    .limit(1000)
    .lean<any[]>();

  return Response.json({
    images: images.map((image) => ({ ...image, _id: String(image._id) })),
  });
}

export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "media.upload"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const body = await request.json().catch(() => null);
  const updates = Array.isArray(body?.updates) ? body.updates : [];
  if (updates.length === 0) {
    return Response.json({ error: "No updates supplied." }, { status: 400 });
  }

  const ALLOWED = [
    "title",
    "alt",
    "caption",
    "author",
    "authorBioId",
    "subjectBioId",
    "orientation",
    "isNsfw",
    "tags",
    "captureDate",
  ];

  const operations = updates.slice(0, 1000).map((update: Record<string, unknown>) => {
    const set: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in update) set[key] = update[key];
    }
    return {
      updateOne: { filter: { _id: String(update.id ?? update._id) }, update: { $set: set } },
    };
  });

  await MediaAsset.bulkWrite(operations);
  return Response.json({ ok: true, updated: operations.length });
}
