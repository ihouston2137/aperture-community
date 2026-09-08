import { NextResponse } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeDocBlocks, type DocBlock } from "@/lib/doc-layout";
import { serializeMarkdown, type FrontMatter } from "@/lib/doc-markdown";
import { buildDocTree, getDocSetById, listDocs, type DocNode } from "@/lib/docs";
import { DocPage } from "@/lib/models";
import { getSession } from "@/lib/session";
import { NOT_DELETED } from "@/lib/soft-delete";

/**
 * A whole documentation set as one markdown file.
 *
 * The zip export beside this is for moving the documents — one file each, the
 * hierarchy as folders, ready to be read back. This is for reading: a guide as
 * a single document somebody can scroll, print, hand to somebody, or paste
 * somewhere that takes markdown.
 *
 * So the pages become sections of one document rather than files with front
 * matter of their own. Each page's title becomes a heading at the depth it sits
 * at in the tree, and the headings *inside* it are pushed down by the same
 * amount — otherwise a `##` written inside a third-level page would outrank the
 * page it is in, and the whole thing would read as flat.
 */

/** The deepest a heading can go; below this markdown has nothing left to say. */
const MAX_HEADING = 6;

/**
 * A page's blocks, with its headings pushed down to sit under its title.
 *
 * Everything that can hold a heading is walked, so a heading inside a quote
 * moves with the rest rather than staying where it was.
 */
function shiftHeadings(blocks: DocBlock[], by: number): DocBlock[] {
  if (by <= 0) return blocks;

  return blocks.map((block) => {
    const moved: DocBlock = { ...block };

    if (block.type === "heading") {
      moved.level = Math.min(MAX_HEADING, (block.level ?? 2) + by) as DocBlock["level"];
    }
    if (block.blocks) moved.blocks = shiftHeadings(block.blocks, by);
    if (block.items) {
      moved.items = block.items.map((item) => ({
        ...item,
        children: shiftHeadings(item.children ?? [], by),
      }));
    }

    return moved;
  });
}

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

  // `getDocSetById` leaves out anything in the bin, so a deleted set cannot be
  // read back out through here.
  const set = await getDocSetById(id);
  if (!set) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const pages = await DocPage.find({ documentationId: id, ...NOT_DELETED }).lean<any[]>();
  const byId = new Map(pages.map((doc) => [String(doc._id), doc]));

  const parts: string[] = [];

  const walk = (nodes: DocNode[], depth: number) => {
    for (const node of nodes) {
      const doc = byId.get(node._id);
      if (!doc) continue;

      // The set's own title is the document's `#`, so its top pages are `##`.
      const level = Math.min(MAX_HEADING, depth + 2);
      parts.push(`${"#".repeat(level)} ${doc.title ?? "Untitled"}`);

      if (doc.description) parts.push(`_${doc.description}_`);

      const body = serializeMarkdown(
        shiftHeadings(normalizeDocBlocks(doc.content), level - 1)
      ).trim();
      if (body) parts.push(body);

      walk(node.children, depth + 1);
    }
  };

  walk(buildDocTree(await listDocs(id)), 0);

  /*
   * The set's own front matter, and its title as the document's one `#`.
   *
   * Front matter rather than nothing, so that a file exported today can be
   * recognised — and re-imported — as the set it came from rather than as an
   * anonymous piece of markdown.
   */
  const frontMatter: FrontMatter = {
    title: set.title,
    slug: set.slug,
    status: set.status,
    description: set.description,
  };

  const document =
    serializeMarkdown([], frontMatter) +
    `# ${set.title}\n\n` +
    (set.description ? `${set.description}\n\n` : "") +
    parts.join("\n\n") +
    "\n";

  const name = `${set.slug || "documentation"}.md`;

  return new NextResponse(document, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      // A download of what is there now, never a copy of what was.
      "Cache-Control": "no-store",
    },
  });
}
