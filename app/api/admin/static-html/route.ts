import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { MAX_STATIC_HTML_BYTES, readStaticHtml, validStaticHtmlSlug } from "@/lib/static-html";
import { StaticHtml } from "@/lib/static-html-model";

export async function POST(request: Request) {
  const session = await getSession();
  if (!(await checkPermission(session, "staticHtml.manage"))) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (Number(request.headers.get("content-length")) > MAX_STATIC_HTML_BYTES + 65536) {
    return Response.json({ error: "File is larger than 5 MB." }, { status: 413 });
  }
  let upload;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose an HTML file.");
    upload = await readStaticHtml(file);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid upload." }, { status: 400 });
  }
  await connectDB();
  try {
    await StaticHtml.create({ ...upload, _id: upload.slug, uploadedBy: session!.userId });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
      return Response.json({ error: `The slug “${upload.slug}” already exists. Rename your file before uploading.` }, { status: 409 });
    }
    throw error;
  }
  return Response.json({ slug: upload.slug }, { status: 201 });
}

export async function DELETE(request: Request) {
  if (!(await checkPermission(await getSession(), "staticHtml.manage"))) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  if (!validStaticHtmlSlug(slug)) return Response.json({ error: "Invalid slug." }, { status: 400 });
  await connectDB();
  await StaticHtml.deleteOne({ _id: slug });
  return Response.json({ ok: true });
}
