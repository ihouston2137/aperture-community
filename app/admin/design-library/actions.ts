"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { sanitizeSvgShape } from "@/lib/custom-shapes";
import { connectDB } from "@/lib/db";
import { googleFontCssUrl } from "@/lib/google-fonts";
import { CustomShape, CustomStyle, FontFamily } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";
import { normalizeStyleValues, type StyleValues } from "@/lib/style-values";

async function guard() {
  await requirePermission("design.library");
  await connectDB();
}

function revalidateDesign() {
  // Named styles and fonts are injected by the root layout, so every route
  // needs to pick up the regenerated stylesheet.
  revalidatePath("/", "layout");
  revalidatePath("/admin/design-library");
}

/* ------------------------------------------------------------------ Fonts */

export async function saveFontAction(formData: FormData) {
  await guard();

  const family = String(formData.get("family") ?? "").trim();
  if (!family) return;

  const category = String(formData.get("category") ?? "sans-serif");
  const variants = formData.getAll("variants").map(String).filter(Boolean);
  const cssUrl =
    String(formData.get("cssUrl") ?? "").trim() || googleFontCssUrl(family, variants);

  await FontFamily.findOneAndUpdate(
    { family },
    { family, category, variants: variants.length ? variants : ["400"], cssUrl },
    { upsert: true, returnDocument: "after" }
  );

  revalidateDesign();
}

export async function deleteFontAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await FontFamily.findByIdAndDelete(id);
  revalidateDesign();
}

/* ----------------------------------------------------------- Named styles */

export async function saveStyleAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const parseJson = (field: string): StyleValues => {
    try {
      return normalizeStyleValues(JSON.parse(String(formData.get(field) ?? "{}")));
    } catch {
      return {};
    }
  };

  const payload = {
    name,
    style: parseJson("style"),
    hoverEnabled: formData.get("hoverEnabled") === "on",
    hoverStyle: parseJson("hoverStyle"),
    transitionDuration: Number(formData.get("transitionDuration") ?? 200) || 200,
  };

  if (id) {
    await CustomStyle.findByIdAndUpdate(id, payload);
  } else {
    const slug = await uniqueSlug(CustomStyle, slugify(name), "style");
    await CustomStyle.create({ ...payload, slug });
  }

  revalidateDesign();
}

/**
 * Called by the shared style editor when someone types a name into
 * "Save as a named style" inside any builder. Returns the new slug so the
 * builder can immediately switch the block over to it.
 */
export async function createNamedStyleAction(input: {
  name: string;
  style: StyleValues;
  hoverEnabled: boolean;
  hoverStyle: StyleValues;
  transitionDuration: number;
}): Promise<{ slug: string; name: string } | null> {
  await guard();

  const name = input.name.trim();
  if (!name) return null;

  const slug = await uniqueSlug(CustomStyle, slugify(name), "style");
  await CustomStyle.create({
    name,
    slug,
    style: normalizeStyleValues(input.style),
    hoverEnabled: Boolean(input.hoverEnabled),
    hoverStyle: normalizeStyleValues(input.hoverStyle),
    transitionDuration: input.transitionDuration || 200,
  });

  revalidateDesign();
  return { slug, name };
}

export async function deleteStyleAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await CustomStyle.findByIdAndDelete(id);
  revalidateDesign();
}

/* ----------------------------------------------------------------- Shapes */

export async function saveShapeAction(formData: FormData) {
  await guard();

  const name = String(formData.get("name") ?? "").trim();
  const file = formData.get("svg");
  const pasted = String(formData.get("svgSource") ?? "");

  const source =
    file instanceof File && file.size > 0 ? await file.text() : pasted;
  if (!name || !source) return;

  // Only the viewBox and path data survive the import.
  const sanitized = sanitizeSvgShape(source);
  if (!sanitized) return;

  const slug = await uniqueSlug(CustomShape, slugify(name), "shape");
  await CustomShape.create({ name, slug, ...sanitized });

  revalidateDesign();
}

export async function deleteShapeAction(formData: FormData) {
  await guard();
  const id = String(formData.get("id") ?? "");
  if (id) await CustomShape.findByIdAndDelete(id);
  revalidateDesign();
}
