import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import {
  ADMIN_MEDIA_MIME_TYPES,
  mediaTypeForMime,
  storeUpload,
} from "@/lib/media-upload";
import { MediaAsset } from "@/lib/models";
import { getSession } from "@/lib/session";

/** Only what a headshot can sensibly be, and only as big as one needs to be. */
const HEADSHOT_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ADMIN_MEDIA_MIME_TYPES["image/jpeg"],
  "image/png": ADMIN_MEDIA_MIME_TYPES["image/png"],
  "image/webp": ADMIN_MEDIA_MIME_TYPES["image/webp"],
};

const MAX_HEADSHOT_BYTES = 8 * 1024 * 1024;

/**
 * A member uploading their own headshot.
 *
 * The admin media library is behind `media.view`, which most membership levels
 * do not hold, so this is the one narrow way in: one image, straight onto the
 * member's own profile. It grants nothing else — the asset is stored and its id
 * returned, and the profile is only changed by the action that saves the form.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!(await checkPermission(session, "community.profile"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No image was uploaded." }, { status: 400 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!HEADSHOT_MIME_TYPES[mimeType]) {
    return Response.json(
      { error: "A headshot must be a JPEG, PNG or WebP image." },
      { status: 400 }
    );
  }
  if (file.size > MAX_HEADSHOT_BYTES) {
    return Response.json({ error: "Images must be 8 MB or smaller." }, { status: 400 });
  }

  await connectDB();

  try {
    const result = await storeUpload(file, "bios", HEADSHOT_MIME_TYPES);
    const asset = await MediaAsset.create({
      filename: result.fileName,
      fileName: result.fileName,
      url: result.url,
      originalName: result.originalName,
      mimeType: result.mimeType,
      size: result.size,
      title: result.originalName,
      mediaType: mediaTypeForMime(result.mimeType),
      provider: "local",
      usage: [{ kind: "bio-headshot", label: "Member headshot" }],
    });

    return Response.json({ url: result.url, mediaId: String(asset._id) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: 400 }
    );
  }
}
