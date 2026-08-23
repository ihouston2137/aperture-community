"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeDocBlocks, stripInlineMarkdown } from "@/lib/doc-layout";
import { parseMarkdown } from "@/lib/doc-markdown";
import { DocPage, Documentation } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("docs.manage");
  await connectDB();
}

/** The block list travels as JSON in a hidden field; a bad one becomes empty. */
function parseJson(value: FormDataEntryValue | null): unknown {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function tagList(value: FormDataEntryValue | null): string[] {
  return [
    ...new Set(
      String(value ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    ),
  ];
}

export async function saveDocAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const documentationId = String(formData.get("documentationId") ?? "").trim();
  if (!documentationId) return;

  const slug = await uniqueDocSlug(
    documentationId,
    String(formData.get("slug") ?? "") || slugify(title),
    title,
    id
  );

  const parentId = String(formData.get("parentId") ?? "").trim();
  const order = Number(formData.get("order") ?? 0);

  const payload = {
    documentationId,
    title,
    slug,
    status: formData.get("status") === "published" ? "published" : "draft",
    description: String(formData.get("description") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    tags: tagList(formData.get("tags")),
    // A document cannot be its own parent, which would strand it out of the
    // tree and spin any walk over it.
    parentId: parentId === id ? "" : parentId,
    order: Number.isFinite(order) ? Math.floor(order) : 0,
    content: normalizeDocBlocks(parseJson(formData.get("content"))),
    frontMatter: (parseJson(formData.get("frontMatter")) ?? {}) as Record<string, string>,
    templateId: String(formData.get("templateId") ?? "").trim(),
  };

  let docId = id;
  if (id) {
    await DocPage.findByIdAndUpdate(id, payload);
  } else {
    const created = await DocPage.create(payload);
    docId = String(created._id);
  }

  revalidatePath(`/admin/docs/${documentationId}`);
  revalidatePath("/docs", "layout");
  redirect(`/admin/docs/${documentationId}/pages/${docId}/edit?saved=1`);
}

export async function deleteDocAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  const documentationId = String(formData.get("documentationId") ?? "").trim();
  if (!id) return;

  // Children are lifted to the root of their set rather than deleted with the
  // parent: losing a section heading should not silently take its pages too.
  await DocPage.updateMany({ parentId: id }, { $set: { parentId: "" } });
  await DocPage.findByIdAndDelete(id);

  revalidatePath(`/admin/docs/${documentationId}`);
  revalidatePath("/docs", "layout");
  redirect(`/admin/docs/${documentationId}`);
}

/** A page's slug has to be unique inside its set, not across the site. */
async function uniqueDocSlug(
  documentationId: string,
  desired: string,
  fallback: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(desired) || slugify(fallback) || "page";

  const query: Record<string, unknown> = { documentationId, slug: base };
  if (excludeId) query._id = { $ne: excludeId };

  const clash = await DocPage.exists(query);
  return clash ? `${base}-${Date.now().toString(36).slice(-4)}` : base;
}

/**
 * Creates documents from uploaded markdown files.
 *
 * One file is one page, which is how every documentation system works and why a
 * document exports back to exactly one `.md`. Several files can arrive at once,
 * and a file uploaded from inside a folder becomes a child of a document
 * standing for that folder — so a directory of markdown lands as a tree rather
 * than a flat pile.
 */
export async function importDocsAction(formData: FormData) {
  await guard();

  const files = formData.getAll("files").filter(
    (entry): entry is File => entry instanceof File && entry.size > 0
  );
  if (files.length === 0) return;

  const documentationId = String(formData.get("documentationId") ?? "").trim();
  if (!documentationId) return;

  const rootParent = String(formData.get("parentId") ?? "").trim();

  // Folder path -> the document standing for it, so siblings from one directory
  // share a parent instead of each creating their own.
  const folders = new Map<string, string>();

  const folderDoc = async (path: string): Promise<string> => {
    if (!path) return rootParent;
    const known = folders.get(path);
    if (known) return known;

    const segments = path.split("/");
    const name = segments[segments.length - 1];
    const parentId = await folderDoc(segments.slice(0, -1).join("/"));

    const title = titleFromName(name);
    const created = await DocPage.create({
      documentationId,
      title,
      slug: await uniqueDocSlug(documentationId, slugify(title), title),
      status: "draft",
      parentId,
      order: folders.size,
      content: [],
    });

    const id = String(created._id);
    folders.set(path, id);
    return id;
  };

  let created = 0;
  let firstId = "";

  // Sorted so a folder's own index file is seen before its siblings, and so the
  // order documents arrive in is the order they appear on disk.
  const sorted = [...files].sort((a, b) => relativePath(a).localeCompare(relativePath(b)));

  for (const [index, file] of sorted.entries()) {
    const path = relativePath(file);
    const segments = path.split("/");
    const name = segments.pop() ?? file.name;
    const parentId = await folderDoc(segments.join("/"));

    const source = await file.text();
    const { frontMatter, blocks } = parseMarkdown(source);

    const bare = name.replace(/\.(md|markdown)$/i, "");
    const title = frontMatter.title || titleFromName(bare);

    // Front matter claims what it can; the rest is kept for export.
    const claimed = ["title", "slug", "status", "description", "tags", "category"];
    const rest: Record<string, string> = {};
    for (const [key, value] of Object.entries(frontMatter)) {
      if (!claimed.includes(key)) rest[key] = value;
    }

    const doc = await DocPage.create({
      documentationId,
      title,
      slug: await uniqueDocSlug(
        documentationId,
        frontMatter.slug || slugify(title),
        title
      ),
      status: frontMatter.status === "published" ? "published" : "draft",
      description: frontMatter.description ?? "",
      category: frontMatter.category ?? "",
      tags: frontMatter.tags
        ? frontMatter.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [],
      parentId,
      order: index,
      content: blocks,
      frontMatter: rest,
      sourceFilename: name,
    });

    created += 1;
    if (!firstId) firstId = String(doc._id);
  }

  revalidatePath(`/admin/docs/${documentationId}`);
  revalidatePath("/docs", "layout");

  // One file lands you in it; a batch lands you in the set to arrange them.
  if (created === 1 && firstId) {
    redirect(`/admin/docs/${documentationId}/pages/${firstId}/edit?imported=1`);
  }
  redirect(`/admin/docs/${documentationId}?imported=${created}`);
}

/** `getting-started.md` reads better as "Getting started". */
function titleFromName(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  if (!words) return "Untitled document";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Where a file sat in the upload.
 *
 * A folder upload sets `webkitRelativePath`, which the File type does not
 * declare; without it every file looks like a root-level one.
 */
function relativePath(file: File): string {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  // The first segment is the chosen folder itself, which is the root here.
  return (path || file.name).split("/").slice(1).join("/") || file.name;
}

/**
 * Turns one long document into a page per section.
 *
 * The editorial answer to "this should not all be one page": each top-level
 * heading becomes a real child document — addressable, editable and exportable
 * on its own — rather than a fold applied at render time. The original keeps
 * whatever came before the first heading, so an introduction is not lost.
 */
export async function splitDocIntoPagesAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const doc = await DocPage.findById(id).lean<any>();
  if (!doc) return;

  const documentationId = String(doc.documentationId ?? "");
  const blocks = normalizeDocBlocks(doc.content);

  // The level the author actually divided by: the shallowest that repeats.
  const counts = new Map<number, number>();
  for (const block of blocks) {
    if (block.type !== "heading") continue;
    const level = block.level ?? 2;
    counts.set(level, (counts.get(level) ?? 0) + 1);
  }
  const level = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([entry]) => entry)
    .sort((a, b) => a - b)[0];

  // Nothing repeats, so there is nothing to divide — leave it alone.
  if (!level) return;

  const lead: typeof blocks = [];
  const sections: { title: string; blocks: typeof blocks }[] = [];

  for (const block of blocks) {
    if (block.type === "heading" && (block.level ?? 2) <= level) {
      sections.push({ title: stripInlineMarkdown(block.text ?? ""), blocks: [] });
      continue;
    }
    if (sections.length === 0) lead.push(block);
    else sections[sections.length - 1].blocks.push(block);
  }

  if (sections.length === 0) return;

  const existing = await DocPage.countDocuments({ parentId: id });

  for (const [index, section] of sections.entries()) {
    const title = section.title || `Section ${index + 1}`;
    await DocPage.create({
      documentationId,
      title,
      slug: await uniqueDocSlug(documentationId, slugify(title), title),
      status: doc.status ?? "draft",
      parentId: id,
      order: existing + index,
      content: section.blocks,
    });
  }

  // The original becomes the section's landing page, holding its introduction.
  await DocPage.findByIdAndUpdate(id, { $set: { content: lead } });

  revalidatePath(`/admin/docs/${documentationId}`);
  revalidatePath("/docs", "layout");
  redirect(`/admin/docs/${documentationId}?split=${sections.length}`);
}

