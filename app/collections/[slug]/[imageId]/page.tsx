import { notFound } from "next/navigation";

import { CollectionImageStage } from "@/components/collection-image-stage";
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
  params: Promise<{ slug: string; imageId: string }>;
}) {
  const { slug, imageId } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection?.isPublic) return {};

  const image = collection.images.find((item) => item.id === imageId);
  if (!image) return {};

  return socialMetadata({
    // The picture itself, and its own title — a shared image should preview as
    // that image, not as the gallery it came from.
    title: image.title || collection.name,
    description: image.caption,
    image: image.url,
  });
}

export default async function CollectionImagePage({
  params,
}: {
  params: Promise<{ slug: string; imageId: string }>;
}) {
  const { slug, imageId } = await params;

  const collection = await getCollectionBySlug(slug);
  if (!collection || !collection.isPublic) notFound();

  const index = collection.images.findIndex((image) => image.id === imageId);
  if (index === -1) notFound();

  const image = collection.images[index];
  const previous = collection.images[index - 1];
  const next = collection.images[index + 1];

  const siteContent = await getSiteContent();
  const safeMode = await getSafeMode(siteContent.safeModeDefault);
  const pageStyled = styleSlotProps(collection.pageStyle);
  const step = (id: string) => ({ href: `/collections/${collection.slug}/${id}` });

  return (
    <SiteChrome>
      <div
        className={`page-shell collection-page${
          collection.display.allowContextMenu ? "" : " no-context-menu"
        } ${pageStyled.className}`.trim()}
        style={{
          maxWidth: CONTENT_WIDTH_VALUES[collection.display.pageWidth],
          ...pageStyled.style,
        }}
      >
        {/*
         * The same component the lightbox renders, reading the same settings —
         * this page and that overlay are one view of an image at two addresses,
         * so neither can drift from the other.
         */}
        <CollectionImageStage
          collection={collection}
          image={image}
          safeMode={safeMode}
          showName
          exit={{
            label: collection.display.imageExitLabel,
            href: `/collections/${collection.slug}`,
          }}
          previous={previous ? step(previous.id) : null}
          next={next ? step(next.id) : null}
        />
      </div>
    </SiteChrome>
  );
}
