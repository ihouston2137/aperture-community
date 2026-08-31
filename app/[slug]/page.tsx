import { notFound } from "next/navigation";
import { guardContent } from "@/lib/content-guard";
import { getMenuViewer } from "@/lib/menus";

import { PageRenderer } from "@/components/page-renderer";
import { SiteChrome } from "@/components/site-chrome";
import { connectDB } from "@/lib/db";
import { SitePage } from "@/lib/models";
import { colorOverrideStyle, normalizeColorOverrides } from "@/lib/color-overrides";
import { filterLayoutForViewer, normalizePageLayout } from "@/lib/page-layout";
import { normalizeBlocksWithStorySlots } from "@/lib/story-template-layout";
import { loadPageSources } from "@/lib/page-sources";
import { getSiteContent } from "@/lib/site-settings";
import { socialMetadata } from "@/lib/social-metadata";

async function findPage(slug: string) {
  await connectDB();
  return SitePage.findOne({ slug, status: "published" }).lean<any>();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await findPage(slug);
  if (!page) return {};

  // A built page has no picture of its own, so it shares under the site's.
  const siteContent = await getSiteContent();
  return socialMetadata({
    title: page.title,
    description: siteContent.metaDescription,
    image: siteContent.metaImageUrl,
  });
}

export default async function CustomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = await findPage(slug);
  if (!page) notFound();
  await guardContent("page", String(page._id), `/${slug}`);

  /*
   * Restricted rows are dropped here, before the sources are loaded — so what
   * this viewer may not see is neither fetched for them nor sent to them.
   */
  const layout = filterLayoutForViewer(
    normalizePageLayout(page.layout, normalizeBlocksWithStorySlots),
    await getMenuViewer()
  );
  const sources = await loadPageSources(layout);
  const colors = normalizeColorOverrides(page.colors);

  return (
    <SiteChrome contentStyle={colorOverrideStyle(colors)}>
      <PageRenderer
        layout={layout}
        sources={sources}
        colors={colors}
      />
    </SiteChrome>
  );
}
