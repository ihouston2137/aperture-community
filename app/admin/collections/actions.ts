"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { withExit } from "@/lib/admin-exit";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import {
  defaultLightboxSettings,
  defaultOverlaySettings,
  normalizeCollectionHeader,
  normalizeMetadataDisplay,
  normalizeStyleSlot,
} from "@/lib/display-templates";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import { Collection } from "@/lib/models";
import { slugify, uniqueSlug } from "@/lib/slug";

async function guard() {
  await requirePermission("collections.manage");
  await connectDB();
}

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
}

export async function saveCollectionAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const slug = await uniqueSlug(
    Collection,
    String(formData.get("slug") ?? "") || slugify(name),
    name,
    id || undefined
  );

  const imageIds = parseJson<string[]>(formData.get("imageIds"), []).slice(0, 5000);
  const display = parseJson<Record<string, unknown>>(formData.get("display"), {});

  const payload = {
    name,
    slug,
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    isPublic: formData.get("isPublic") === "on",

    imageIds,
    sortMode: String(formData.get("sortMode") ?? "createdAt"),
    sortDirection: formData.get("sortDirection") === "asc" ? "asc" : "desc",
    customOrder: parseJson<string[]>(formData.get("customOrder"), imageIds),

    ...display,

    overlaySettings: normalizeMetadataDisplay(
      parseJson(formData.get("overlaySettings"), {}),
      defaultOverlaySettings
    ),
    lightboxSettings: normalizeMetadataDisplay(
      parseJson(formData.get("lightboxSettings"), {}),
      defaultLightboxSettings
    ),

    mosaicSpans: parseJson(formData.get("mosaicSpans"), {}),
    styleOverrides: parseJson(formData.get("styleOverrides"), {}),
    header: normalizeCollectionHeader(parseJson(formData.get("header"), {})),
    share: normalizeStyleSlot(parseJson(formData.get("share"), {})),
    imageShare: normalizeStyleSlot(parseJson(formData.get("imageShare"), {})),
    pageStyle: normalizeStyleSlot(parseJson(formData.get("pageStyle"), {})),
    imageStyle: normalizeStyleSlot(parseJson(formData.get("imageStyle"), {})),
    imageExitStyle: normalizeStyleSlot(parseJson(formData.get("imageExitStyle"), {})),
    imageContentStyle: normalizeStyleSlot(
      parseJson(formData.get("imageContentStyle"), {})
    ),
    // Only kept while the image is still in the collection; the resolver falls
    // back to the first image either way.
    featureImageId: imageIds.includes(String(formData.get("featureImageId") ?? ""))
      ? String(formData.get("featureImageId"))
      : "",
  };

  let collectionId = id;
  if (id) {
    await Collection.findByIdAndUpdate(id, payload);
  } else {
    const created = await Collection.create(payload);
    collectionId = String(created._id);
  }

  // Keep media usage accurate so in-use assets cannot be deleted.
  await syncMediaUsage(collectionId, name, [{ kind: "collection", source: { imageIds } }]);

  revalidatePath("/admin/collections");
  revalidatePath(`/collections/${slug}`);
  revalidatePath("/", "layout");

  redirect(
    withExit(`/admin/collections/${collectionId}/edit?saved=1`, formData.get("from"))
  );
}

/**
 * Attaches freshly uploaded assets to a saved collection straight away.
 *
 * Uploading is not an edit the user thinks of as pending — the files are
 * already in the library — so leaving the attachment until Save is how images
 * end up uploaded for a collection and never in it. Returns the collection's
 * image ids so the editor stays in step with what was stored.
 */
export async function addCollectionImagesAction(
  id: string,
  newIds: string[]
): Promise<string[] | null> {
  await guard();
  if (!id || newIds.length === 0) return null;

  const collection = await Collection.findById(id).lean<any>();
  if (!collection) return null;

  const existing: string[] = Array.isArray(collection.imageIds) ? collection.imageIds : [];
  const imageIds = [...existing, ...newIds.filter((value) => !existing.includes(value))];
  if (imageIds.length === existing.length) return existing;

  await Collection.findByIdAndUpdate(id, { imageIds });
  // Counts as in use immediately, so the new files cannot be deleted from the
  // library as unused while this collection is still being arranged.
  await syncMediaUsage(id, collection.name ?? "", [
    { kind: "collection", source: { imageIds } },
  ]);

  revalidatePath("/admin/collections");
  if (collection.slug) revalidatePath(`/collections/${collection.slug}`);

  return imageIds;
}

export async function deleteCollectionAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const collection = await Collection.findById(id).lean<any>();
  await clearMediaUsage(id);
  await Collection.findByIdAndDelete(id);

  revalidatePath("/admin/collections");
  if (collection?.slug) revalidatePath(`/collections/${collection.slug}`);
  redirect("/admin/collections");
}
