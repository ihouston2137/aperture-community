"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { normalizeColorOverrides } from "@/lib/color-overrides";
import { connectDB } from "@/lib/db";
import { normalizeDocTemplateLayout } from "@/lib/doc-template-layout";
import { DocTemplate } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("docs.manage");
  await connectDB();
}

function parseJson(value: FormDataEntryValue | null): unknown {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveDocTemplateAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const isDefault = formData.get("isDefault") === "on";

  const payload = {
    name,
    slug: await uniqueSlug(
      DocTemplate,
      String(formData.get("slug") ?? "") || slugify(name),
      name,
      id || undefined
    ),
    layout: normalizeDocTemplateLayout(parseJson(formData.get("layout"))),
    colors: normalizeColorOverrides(parseJson(formData.get("colors")) ?? {}),
    isDefault,
  };

  let templateId = id;
  if (id) {
    await DocTemplate.findByIdAndUpdate(id, payload);
  } else {
    const created = await DocTemplate.create(payload);
    templateId = String(created._id);
  }

  // Only one template can be the default one.
  if (isDefault) {
    await DocTemplate.updateMany(
      { _id: { $ne: templateId } },
      { $set: { isDefault: false } }
    );
  }

  revalidatePath("/admin/docs/templates");
  revalidatePath("/docs", "layout");
  redirect(`/admin/docs/templates/${templateId}/edit?saved=1`);
}

export async function deleteDocTemplateAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await DocTemplate.findByIdAndDelete(id);

  revalidatePath("/admin/docs/templates");
  revalidatePath("/docs", "layout");
  redirect("/admin/docs/templates");
}
