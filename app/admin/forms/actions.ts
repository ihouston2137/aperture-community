"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withExit } from "@/lib/admin-exit";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import { normalizeTestSettings } from "@/lib/form-test";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import { FormDefinition } from "@/lib/models";
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

  // Back where it came from, not where the admin's list is.
  redirect(withExit(`/admin/forms/${formId}/edit?saved=1`, formData.get("from")));
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

/**
 * Save a test.
 *
 * Its own action rather than a branch inside `saveFormAction`: a test has no
 * layout to normalize and no media to keep track of, and a form has no answer
 * key — sharing one action would mean each half guarding against the other's
 * fields on every save.
 */
export async function saveTestAction(formData: FormData) {
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

  const parse = (key: string) => {
    try {
      return JSON.parse(String(formData.get(key) ?? "{}"));
    } catch {
      return {};
    }
  };

  const record = {
    title,
    slug,
    status: String(formData.get("status") ?? "draft"),
    kind: "test",
    // A test's questions are its own; the layout stays empty so nothing tries
    // to render a page that was never arranged.
    layout: [],
    settings: normalizeFormSettings(parse("settings")),
    test: normalizeTestSettings(parse("test")),
  };

  const formId = id
    ? (await FormDefinition.findByIdAndUpdate(id, record), id)
    : String((await FormDefinition.create(record))._id);

  revalidatePath("/admin/forms");
  revalidatePath(`/forms/${slug}`);
  redirect(`/admin/forms/${formId}/test`);
}

export async function saveSubmissionLayoutAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const idList = (key: string): unknown[] => {
    try {
      const parsed = JSON.parse(String(formData.get(key) ?? "[]"));
      return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
    } catch {
      return [];
    }
  };

  await FormDefinition.findByIdAndUpdate(id, {
    submissionLayout: idList("submissionLayout"),
    submissionColumns: idList("submissionColumns"),
  });

  revalidatePath(`/admin/forms/${id}/submission-layout`);
  revalidatePath("/admin/forms/submissions");
  // The columns are this form's own, so its own list has to be rebuilt.
  revalidatePath(`/admin/forms/submissions/${id}`);
  redirect(`/admin/forms/${id}/submission-layout?saved=1`);
}
