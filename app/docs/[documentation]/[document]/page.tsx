import { notFound } from "next/navigation";

import { DocRenderer } from "@/components/doc-renderer";
import { colorOverrideStyle } from "@/lib/color-overrides";
import { SiteChrome } from "@/components/site-chrome";
import {
  docTree,
  getDocBySlug,
  getDocSetBySlug,
  resolveDocTemplate,
  toDocView,
} from "@/lib/docs";
import { loadPageSources } from "@/lib/page-sources";
import { getSession } from "@/lib/session";
import { getSiteContent } from "@/lib/site-settings";
import { socialMetadata } from "@/lib/social-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentation: string; document: string }>;
}) {
  const { documentation, document } = await params;

  const set = await getDocSetBySlug(documentation);
  if (!set) return {};

  const doc = await getDocBySlug(set._id, document);
  if (!doc) return {};

  const siteContent = await getSiteContent();

  return socialMetadata({
    // The set names the context, which is what a shared link or a search
    // result needs when several sets each have an "Overview".
    title: `${doc.title} · ${set.title}`,
    description: doc.description || set.description,
    image: siteContent.metaImageUrl,
    type: "article",
  });
}

export default async function DocPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentation: string; document: string }>;
  searchParams: Promise<{ previewId?: string }>;
}) {
  const { documentation, document } = await params;
  const { previewId } = await searchParams;

  const set = await getDocSetBySlug(documentation);
  if (!set) notFound();

  const doc = await getDocBySlug(set._id, document);
  if (!doc) notFound();

  // A draft page, or a page in a draft set, is visible only to a signed-in user
  // following an explicit preview link — so a guessed address never leaks work
  // in progress, and publishing a page inside an unpublished set does not
  // publish it by accident.
  const isDraft = set.status !== "published" || doc.status !== "published";
  if (isDraft) {
    const session = await getSession();
    if (!session || previewId !== String(doc._id)) notFound();
  }

  const [template, view, tree] = await Promise.all([
    resolveDocTemplate(set.templateId),
    toDocView(doc, set),
    docTree(set._id, true),
  ]);

  // Templates can carry ordinary page blocks, which reference other records.
  const sources = await loadPageSources(template.layout);

  return (
    <SiteChrome contentStyle={colorOverrideStyle(template.colors)}>
      <DocRenderer
        layout={template.layout}
        doc={view}
        tree={tree}
        sources={sources}
        colors={template.colors}
      />
    </SiteChrome>
  );
}
