import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { normalizeColorOverrides } from "@/lib/color-overrides";
import { connectDB } from "@/lib/db";
import { SitePage } from "@/lib/models";
import { normalizePageLayout } from "@/lib/page-layout";
import { normalizeBlocksWithStorySlots } from "@/lib/story-template-layout";
import { loadPageSources } from "@/lib/page-sources";
import { getAppearance, getSiteContent } from "@/lib/site-settings";

import { PageBuilder } from "../../page-builder";

export const metadata = { title: "Edit page" };

export default async function EditPagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("pages.manage");
  const { id } = await params;

  await connectDB();
  const doc = await SitePage.findById(id).lean<any>();
  if (!doc) notFound();

  const layout = normalizePageLayout(doc.layout, normalizeBlocksWithStorySlots);
  const [sources, previewSources, appearance, content] = await Promise.all([
    loadBuilderSources(),
    // The same resolver the public page uses, so the canvas preview and the
    // published page render referenced records identically.
    loadPageSources(layout),
    getAppearance(),
    getSiteContent(),
  ]);

  return (
    <PageBuilder
      page={{
        _id: String(doc._id),
        title: doc.title ?? "",
        slug: doc.slug ?? "",
        status: doc.status ?? "draft",
        isHome: Boolean(doc.isHome),
        layout,
        colors: normalizeColorOverrides(doc.colors),
      }}
      sources={sources}
      previewSources={previewSources}
      chrome={{ appearance, content }}
    />
  );
}
