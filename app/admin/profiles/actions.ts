"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { normalizeBioType } from "@/lib/bio-types";
import { connectDB } from "@/lib/db";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import { Bio } from "@/lib/models";
import { sanitizeMediaPath } from "@/lib/protected-media-url";
import { slugify, uniqueSlug } from "@/lib/slug";

/** The dialog stays open on failure to show the message, so these report back. */
export type BioActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("profiles.manage");
  await connectDB();
}

export async function saveBioAction(formData: FormData): Promise<BioActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "A name is required." };

  const headshotMediaId = String(formData.get("headshotMediaId") ?? "");
  const headshotUrl = sanitizeMediaPath(String(formData.get("headshotUrl") ?? ""));
  const isPrimary = formData.get("isPrimary") === "on";

  const payload = {
    name,
    type: normalizeBioType(formData.get("type")),
    title: String(formData.get("title") ?? ""),
    location: String(formData.get("location") ?? ""),
    description: String(formData.get("description") ?? ""),
    headshotMediaId,
    headshotUrl,
    isPrimary,
  };

  // Only one profile can be the primary one.
  if (isPrimary) {
    await Bio.updateMany({ _id: { $ne: id || null } }, { $set: { isPrimary: false } });
  }

  let bioId = id;
  if (id) {
    await Bio.findByIdAndUpdate(id, payload);
  } else {
    const slug = await uniqueSlug(Bio, slugify(name), "profile");
    const created = await Bio.create({ ...payload, slug });
    bioId = String(created._id);
  }

  await syncMediaUsage(bioId, name, [
    { kind: "bio-headshot", source: { headshotMediaId, headshotUrl } },
  ]);

  revalidatePath("/admin/profiles");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteBioAction(formData: FormData): Promise<BioActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That profile no longer exists." };

  await clearMediaUsage(id);
  await Bio.findByIdAndDelete(id);

  revalidatePath("/admin/profiles");
  revalidatePath("/", "layout");
  return { ok: true };
}
