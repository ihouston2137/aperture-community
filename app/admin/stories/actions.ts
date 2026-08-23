"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import { Story } from "@/lib/models";
import { sanitizeMediaPath } from "@/lib/protected-media-url";
import { normalizeRichText } from "@/lib/rich-text";
import { slugify, uniqueSlug } from "@/lib/slug";
import { normalizeClickSettings, normalizeStoryImage } from "@/lib/story-media";

async function guard() {
  await requirePermission("stories.manage");
  await connectDB();
}

function parseJson<T>(value: FormDataEntryValue | null, fallback: T): T {
  try {
    return JSON.parse(String(value ?? "")) as T;
  } catch {
    return fallback;
  }
}

export async function saveStoryAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  const headline = String(formData.get("headline") ?? "").trim();
  if (!headline) return;

  const slug = await uniqueSlug(
    Story,
    String(formData.get("slug") ?? "") || slugify(headline),
    headline,
    id || undefined
  );

  const publishDateRaw = String(formData.get("publishDate") ?? "");
  const publishDate = publishDateRaw ? new Date(publishDateRaw) : new Date();

  const featureMediaId = String(formData.get("featureMediaId") ?? "");
  const featureMediaUrl = sanitizeMediaPath(String(formData.get("featureMediaUrl") ?? ""));

  const storyImages = parseJson<any[]>(formData.get("storyImages"), [])
    .slice(0, 200)
    .map((image, index) => {
      const normalized = normalizeStoryImage(image, index);
      return { ...normalized, url: sanitizeMediaPath(normalized.url) };
    })
    .filter((image) => Boolean(image.url));

  const feature = normalizeClickSettings({
    clickAction: formData.get("featureClickAction"),
    linkHref: formData.get("featureLinkHref"),
    linkNewTab: formData.get("featureLinkNewTab") === "true",
  });
  const featureClick = {
    featureClickAction: feature.clickAction,
    featureLinkHref: feature.linkHref,
    featureLinkNewTab: feature.linkNewTab,
  };

  const payload = {
    headline,
    slug,
    subHeadline: String(formData.get("subHeadline") ?? ""),
    category: String(formData.get("category") ?? ""),
    location: String(formData.get("location") ?? ""),
    author: String(formData.get("author") ?? ""),
    authorBioId: String(formData.get("authorBioId") ?? ""),
    publishDate,
    status: formData.get("status") === "published" ? "published" : "draft",

    featureMediaId,
    featureMediaUrl,
    featureMediaType: String(formData.get("featureMediaType") ?? "image"),
    ...featureClick,

    templateId: String(formData.get("templateId") ?? ""),

    content: normalizeRichText(String(formData.get("content") ?? "")),
    storyImages,
  };

  let storyId = id;
  if (id) {
    await Story.findByIdAndUpdate(id, payload);
  } else {
    const created = await Story.create(payload);
    storyId = String(created._id);
  }

  // Keep media usage in step so the library can refuse to delete assets in use.
  // The feature image and the in-body media are recorded separately.
  await syncMediaUsage(storyId, headline, [
    { kind: "story-feature", source: { featureMediaId, featureMediaUrl } },
    { kind: "story-content", source: { storyImages, content: payload.content } },
  ]);

  revalidatePath("/admin/stories");
  revalidatePath(`/stories/${slug}`);
  revalidatePath("/", "layout");

  redirect(`/admin/stories/${storyId}/edit?saved=1`);
}

export async function deleteStoryAction(formData: FormData) {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const story = await Story.findById(id).lean<any>();
  await clearMediaUsage(id);
  await Story.findByIdAndDelete(id);

  revalidatePath("/admin/stories");
  if (story?.slug) revalidatePath(`/stories/${story.slug}`);
  redirect("/admin/stories");
}
