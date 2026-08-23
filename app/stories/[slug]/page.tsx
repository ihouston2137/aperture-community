import { notFound } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { StoryRenderer } from "@/components/story-renderer";
import { colorOverrideStyle } from "@/lib/color-overrides";
import { loadPageSources } from "@/lib/page-sources";
import { getSession } from "@/lib/session";
import { getSiteContent } from "@/lib/site-settings";
import { socialMetadata } from "@/lib/social-metadata";
import { getStoryBySlug, resolveStoryTemplate, toStoryView } from "@/lib/stories";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const story = await getStoryBySlug(slug);
  if (!story) return {};

  // Video feature media has no still to share, so the site image stands in.
  const isImage = (story.featureMediaType ?? "image") === "image";
  const siteContent = await getSiteContent();

  return socialMetadata({
    title: story.headline,
    description: story.subHeadline,
    image:
      (isImage ? story.featureMediaUrl : "") || siteContent.metaImageUrl,
    type: "article",
  });
}

export default async function StoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ previewId?: string }>;
}) {
  const { slug } = await params;
  const { previewId } = await searchParams;

  const story = await getStoryBySlug(slug);
  if (!story) notFound();

  // Drafts are visible only to signed-in users following an explicit preview
  // link, so a guessed slug never leaks unpublished work.
  const isDraft = story.status !== "published";
  if (isDraft) {
    const session = await getSession();
    if (!session || previewId !== String(story._id)) notFound();
  }

  // The view resolves media metadata from the library, so it is async.
  const [template, view] = await Promise.all([
    resolveStoryTemplate(story.templateId),
    toStoryView(story),
  ]);
  const { layout, colors } = template;
  // Templates can carry ordinary page blocks, which reference other records.
  const sources = await loadPageSources(layout);

  return (
    <SiteChrome contentStyle={colorOverrideStyle(colors)}>
      {isDraft ? <div className="draft-banner">Draft preview</div> : null}
      {/* No wrapper: the template's rows carry their own width and spacing,
          exactly as a page's rows do. */}
      <StoryRenderer layout={layout} story={view} sources={sources} colors={colors} />
    </SiteChrome>
  );
}
