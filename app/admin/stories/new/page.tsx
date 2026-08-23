import { AdminHeader } from "@/components/admin-ui";
import { checkPermission } from "@/lib/access";
import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { getSession } from "@/lib/session";

import { StoryEditor, type StoryRecord } from "../story-editor";

export const metadata = { title: "New story" };

const blank: StoryRecord = {
  headline: "",
  slug: "",
  subHeadline: "",
  category: "",
  location: "",
  author: "",
  authorBioId: "",
  publishDate: new Date().toISOString(),
  status: "draft",
  featureMediaId: "",
  featureMediaUrl: "",
  featureMediaType: "image",
  featureClick: { clickAction: "none", linkHref: "", linkNewTab: false },
  templateId: "",
  content: "",
  storyImages: [],
};

export default async function NewStoryPage() {
  await requirePermission("stories.manage");

  const [sources, canEditMedia] = await Promise.all([
    loadBuilderSources(),
    // Editing a file's details writes to the media library, so it needs that
    // permission rather than the story one.
    getSession().then((session) => checkPermission(session, "media.upload")),
  ]);

  return (
    <>
      <AdminHeader title="New story" />
      <StoryEditor
        story={blank}
        templates={sources.templates}
        bios={sources.bios}
        fonts={sources.fonts}
        mediaMeta={{}}
        canEditMedia={canEditMedia}
      />
    </>
  );
}
