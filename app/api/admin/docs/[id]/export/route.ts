import { NextResponse } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeDocBlocks } from "@/lib/doc-layout";
import { serializeMarkdown, type FrontMatter } from "@/lib/doc-markdown";
import { DocPage } from "@/lib/models";
import { getSession } from "@/lib/session";

/**
 * One document as a `.md` file.
 *
 * Front matter is rebuilt from the fields that claimed it on import, with any
 * unrecognised keys put back, so a file exported after a round trip is the file
 * that went in.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!(await checkPermission(session, "docs.manage"))) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const { id } = await params;
  await connectDB();

  const doc = await DocPage.findById(id).lean<any>();
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const frontMatter: FrontMatter = {
    title: doc.title ?? "",
    slug: doc.slug ?? "",
    status: doc.status ?? "draft",
    description: doc.description ?? "",
    category: doc.category ?? "",
    tags: Array.isArray(doc.tags) ? doc.tags.join(", ") : "",
    // Whatever the importer did not claim, exactly as it was found.
    ...((doc.frontMatter ?? {}) as FrontMatter),
  };

  const markdown = serializeMarkdown(normalizeDocBlocks(doc.content), frontMatter);
  const filename = `${doc.slug || "document"}.md`;

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
