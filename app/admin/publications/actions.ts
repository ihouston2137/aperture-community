"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { getSession } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import { Zine } from "@/lib/models";
import { sanitizeMediaPath } from "@/lib/protected-media-url";
import {
  normalizeAudio,
  normalizeCanvasSize,
  normalizePageTemplates,
  normalizePublicationPages,
  normalizeRepeatedBlocks,
  normalizeSlideshow,
  publicationHref,
  PUBLICATION_KINDS,
  TRANSITIONS,
  type PublicationKind,
  type Transition,
} from "@/lib/publication-layout";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("publications.manage");
  await connectDB();
}

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
}

export async function createPublicationAction(formData: FormData) {
  await guard();

  const title = String(formData.get("title") ?? "").trim();
  const kindInput = String(formData.get("kind") ?? "zine");
  const kind: PublicationKind = PUBLICATION_KINDS.includes(kindInput as PublicationKind)
    ? (kindInput as PublicationKind)
    : "zine";

  if (!title) return;

  const slug = await uniqueSlug(Zine, slugify(title), title);
  const created = await Zine.create({ title, slug, kind, status: "draft", pages: [] });

  revalidatePath("/admin/publications");
  redirect(`/admin/publications/${created._id}/edit`);
}

/**
 * Starts a publication from a template: everything the template holds except
 * its identity, so the new one is free to diverge immediately.
 */
export async function createFromTemplateAction(formData: FormData) {
  await guard();

  const templateId = String(formData.get("templateId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!templateId || !title) return;

  const template = await Zine.findById(templateId).lean<any>();
  // Nothing in the bin is a starting point for anything.
  if (!template || template.deletedAt) return;

  const slug = await uniqueSlug(Zine, slugify(title), title);
  const created = await Zine.create({
    title,
    slug,
    kind: template.kind ?? "zine",
    status: "draft",
    isTemplate: false,
    description: template.description ?? "",
    listed: template.listed !== false,
    transition: template.transition ?? "fade",
    presentationSize: template.presentationSize,
    postViews: template.postViews ?? [],
    postView: template.postView ?? "",
    slideshow: template.slideshow,
    audio: template.audio,
    pages: template.pages ?? [],
    repeatedBlocks: template.repeatedBlocks ?? [],
    pageTemplates: template.pageTemplates ?? [],
    coverUrl: template.coverUrl ?? "",
    coverMediaId: template.coverMediaId ?? "",
  });

  revalidatePath("/admin/publications");
  redirect(`/admin/publications/${created._id}/edit`);
}

/** Marks a publication as a template, or stops it being one. */
export async function toggleTemplateAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const publication = await Zine.findById(id);
  if (!publication || publication.deletedAt) return;

  publication.isTemplate = !publication.isTemplate;
  await publication.save();

  revalidatePath("/admin/publications");
}

/** What the editor is told, so it can report back without leaving the page. */
export type PublicationSaveResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

export async function savePublicationAction(
  formData: FormData
): Promise<PublicationSaveResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That publication could not be found." };

  // The editor cannot open something in the bin, but this action is reachable
  // on its own and must not write over what a restore would bring back.
  const existing = await Zine.findById(id).select("deletedAt").lean<any>();
  if (!existing) return { ok: false, error: "That publication could not be found." };
  if (existing.deletedAt) {
    return { ok: false, error: "That publication is in the bin. Put it back first." };
  }

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Give the publication a title." };

  const kindInput = String(formData.get("kind") ?? "zine");
  const kind: PublicationKind = PUBLICATION_KINDS.includes(kindInput as PublicationKind)
    ? (kindInput as PublicationKind)
    : "zine";

  const slug = await uniqueSlug(
    Zine,
    String(formData.get("slug") ?? "") || slugify(title),
    title,
    id
  );

  const transitionInput = String(formData.get("transition") ?? "fade");
  const transition: Transition = TRANSITIONS.includes(transitionInput as Transition)
    ? (transitionInput as Transition)
    : "fade";

  const status = formData.get("status") === "published" ? "published" : "draft";

  const pages = normalizePublicationPages(parseJson(formData.get("pages"), []));
  const pageTemplates = normalizePageTemplates(parseJson(formData.get("pageTemplates"), []));
  const repeatedBlocks = normalizeRepeatedBlocks(parseJson(formData.get("repeatedBlocks"), []));
  const audio = normalizeAudio(parseJson(formData.get("audio"), {}));
  const coverUrl = sanitizeMediaPath(String(formData.get("coverUrl") ?? ""));
  const coverMediaId = String(formData.get("coverMediaId") ?? "");

  await Zine.findByIdAndUpdate(id, {
    title,
    slug,
    kind,
    description: String(formData.get("description") ?? ""),
    status,
    listed: formData.get("listed") === "on",
    transition,
    presentationSize: normalizeCanvasSize(parseJson(formData.get("presentationSize"), {})),
    postViews: parseJson<unknown[]>(formData.get("postViews"), []).slice(0, 12),
    // The view being edited becomes the post's own, so the preview, the
    // published page and the export all use it.
    postView: String(formData.get("editorView") ?? "").trim(),
    pageTemplates,
    isTemplate: formData.get("isTemplate") === "on",
    slideshow: normalizeSlideshow(parseJson(formData.get("slideshow"), {})),
    audio,
    pages,
    repeatedBlocks,
    coverMediaId,
    coverUrl,
    publishedAt: status === "published" ? new Date() : null,
  });

  await syncMediaUsage(id, title, [
    {
      kind: "publication",
      source: { pages, repeatedBlocks, pageTemplates, audio, coverUrl, coverMediaId },
    },
  ]);

  revalidatePath("/admin/publications");
  revalidatePath(publicationHref(kind, slug));

  /*
   * Nothing is redirected to.
   *
   * This used to end in a redirect back to the editor, which remounted it —
   * and a remounted editor is a new one: the page being worked on, what was
   * selected on it, the zoom and the scroll all went back to their defaults,
   * every time somebody pressed Save. The open post view was carried across
   * by hand in the address, which fixed the loudest symptom and none of the
   * rest.
   *
   * The editor calls this and stays where it is instead. The slug comes back
   * because `uniqueSlug` may have changed it, and the editor has a field
   * showing the old one.
   */
  return { ok: true as const, slug };
}

