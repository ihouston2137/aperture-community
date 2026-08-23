"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import { FormDefinition, FormSubmission } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("forms.manage");
  await connectDB();
}

export async function saveFormAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const slug = await uniqueSlug(
    FormDefinition,
    String(formData.get("slug") ?? "") || slugify(title),
    title,
    id || undefined
  );

  let layout: ReturnType<typeof normalizeFormLayout>;
  try {
    layout = normalizeFormLayout(JSON.parse(String(formData.get("layout") ?? "[]")));
  } catch {
    layout = [];
  }

  let settings: ReturnType<typeof normalizeFormSettings>;
  try {
    settings = normalizeFormSettings(JSON.parse(String(formData.get("settings") ?? "{}")));
  } catch {
    settings = normalizeFormSettings({});
  }

  const status = formData.get("status") === "published" ? "published" : "draft";

  let formId = id;
  if (id) {
    await FormDefinition.findByIdAndUpdate(id, { title, slug, status, layout, settings });
  } else {
    const created = await FormDefinition.create({ title, slug, status, layout, settings });
    formId = String(created._id);
  }

  // Images and video placed in the form's visual blocks count as in use.
  await syncMediaUsage(formId, title, [{ kind: "form-content", source: layout }]);

  revalidatePath("/admin/forms");
  revalidatePath(`/forms/${slug}`);

  redirect(`/admin/forms/${formId}/edit?saved=1`);
}

export async function deleteFormAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const form = await FormDefinition.findById(id).lean<any>();
  await clearMediaUsage(id);
  await FormDefinition.findByIdAndDelete(id);

  revalidatePath("/admin/forms");
  if (form?.slug) revalidatePath(`/forms/${form.slug}`);
  redirect("/admin/forms");
}

export async function saveSubmissionLayoutAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  let submissionLayout: unknown[];
  try {
    const parsed = JSON.parse(String(formData.get("submissionLayout") ?? "[]"));
    submissionLayout = Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch {
    submissionLayout = [];
  }

  await FormDefinition.findByIdAndUpdate(id, { submissionLayout });

  revalidatePath(`/admin/forms/${id}/submission-layout`);
  revalidatePath("/admin/forms/submissions");
  redirect(`/admin/forms/${id}/submission-layout?saved=1`);
}

export async function updateSubmissionStatusAction(formData: FormData) {
  await requirePermission("forms.submissions");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "read");
  if (!id || !["new", "read", "archived"].includes(status)) return;

  await FormSubmission.findByIdAndUpdate(id, { status });
  revalidatePath("/admin/forms/submissions");
}
