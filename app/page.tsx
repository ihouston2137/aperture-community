import { connectDB } from "@/lib/db";
import { SitePage } from "@/lib/models";
import { colorOverrideStyle, normalizeColorOverrides } from "@/lib/color-overrides";
import { filterLayoutForViewer, normalizePageLayout } from "@/lib/page-layout";
import { getMenuViewer } from "@/lib/menus";
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

  /*
   * Restricted rows are dropped here, before the sources are loaded — so what
   * a stranger may not see is neither fetched for them nor sent to them.
   */
  const layout = filterLayoutForViewer(
    normalizePageLayout(home.layout, normalizeBlocksWithStorySlots),
    await getMenuViewer()
  );
  const sources = await loadPageSources(layout);
  const colors = normalizeColorOverrides(home.colors);

  return (
    <SiteChrome contentStyle={colorOverrideStyle(colors)}>
      <PageRenderer layout={layout} sources={sources} colors={colors} />
    </SiteChrome>
  );
}
