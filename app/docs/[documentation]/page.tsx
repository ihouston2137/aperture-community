import { notFound, redirect } from "next/navigation";
import { guardContent } from "@/lib/content-guard";

import { firstDocOfSet, getDocSetBySlug } from "@/lib/docs";
import { getSiteContent } from "@/lib/site-settings";
import { socialMetadata } from "@/lib/social-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ documentation: string }>;
}) {
  const { documentation } = await params;
  const set = await getDocSetBySlug(documentation);
  if (!set) return {};

  const siteContent = await getSiteContent();

  return socialMetadata({
    title: set.title,
    description: set.description,
    image: siteContent.metaImageUrl,
    type: "article",
  });
}

/**
 * A set has no page of its own: it opens on the first document in its order.
 *
 * A redirect rather than rendering that document here, so one page never
 * answers at two addresses — which would split its links and confuse a search
 * index about which is canonical.
 */
export default async function DocSetPage({
  params,
}: {
  params: Promise<{ documentation: string }>;
}) {
  const { documentation } = await params;

  const set = await getDocSetBySlug(documentation);
  if (!set || set.status !== "published") notFound();
  await guardContent("documentation", set._id, `/docs/${documentation}`);

  const first = await firstDocOfSet(set._id);
  if (!first) notFound();

  redirect(`/docs/${set.slug}/${first.slug}`);
}
