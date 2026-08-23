import { notFound } from "next/navigation";

import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { loadStoryPreviewSource } from "@/lib/story-preview-source";
import { normalizeColorOverrides } from "@/lib/color-overrides";
import { connectDB } from "@/lib/db";
import { StoryTemplate } from "@/lib/models";
import { normalizeStoryTemplateLayout } from "@/lib/story-template-layout";

import { StoryTemplateBuilder } from "../../story-template-builder";

export const metadata = { title: "Edit story template" };

export default async function EditStoryTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("storyTemplates.manage");
  const { id } = await params;

  await connectDB();
  const doc = await StoryTemplate.findById(id).lean<any>();
  if (!doc) notFound();

  const [sources, preview] = await Promise.all([
    loadBuilderSources(),
    loadStoryPreviewSource(),
  ]);

  return (
    <StoryTemplateBuilder
      template={{
        _id: String(doc._id),
        name: doc.name ?? "",
        slug: doc.slug ?? "",
        isDefault: Boolean(doc.isDefault),
        layout: normalizeStoryTemplateLayout(doc.layout, doc.layoutVersion),
        colors: normalizeColorOverrides(doc.colors),
      }}
      sources={sources}
      stories={preview.stories}
      initialStory={preview.initialStory}
    />
  );
}
