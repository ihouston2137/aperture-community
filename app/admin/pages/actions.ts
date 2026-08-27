"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withExit } from "@/lib/admin-exit";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import { CustomPageBlock, SitePage } from "@/lib/models";
import { normalizeColorOverrides } from "@/lib/color-overrides";
import { normalizeBlock, normalizePageLayout } from "@/lib/page-layout";
import { normalizeBlocksWithStorySlots } from "@/lib/story-template-layout";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("pages.manage");
  await connectDB();
}

export async function savePageAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const slug = await uniqueSlug(
    SitePage,
    String(formData.get("slug") ?? "") || slugify(title),
    title,
    id || undefined
  );

  let layout: ReturnType<typeof normalizePageLayout>;
  try {
    // Normalization bounds array sizes, sanitizes media paths and rewrites
    // rich text, so nothing unchecked from the client reaches the database.
    layout = normalizePageLayout(
      JSON.parse(String(formData.get("layout") ?? "[]")),
      normalizeBlocksWithStorySlots
    );
  } catch {
    layout = [];
  }

  const isHome = formData.get("isHome") === "on";
  let colors;
  try {
    colors = normalizeColorOverrides(JSON.parse(String(formData.get("colors") ?? "{}")));
  } catch {
    colors = normalizeColorOverrides({});
  }
  const status = formData.get("status") === "published" ? "published" : "draft";

  let pageId = id;
  if (id) {
    await SitePage.findByIdAndUpdate(id, { title, slug, status, isHome, layout, colors });
  } else {
    const created = await SitePage.create({ title, slug, status, isHome, layout, colors });
    pageId = String(created._id);
  }

  // Record which assets this page now uses, so media added here counts as in
  // use and media removed from it stops counting.
  await syncMediaUsage(pageId, title, [{ kind: "page", source: layout }]);

  // Exactly one page can be the home page.
  if (isHome) {
    await SitePage.updateMany({ _id: { $ne: pageId } }, { $set: { isHome: false } });
  }

  revalidatePath("/admin/pages");
  revalidatePath(`/${slug}`);
  revalidatePath("/");

  redirect(withExit(`/admin/pages/${pageId}/edit?saved=1`, formData.get("from")));
}

export async function deletePageAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const page = await SitePage.findById(id).lean<any>();
  await clearMediaUsage(id);
  await SitePage.findByIdAndDelete(id);

  revalidatePath("/admin/pages");
  if (page?.slug) revalidatePath(`/${page.slug}`);
  redirect("/admin/pages");
}

export async function setHomePageAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await SitePage.updateMany({}, { $set: { isHome: false } });
  await SitePage.findByIdAndUpdate(id, { isHome: true, status: "published" });

  revalidatePath("/admin/pages");
  revalidatePath("/");
}

/* ------------------------------------------------- Reusable page blocks */

export async function saveBlockAction(
  name: string,
  icon: string,
  blockJson: string
): Promise<{ _id: string; name: string; icon: string; block: unknown } | null> {
  await guard();

  const trimmed = name.trim();
  if (!trimmed) return null;

  let parsed;
  try {
    parsed = normalizeBlock(JSON.parse(blockJson), normalizeBlocksWithStorySlots);
  } catch {
    return null;
  }

  // Only container blocks are saved as reusable page blocks.
  if (!parsed || parsed.type !== "container") return null;

  // The name is the identity: saving under one already in the library replaces
  // it, which is what makes the editor's button read "Update".
  const saved = await CustomPageBlock.findOneAndUpdate(
    { name: trimmed },
    { name: trimmed, icon: icon.trim(), block: parsed },
    { upsert: true, returnDocument: "after" }
  ).lean<any>();

  revalidatePath("/admin/pages");

  return {
    _id: String(saved._id),
    name: trimmed,
    icon: icon.trim(),
    block: parsed,
  };
}

export async function deleteSavedBlockAction(id: string) {
  await guard();
  if (id) await CustomPageBlock.findByIdAndDelete(id);
  revalidatePath("/admin/pages");
}
