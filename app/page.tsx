import { connectDB } from "@/lib/db";
import { SitePage } from "@/lib/models";
import { colorOverrideStyle, normalizeColorOverrides } from "@/lib/color-overrides";
import { normalizePageLayout } from "@/lib/page-layout";
import { normalizeBlocksWithStorySlots } from "@/lib/story-template-layout";
import { SiteChrome } from "@/components/site-chrome";
import { PageRenderer } from "@/components/page-renderer";
import { loadPageSources } from "@/lib/page-sources";

import { DefaultHome } from "./default-home";

export default async function HomePage() {
  await connectDB();
  const home = await SitePage.findOne({ isHome: true, status: "published" }).lean<any>();

  if (!home) {
    return (
      <SiteChrome>
        <DefaultHome />
      </SiteChrome>
    );
  }

  const layout = normalizePageLayout(home.layout, normalizeBlocksWithStorySlots);
  const sources = await loadPageSources(layout);
  const colors = normalizeColorOverrides(home.colors);

  return (
    <SiteChrome contentStyle={colorOverrideStyle(colors)}>
      <PageRenderer layout={layout} sources={sources} colors={colors} />
    </SiteChrome>
  );
}
