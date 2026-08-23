"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { normalizeColorOverrides } from "@/lib/color-overrides";
import { connectDB } from "@/lib/db";
import { StoryTemplate } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";
import {
  normalizeStoryTemplateLayout,
  STORY_TEMPLATE_LAYOUT_VERSION,
} from "@/lib/story-template-layout";

async function guard() {
  await requirePermission("storyTemplates.manage");
  await connectDB();
}

export async function saveStoryTemplateAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const slug = await uniqueSlug(
    StoryTemplate,
    String(formData.get("slug") ?? "") || slugify(name),
    name,
    id || undefined
  );

  let layout: ReturnType<typeof normalizeStoryTemplateLayout>;
  try {
    layout = normalizeStoryTemplateLayout(
      JSON.parse(String(formData.get("layout") ?? "[]")),
      STORY_TEMPLATE_LAYOUT_VERSION
    );
  } catch {
    layout = [];
  }

  const isDefault = formData.get("isDefault") === "on";

  let colors;
  try {
    colors = normalizeColorOverrides(JSON.parse(String(formData.get("colors") ?? "{}")));
  } catch {
    colors = normalizeColorOverrides({});
  }

  let templateId = id;
  if (id) {
    await StoryTemplate.findByIdAndUpdate(id, {
      name,
      slug,
      layout,
      isDefault,
      colors,
      layoutVersion: STORY_TEMPLATE_LAYOUT_VERSION,
    });
  } else {
    const created = await StoryTemplate.create({
      name,
      slug,
      layout,
      isDefault,
      colors,
      layoutVersion: STORY_TEMPLATE_LAYOUT_VERSION,
    });
    templateId = String(created._id);
  }

  // Only one template can be the default fallback.
  if (isDefault) {
    await StoryTemplate.updateMany(
      { _id: { $ne: templateId } },
      { $set: { isDefault: false } }
    );
  }

  revalidatePath("/admin/story-templates");
  revalidatePath("/", "layout");

  redirect(`/admin/story-templates/${templateId}/edit?saved=1`);
}

export async function deleteStoryTemplateAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await StoryTemplate.findByIdAndDelete(id);
  revalidatePath("/admin/story-templates");
  redirect("/admin/story-templates");
}

export async function setDefaultTemplateAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await StoryTemplate.updateMany({}, { $set: { isDefault: false } });
  await StoryTemplate.findByIdAndUpdate(id, { isDefault: true });

  revalidatePath("/admin/story-templates");
}
