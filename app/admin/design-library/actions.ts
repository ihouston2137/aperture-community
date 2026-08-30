"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { sanitizeSvgShape } from "@/lib/custom-shapes";
import { connectDB } from "@/lib/db";
import { googleFontCssUrl } from "@/lib/google-fonts";
import { FONT_UPLOAD_MIME_TYPES, storeUpload } from "@/lib/media-upload";
import { CustomShape, CustomStyle, FontFamily } from "@/lib/models";
import {
  FONT_FILE_FORMATS,
  fontFormatForExtension,
  normalizeFontStyle,
  normalizeFontWeight,
} from "@/lib/site-fonts";
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

/**
 * Add a font file to a family, creating the family if it is new.
 *
 * The family name is typed rather than read out of the file. A TrueType file
 * carries a name table, and reading it would mean parsing the font here — for
 * a name that is often not the one anybody wants in a picker ("Whitney A" for
 * a face somebody thinks of as Whitney). Typing it also lets several files be
 * gathered under one family, which is the point: a browser handed only a 400
 * fakes the bold by smearing it.
 */
export async function uploadFontFileAction(formData: FormData) {
  await guard();

  const family = String(formData.get("family") ?? "").trim();
  const file = formData.get("file");
  if (!family || !(file instanceof File) || file.size === 0) return;

  // The extension decides, not the browser's MIME guess: a `.ttf` is reported
  // as `font/ttf`, `application/x-font-ttf` or `application/octet-stream`
  // depending on the platform, and the last of those cannot be trusted on its
  // own. An unrecognised extension is refused outright.
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!FONT_FILE_FORMATS[extension]) return;

  const mimeType = file.type || "application/octet-stream";
  const stored = await storeUpload(file, "fonts", {
    ...FONT_UPLOAD_MIME_TYPES,
    [mimeType]: extension,
  });

  const weight = normalizeFontWeight(formData.get("weight"));
  const style = normalizeFontStyle(formData.get("style"));
  const category = String(formData.get("category") ?? "sans-serif");

  const existing = await FontFamily.findOne({ family });
  const faces = (existing?.faces ?? []).filter(
    // One file per weight and slant: uploading a second 700 replaces the
    // first rather than stacking two rules the browser resolves by order.
    (face: any) => !(face.weight === weight && face.style === style)
  );

  faces.push({
    url: stored.url,
    weight,
    style,
    format: fontFormatForExtension(extension),
    originalName: stored.originalName,
  });

  const variants = [...new Set(faces.map((face: any) => String(face.weight)))].sort(
    (a, b) => Number(a) - Number(b)
  );

  await FontFamily.findOneAndUpdate(
    { family },
    {
      family,
      category: existing?.category || category,
      variants,
      // An uploaded family is served from its own files, so a stylesheet URL
      // left over from a Google family of the same name would fight them.
      cssUrl: "",
      faces,
    },
    { upsert: true, returnDocument: "after" }
  );

  revalidateDesign();
}

/** Remove one uploaded file from a family, and the family once it is empty. */
export async function deleteFontFaceAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  const url = String(formData.get("url") ?? "");
  if (!id || !url) return;

  const font = await FontFamily.findById(id);
  if (!font) return;

  const faces = (font.faces ?? []).filter((face: any) => face.url !== url);

  // A family with no files left is a name that resolves to nothing, which is
  // worse than an absent one: it stays in every picker and quietly does
  // nothing wherever it is chosen.
  if (faces.length === 0) {
    await FontFamily.findByIdAndDelete(id);
  } else {
    font.faces = faces;
    font.variants = [...new Set(faces.map((face: any) => String(face.weight)))].sort(
      (a, b) => Number(a) - Number(b)
    );
    await font.save();
  }

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
