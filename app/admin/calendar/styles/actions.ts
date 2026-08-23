"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { normalizeCalendarStyle } from "@/lib/calendar-style";
import { connectDB } from "@/lib/db";
import { CalendarSettings, CalendarStyle } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("calendar.manage");
  await connectDB();
}

/** The nested style tree travels as JSON; a bad one is treated as empty. */
function parseJson(value: FormDataEntryValue | null): unknown {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveCalendarStyleAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  const values = normalizeCalendarStyle(parseJson(formData.get("style")));

  const name = String(formData.get("name") ?? "").trim() || values.name;
  if (!name) return;

  const payload = {
    name,
    parts: values.parts,
    eventBox: values.eventBox,
    lightbox: values.lightbox,
  };

  let styleId = id;
  if (id) {
    await CalendarStyle.findByIdAndUpdate(id, payload);
  } else {
    const slug = await uniqueSlug(CalendarStyle, slugify(name), "calendar-style");
    const created = await CalendarStyle.create({ ...payload, slug });
    styleId = String(created._id);
  }

  revalidatePath("/admin/calendar/styles");
  // Every page carrying a calendar renders this style's CSS.
  revalidatePath("/", "layout");
  redirect(`/admin/calendar/styles/${styleId}/edit?saved=1`);
}

export async function deleteCalendarStyleAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await CalendarStyle.findByIdAndDelete(id);

  revalidatePath("/admin/calendar/styles");
  revalidatePath("/", "layout");
  redirect("/admin/calendar/styles");
}

/** Which style a calendar wears when its block names none. */
export async function setDefaultCalendarStyleAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  await CalendarSettings.findOneAndUpdate(
    {},
    { $set: { defaultStyleId: id } },
    { upsert: true }
  );

  revalidatePath("/admin/calendar/styles");
  revalidatePath("/", "layout");
  redirect("/admin/calendar/styles");
}