/** Moves a document within the tree. */
export async function moveDocAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  const direction = String(formData.get("direction") ?? "");
  if (!id) return;

  const doc = await DocPage.findById(id).lean<any>();
  if (!doc) return;

  const documentationId = String(doc.documentationId ?? "");
  const parentId = String(doc.parentId ?? "");

  if (direction === "up" || direction === "down") {
    const siblings = await DocPage.find({ documentationId, parentId })
      .sort({ order: 1, title: 1 })
      .lean<any[]>();

    const position = siblings.findIndex((entry) => String(entry._id) === id);
    const target = direction === "up" ? position - 1 : position + 1;
    if (position < 0 || target < 0 || target >= siblings.length) return;

    // Rewritten as a dense sequence, so an imported or hand-edited set with
    // duplicate orders settles into something a swap can act on.
    const reordered = [...siblings];
    [reordered[position], reordered[target]] = [reordered[target], reordered[position]];

    await Promise.all(
      reordered.map((entry, index) =>
        DocPage.findByIdAndUpdate(entry._id, { $set: { order: index } })
      )
    );
  }

  if (direction === "out" && parentId) {
    const parent = await DocPage.findById(parentId).select("parentId").lean<any>();
    await DocPage.findByIdAndUpdate(id, {
      $set: { parentId: String(parent?.parentId ?? "") },
    });
  }

  if (direction === "in") {
    // A document becomes a child of the sibling directly above it, which is how
    // an outline indents.
    const siblings = await DocPage.find({ documentationId, parentId })
      .sort({ order: 1, title: 1 })
      .lean<any[]>();
    const position = siblings.findIndex((entry) => String(entry._id) === id);
    if (position <= 0) return;

    await DocPage.findByIdAndUpdate(id, {
      $set: { parentId: String(siblings[position - 1]._id) },
    });
  }

  revalidatePath(`/admin/docs/${documentationId}`);
  revalidatePath("/docs", "layout");
}

/* ------------------------------------------------------- Documentation sets */

export async function saveDocSetAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const payload = {
    title,
    slug: await uniqueSlug(
      Documentation,
      String(formData.get("slug") ?? "") || slugify(title),
      title,
      id || undefined
    ),
    status: formData.get("status") === "published" ? "published" : "draft",
    description: String(formData.get("description") ?? "").trim(),
    templateId: String(formData.get("templateId") ?? "").trim(),
  };

  let setId = id;
  if (id) {
    await Documentation.findByIdAndUpdate(id, payload);
  } else {
    const created = await Documentation.create(payload);
    setId = String(created._id);
  }

  revalidatePath("/admin/docs");
  revalidatePath("/docs", "layout");
  redirect(`/admin/docs/${setId}?saved=1`);
}

export async function deleteDocSetAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  // A page outside a set is unreachable, so the set's pages go with it. This is
  // the one delete here that is not recoverable by re-parenting.
  await DocPage.deleteMany({ documentationId: id });
  await Documentation.findByIdAndDelete(id);

  revalidatePath("/admin/docs");
  revalidatePath("/docs", "layout");
  redirect("/admin/docs");
}
