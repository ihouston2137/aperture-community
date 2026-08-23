import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { loadStoryPreviewSource } from "@/lib/story-preview-source";
import { emptyColorOverrides } from "@/lib/color-overrides";
import { defaultStoryTemplateLayout } from "@/lib/story-template-layout";

import { StoryTemplateBuilder } from "../story-template-builder";

export const metadata = { title: "New story template" };

export default async function NewStoryTemplatePage() {
  await requirePermission("storyTemplates.manage");
  const [sources, preview] = await Promise.all([
    loadBuilderSources(),
    loadStoryPreviewSource(),
  ]);

  return (
    <StoryTemplateBuilder
      template={{
        name: "",
        slug: "",
        isDefault: false,
        // Start from the built-in layout so a new template is immediately usable.
        layout: defaultStoryTemplateLayout(),
        colors: emptyColorOverrides,
      }}
      sources={sources}
      stories={preview.stories}
      initialStory={preview.initialStory}
    />
  );
}
