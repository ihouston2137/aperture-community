import type { NextRequest } from "next/server";

import { connectDB } from "@/lib/db";
import { MediaAsset } from "@/lib/models";
import {
  FORM_UPLOAD_MIME_TYPES,
  isAllowedUploadKind,
  mediaTypeForMime,
  storeUpload,
} from "@/lib/media-upload";

/**
 * Public endpoint used by the form shell before submission. It enforces the
 * per-field kind, size and multiple-file rules that the form defines.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();

  const kind = String(formData.get("kind") ?? "any");
  const maxSizeMb = Math.min(100, Math.max(1, Number(formData.get("maxSizeMb") ?? 25)));
  const multiple = String(formData.get("multiple") ?? "false") === "true";

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "No files were uploaded." }, { status: 400 });
  }
  if (!multiple && files.length > 1) {
    return Response.json({ error: "Only one file is allowed here." }, { status: 400 });
  }

  await connectDB();
  const stored: {
    name: string;
    url: string;
    size: number;
    mediaType: string;
  }[] = [];

  for (const file of files) {
    const mimeType = file.type || "application/octet-stream";

    if (!isAllowedUploadKind(mimeType, kind)) {
      return Response.json(
        { error: `This field only accepts ${kind} files.` },
        { status: 400 }
      );
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      return Response.json(
        { error: `Files must be ${maxSizeMb} MB or smaller.` },
        { status: 400 }
      );
    }

    try {
      const result = await storeUpload(file, "forms", FORM_UPLOAD_MIME_TYPES);
      await MediaAsset.create({
        filename: result.fileName,
        fileName: result.fileName,
        url: result.url,
        originalName: result.originalName,
        mimeType: result.mimeType,
        size: result.size,
        title: result.originalName,
        mediaType: mediaTypeForMime(result.mimeType),
        provider: "local",
        usage: [{ kind: "form-upload", label: "Form upload" }],
      });
      stored.push({
        name: result.originalName,
        url: result.url,
        size: result.size,
        // Lets the field show a thumbnail for what can be shown, without the
        // browser having to guess from the file extension.
        mediaType: mediaTypeForMime(result.mimeType),
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Upload failed." },
        { status: 400 }
      );
    }
  }

  return Response.json({ files: stored });
}