/**
 * Puts a publication in the bin.
 *
 * Not removed: a publication is weeks of somebody's arrangement and a delete
 * button is one press, so the press is made reversible. It leaves every list,
 * stops being served and cannot be edited, but it is still whole and can be
 * put back by anybody who could have deleted it.
 *
 * Its media stays recorded as in use, deliberately. Something in the bin can
 * come back, and a publication restored to find its pictures deleted would be
 * a worse loss than the one this is preventing.
 */
export async function deletePublicationAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const session = await getSession();
  const publication = await Zine.findByIdAndUpdate(id, {
    $set: { deletedAt: new Date(), deletedBy: session?.name || session?.email || "" },
  }).lean<any>();

  revalidatePath("/admin/publications");
  if (publication?.slug) {
    revalidatePath(publicationHref(publication.kind ?? "zine", publication.slug));
  }
  redirect("/admin/publications?deleted=1");
}

/** Takes it back out of the bin, exactly as it was. */
export async function restorePublicationAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const publication = await Zine.findByIdAndUpdate(id, {
    $set: { deletedAt: null, deletedBy: "" },
  }).lean<any>();

  revalidatePath("/admin/publications");
  if (publication?.slug) {
    revalidatePath(publicationHref(publication.kind ?? "zine", publication.slug));
  }
  redirect("/admin/publications?restored=1");
}

/**
 * Removes a publication for good.
 *
 * Three things stand between this and an accident, and each answers a different
 * one: it can only be done to something already in the bin, so it is never the
 * first press; it needs its own permission, so it is not simply whoever can
 * edit; and it asks for the publication's slug to be typed, so the thing being
 * destroyed has to be identified rather than merely confirmed.
 *
 * The media it held is released here — this is the point at which nothing can
 * come back for it.
 */
export async function purgePublicationAction(formData: FormData) {
  await requirePermission("publications.purge");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const typed = String(formData.get("confirm") ?? "").trim();
  if (!id) return;

  const publication = await Zine.findById(id).lean<any>();
  if (!publication) return;

  // Only from the bin, and only when named.
  if (!publication.deletedAt) {
    redirect("/admin/publications?purge=not-deleted");
  }
  if (typed !== publication.slug) {
    redirect(`/admin/publications?purge=mismatch&id=${id}`);
  }

  await clearMediaUsage(id);
  await Zine.findByIdAndDelete(id);

  revalidatePath("/admin/publications");
  if (publication.slug) {
    revalidatePath(publicationHref(publication.kind ?? "zine", publication.slug));
  }
  redirect("/admin/publications?purged=1");
}

export async function publishPublicationAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const publication = await Zine.findById(id);
  // Publishing something deleted would put it back in front of readers by a
  // side door; it has to be taken out of the bin first.
  if (!publication || publication.deletedAt) return;

  const next = publication.status === "published" ? "draft" : "published";
  publication.status = next;
  publication.publishedAt = next === "published" ? new Date() : null;
  await publication.save();

  revalidatePath("/admin/publications");
  revalidatePath(publicationHref(publication.kind ?? "zine", publication.slug));
}
