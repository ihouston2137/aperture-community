import { notFound } from "next/navigation";
import { guardContent } from "@/lib/content-guard";

import { CollectionGallery } from "@/components/collection-gallery";
import { CollectionHeader } from "@/components/collection-header";
import { SiteChrome } from "@/components/site-chrome";
import { getCollectionBySlug } from "@/lib/collections";
import { styleSlotProps } from "@/lib/display-templates";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { getSafeMode } from "@/lib/safe-mode";
import { getSiteContent } from "@/lib/site-settings";
import { socialMetadata } from "@/lib/social-metadata";
import { CONTENT_WIDTH_VALUES } from "@/lib/site-values";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection?.isPublic) return {};

  return socialMetadata({
    title: collection.name,
    description: collection.description,
    // `featureImage` already falls back to the first image in the current
    // order, so a shared gallery always previews with a picture.
    image: collection.featureImage?.url,
  });
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection || !collection.isPublic) notFound();
  await guardContent("collection", collection.id, `/collections/${slug}`);

  const siteContent = await getSiteContent();
  const safeMode = await getSafeMode(siteContent.safeModeDefault);
  const pageStyled = styleSlotProps(collection.pageStyle);

  return (
    <SiteChrome>
      {/* The named width scale rows and the site chrome already use. */}
      <div
        className={`page-shell collection-page ${pageStyled.className}`.trim()}
        style={{
          maxWidth: CONTENT_WIDTH_VALUES[collection.display.pageWidth],
          ...pageStyled.style,
        }}
      >
        <CollectionHeader
          header={collection.header}
          category={collection.category}
          name={collection.name}
          description={collection.description}
        />

        <CollectionGallery collection={collection} safeMode={safeMode} />
      </div>
    </SiteChrome>
  );
}
