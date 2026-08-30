import { requirePermission } from "@/lib/access";
import { loadBuilderSources } from "@/lib/builder-sources";
import { emptyColorOverrides } from "@/lib/color-overrides";
import { createRow, NEW_CONTAINER_PADDING } from "@/lib/page-layout";
import { loadPageSources } from "@/lib/page-sources";
import { getAppearance, getSiteContent } from "@/lib/site-settings";

import { PageBuilder } from "../page-builder";

export const metadata = { title: "New page" };

export default async function NewPagePage() {
  await requirePermission("pages.manage");

  const [sources, previewSources, appearance, content] = await Promise.all([
    loadBuilderSources(),
    loadPageSources([]),
    getAppearance(),
    getSiteContent(),
  ]);

  return (
    <PageBuilder
      page={{ title: "", slug: "", status: "draft", isHome: false, layout: [createRow(1, NEW_CONTAINER_PADDING)], colors: emptyColorOverrides }}
      sources={sources}
      previewSources={previewSources}
      chrome={{ appearance, content }}
    />
  );
}
