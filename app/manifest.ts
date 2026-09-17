import type { MetadataRoute } from "next";

import { getPwaSettings, manifestFrom } from "@/lib/pwa";
import { getSiteContent } from "@/lib/site-settings";

/**
 * `/manifest.webmanifest`, built from what the PWA settings page holds.
 *
 * Read at request time like every other route here, because the manifest is
 * content: an icon uploaded this morning has to be the icon somebody installs
 * this afternoon, without a deploy. Next links to it from every page by itself,
 * so nothing in the layout has to remember to.
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  try {
    const [settings, content] = await Promise.all([
      getPwaSettings(),
      getSiteContent(),
    ]);
    return manifestFrom(settings, content.metaTitle) as MetadataRoute.Manifest;
  } catch {
    // The database may not be reachable during a cold build; a manifest that
    // asks for nothing is better than a route that throws.
    return { name: "Aperture", short_name: "Aperture", start_url: "/", display: "browser" };
  }
}
