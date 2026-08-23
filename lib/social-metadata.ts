import type { Metadata } from "next";

import { protectedMediaUrl } from "./protected-media-url";

/**
 * The Open Graph and Twitter card for a public page.
 *
 * Built in one place because Next **replaces** the whole `openGraph` object
 * when a route defines one — nothing merges with the root layout's — and
 * `og:title` is not derived from `title`. A route that set only an image would
 * publish a card with a picture and no name on it, which is what every one of
 * these pages was doing.
 *
 * Absolute URLs come from `metadataBase` in the root layout, so the media paths
 * here stay relative and keep going through the protected media route.
 */
export function socialMetadata({
  title,
  description,
  image,
  type = "website",
}: {
  title: string;
  description?: string;
  /** A local media path; run through the media route like every other asset. */
  image?: string;
  type?: "website" | "article";
}): Metadata {
  const resolved = image ? protectedMediaUrl(image) : "";
  const images = resolved ? [resolved] : undefined;
  const text = description?.trim() || undefined;

  return {
    title,
    description: text,
    openGraph: {
      title,
      description: text,
      type,
      images,
    },
    twitter: {
      // Without an image there is nothing to show large.
      card: images ? "summary_large_image" : "summary",
      title,
      description: text,
      images,
    },
  };
}
