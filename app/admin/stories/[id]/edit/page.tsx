import { notFound } from "next/navigation";

import { AdminHeader, Notice } from "@/components/admin-ui";
import { checkPermission, requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { connectDB } from "@/lib/db";
import { Story } from "@/lib/models";
import { getSession } from "@/lib/session";
import { loadMediaMetaRecord } from "@/lib/stories";
import { normalizeClickSettings, normalizeStoryImage } from "@/lib/story-media";

import { deleteStoryAction } from "../../actions";
import { StoryEditor, type StoryRecord } from "../../story-editor";

export const metadata = { title: "Edit story" };

export default async function EditStoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  await requirePermission("stories.manage");
  const { id } = await params;
  const { saved } = await searchParams;

  await connectDB();
  const doc = await Story.findById(id).lean<any>();
  if (!doc) notFound();

  const storyImages = (doc.storyImages ?? []).map((image: any, index: number) =>
    normalizeStoryImage(image, index)
  );

  const story: StoryRecord = {
    _id: String(doc._id),
    headline: doc.headline ?? "",
    slug: doc.slug ?? "",
    subHeadline: doc.subHeadline ?? "",
    category: doc.category ?? "",
    location: doc.location ?? "",
    author: doc.author ?? "",
    authorBioId: doc.authorBioId ?? "",
    publishDate: doc.publishDate
      ? new Date(doc.publishDate).toISOString()
      : new Date().toISOString(),
    status: doc.status ?? "draft",
    featureMediaId: doc.featureMediaId ?? "",
    featureMediaUrl: doc.featureMediaUrl ?? "",
    featureMediaType: doc.featureMediaType ?? "image",
    featureClick: normalizeClickSettings({
      clickAction: doc.featureClickAction,
      linkHref: doc.featureLinkHref,
      linkNewTab: doc.featureLinkNewTab,
    }),
    templateId: doc.templateId ?? "",
    content: doc.content ?? "",
    storyImages,
  };

  const [sources, mediaMeta, canEditMedia] = await Promise.all([
    loadBuilderSources(),
    // Alt text and captions come from the files, so the editor is shown what
    // each one currently says rather than storing a second copy.
    loadMediaMetaRecord([
      { mediaId: story.featureMediaId, url: story.featureMediaUrl },
      ...storyImages,
    ]),
    getSession().then((session) => checkPermission(session, "media.upload")),
  ]);

  return (
    <>
      <AdminHeader
        title={story.headline || "Edit story"}
        actions={
          <form action={deleteStoryAction}>
            <input type="hidden" name="id" value={story._id} />
            <button type="submit" className="btn btn-danger">
              Delete
            </button>
          </form>
        }
      />
      {saved ? <Notice>Story saved.</Notice> : null}

      <StoryEditor
        story={story}
        templates={sources.templates}
        bios={sources.bios}
        fonts={sources.fonts}
        mediaMeta={mediaMeta}
        canEditMedia={canEditMedia}
      />
    </>
  );
}
