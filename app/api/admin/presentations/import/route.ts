import { unlink } from "node:fs/promises";
import path from "node:path";
import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/access";
import { createPresentation } from "@/lib/presentation-storage";
import { getSession } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { Zine, MediaAsset, Presentation } from "@/lib/models";
import { storeUpload, generateThumbnail, ADMIN_MEDIA_MIME_TYPES } from "@/lib/media-upload";
import { newObject, newSlide, normalizeDeck, type Slide } from "@/lib/presentation";
import { MAX_PDF_BYTES, PdfImportError, renderPdfSlides } from "@/lib/pdf-presentation";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Sign in to import a presentation." }, { status: 401 });
  if (!await checkPermission(session, "publications.manage"))
    return Response.json({ error: "You do not have permission to create presentations." }, { status: 403 });

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const contentLength = Number(request.headers.get("content-length"));
  if (contentLength > MAX_PDF_BYTES + 1024 * 1024)
    return Response.json({ error: "Choose a PDF smaller than 50 MB." }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "Choose a PDF file to import." }, { status: 400 }); }
  const file = form.get("pdf");
  if (!(file instanceof File) || !file.size)
    return Response.json({ error: "Choose a PDF file to import." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES)
    return Response.json({ error: "Choose a PDF smaller than 50 MB." }, { status: 413 });
  const title = (String(form.get("title") || "").trim() || file.name.replace(/\.pdf$/i, "") || "Imported PDF").slice(0, 200);
  const id = String(new Types.ObjectId());
  const assetIds: Types.ObjectId[] = [];
  const files: string[] = [];
  const slides: Slide[] = [];
  let frame = { width: 960, height: 540 };
  let saved = false;
  try {
    await connectDB();
    await renderPdfSlides(new Uint8Array(await file.arrayBuffer()), async (page) => {
      if (page.number === 1) {
        const scale = 960 / Math.max(page.width, page.height);
        frame = { width: Math.max(16, page.width * scale), height: Math.max(16, page.height * scale) };
      }
      const stored = await storeUpload(new File([new Uint8Array(page.png)], `${title}-page-${page.number}.png`, { type: "image/png" }), "media", ADMIN_MEDIA_MIME_TYPES);
      files.push(stored.absolutePath);
      const thumbnail = await generateThumbnail(stored.absolutePath, stored.fileName);
      if (thumbnail) files.push(path.join(process.cwd(), "public", thumbnail.thumbnailUrl));
      const assetId = new Types.ObjectId();
      assetIds.push(assetId);
      await MediaAsset.create({
        _id: assetId, uploadedBy: session.userId, uploadSource: "publications",
        filename: stored.fileName, fileName: stored.fileName, url: stored.url,
        thumbnailUrl: thumbnail?.thumbnailUrl ?? "", width: page.width, height: page.height,
        originalName: stored.originalName, mimeType: stored.mimeType, size: stored.size,
        title: `${title} — Page ${page.number}`, alt: `${title}, page ${page.number}`,
        mediaType: "image", provider: "local",
        usage: [{ kind: "publication", refId: id, label: title }],
      });
      const scale = Math.min(frame.width / page.width, frame.height / page.height);
      const width = page.width * scale, height = page.height * scale;
      slides.push({ ...newSlide(), name: `Page ${page.number}`, objects: [{
        ...newObject("image"), x: (frame.width - width) / 2, y: (frame.height - height) / 2,
        width, height, mediaUrl: stored.url, mediaId: String(assetId), imageFit: "contain",
        imageRatio: page.width / page.height, locked: true, alt: `${title}, page ${page.number}`,
      }] });
    }, request.signal);
    request.signal.throwIfAborted();
    const deck = normalizeDeck({ title, aspect: "custom", pageUnit: "px", customWidth: frame.width, customHeight: frame.height, slides });
    await createPresentation(deck, id);
    saved = true;
    revalidatePath("/admin/presentations");
    return Response.json({ id, pages: slides.length }, { status: 201 });
  } catch (error) {
    if (!saved) {
      await Promise.allSettled([
        Presentation.deleteOne({ _id: id }),
        Zine.deleteOne({ _id: id }),
        MediaAsset.deleteMany({ _id: { $in: assetIds } }),
        ...files.map((filePath) => unlink(filePath)),
      ]);
    }
    return Response.json({ error: error instanceof PdfImportError ? error.message : "The PDF could not be imported. Please try again." }, { status: error instanceof PdfImportError ? 400 : 500 });
  }
}
