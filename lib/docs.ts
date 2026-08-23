import {
  emptyColorOverrides,
  normalizeColorOverrides,
  type ColorOverrides,
} from "./color-overrides";
import { connectDB } from "./db";
import { docHeadings, normalizeDocBlocks } from "./doc-layout";
import {
  defaultDocTemplateLayout,
  normalizeDocTemplateLayout,
} from "./doc-template-layout";
import {
  buildDocTree,
  docTrail,
  flattenDocTree,
  type DocNode,
  type DocSetSummary,
  type DocSummary,
  type DocView,
} from "./doc-tree";
import { DocPage, DocTemplate, Documentation } from "./models";
import type { PageRow } from "./page-layout";

/**
 * Loading documentation from the database.
 *
 * The shapes and the tree arithmetic live in `./doc-tree`, which carries no
 * database import and so is safe for client components; they are re-exported
 * here so a server module has one place to reach for.
 */
export * from "./doc-tree";

function toSetSummary(doc: Record<string, any>): DocSetSummary {
  return {
    _id: String(doc._id),
    title: doc.title ?? "",
    slug: doc.slug ?? "",
    status: doc.status === "published" ? "published" : "draft",
    description: doc.description ?? "",
    order: Number.isFinite(doc.order) ? Number(doc.order) : 0,
    templateId: String(doc.templateId ?? ""),
  };
}

function toSummary(doc: Record<string, any>): DocSummary {
  return {
    _id: String(doc._id),
    documentationId: String(doc.documentationId ?? ""),
    title: doc.title ?? "",
    slug: doc.slug ?? "",
    status: doc.status === "published" ? "published" : "draft",
    description: doc.description ?? "",
    parentId: String(doc.parentId ?? ""),
    order: Number.isFinite(doc.order) ? Number(doc.order) : 0,
  };
}

/* --------------------------------------------------------------- Loading */

export async function listDocSets(publishedOnly = false): Promise<DocSetSummary[]> {
  await connectDB();
  const filter = publishedOnly ? { status: "published" } : {};
  const sets = await Documentation.find(filter)
    .sort({ order: 1, title: 1 })
    .lean<any[]>();
  return sets.map(toSetSummary);
}

export async function getDocSetById(id: string): Promise<DocSetSummary | null> {
  await connectDB();
  const set = await Documentation.findById(id).lean<any>();
  return set ? toSetSummary(set) : null;
}

export async function getDocSetBySlug(slug: string): Promise<DocSetSummary | null> {
  await connectDB();
  const set = await Documentation.findOne({ slug }).lean<any>();
  return set ? toSetSummary(set) : null;
}

export async function listDocs(
  documentationId: string,
  publishedOnly = false
): Promise<DocSummary[]> {
  await connectDB();
  const filter: Record<string, unknown> = { documentationId };
  if (publishedOnly) filter.status = "published";

  const docs = await DocPage.find(filter)
    .select("documentationId title slug status description parentId order")
    .sort({ order: 1, title: 1 })
    .lean<any[]>();
  return docs.map(toSummary);
}

/** One page of one set. Slugs are unique per set, so both are needed. */
export async function getDocBySlug(documentationId: string, slug: string) {
  await connectDB();
  return DocPage.findOne({ documentationId, slug }).lean<any>();
}

/** The set's tree, which is what a contents rail renders. */
export async function docTree(
  documentationId: string,
  publishedOnly = true
): Promise<DocNode[]> {
  return buildDocTree(await listDocs(documentationId, publishedOnly));
}

export async function toDocView(
  doc: Record<string, any>,
  set: DocSetSummary
): Promise<DocView> {
  // Navigation is scoped to the set: a reader moves within the documentation
  // they are reading, never across into another set's pages.
  const summaries = await listDocs(set._id, true);
  const flat = flattenDocTree(buildDocTree(summaries));
  const position = flat.findIndex((entry) => entry._id === String(doc._id));
  const content = normalizeDocBlocks(doc.content);

  return {
    _id: String(doc._id),
    title: doc.title ?? "",
    slug: doc.slug ?? "",
    status: doc.status === "published" ? "published" : "draft",
    description: doc.description ?? "",
    category: doc.category ?? "",
    tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : "",
    content,
    headings: docHeadings(content),
    set,
    trail: docTrail(summaries, String(doc._id)),
    previous: position > 0 ? flat[position - 1] : null,
    next: position >= 0 && position < flat.length - 1 ? flat[position + 1] : null,
  };
}

/** The page a set opens on: the first in its reading order. */
export async function firstDocOfSet(
  documentationId: string,
  publishedOnly = true
): Promise<DocSummary | null> {
  const flat = flattenDocTree(
    buildDocTree(await listDocs(documentationId, publishedOnly))
  );
  return flat[0] ?? null;
}

/* -------------------------------------------------------------- Templates */

export type ResolvedDocTemplate = { layout: PageRow[]; colors: ColorOverrides };

/**
 * The template a set renders through: the one it names, else the default, else
 * the built-in layout. Same order stories use.
 */
export async function resolveDocTemplate(
  templateId: string | undefined
): Promise<ResolvedDocTemplate> {
  await connectDB();

  const doc = templateId
    ? await DocTemplate.findById(templateId).lean<any>()
    : await DocTemplate.findOne({ isDefault: true }).lean<any>();

  if (!doc) {
    return { layout: defaultDocTemplateLayout(), colors: emptyColorOverrides };
  }

  return {
    layout: normalizeDocTemplateLayout(doc.layout),
    colors: normalizeColorOverrides(doc.colors),
  };
}
