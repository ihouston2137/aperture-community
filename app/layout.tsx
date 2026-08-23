import type { Metadata } from "next";

import "./globals.css";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { customStyleCss, fontImportCss } from "@/lib/custom-style-css";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  appearanceCssVariables,
  getAppearance,
  getDesignAssets,
  getSiteContent,
  siteTextStyleCss,
} from "@/lib/site-settings";

/**
 * Every route reads live CMS content from MongoDB, so nothing is prerendered at
 * build time — that also keeps `next build` from needing a database.
 */
export const dynamic = "force-dynamic";

/**
 * Where this site is published. Falls back to localhost so a developer sees a
 * working preview rather than a build that refuses relative metadata URLs.
 */
function siteUrl(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [content, appearance] = await Promise.all([getSiteContent(), getAppearance()]);
    return {
      // Social cards need absolute URLs. Without this every image in a shared
      // preview resolves against localhost and nothing renders for the reader.
      metadataBase: siteUrl(),
      title: { default: content.metaTitle, template: `%s · ${content.metaTitle}` },
      description: content.metaDescription || undefined,
      // Through the media route like every other local asset. `public/uploads`
      // is snapshotted at build time, so a file uploaded afterwards is not
      // served from its raw path at all.
      icons: appearance.faviconUrl
        ? { icon: protectedMediaUrl(appearance.faviconUrl) }
        : undefined,
      openGraph: content.metaImageUrl
        ? { images: [protectedMediaUrl(content.metaImageUrl)] }
        : undefined,
    };
  } catch {
    // The database may not be reachable during a cold build.
    return { title: "Aperture" };
  }
}

async function loadThemeCss() {
  try {
    const [appearance, design] = await Promise.all([getAppearance(), getDesignAssets()]);
    return [
      fontImportCss(design.fonts),
      appearanceCssVariables(appearance),
      // Per-element header/page/footer text styling.
      siteTextStyleCss(appearance.textStyles),
      customStyleCss(design.styles),
    ]
      .filter(Boolean)
      .join("\n\n");
  } catch {
    return "";
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const themeCss = await loadThemeCss();

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        {/* Appearance tokens, design-library font imports and named styles are
            emitted once here so previews and public pages resolve identically. */}
        {themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      </head>
      <body>
        {children}
        {/* Every route, admin included — the collector discards the paths that
            are not a visitor reading the site. */}
        <AnalyticsBeacon />
      </body>
    </html>
  );
}
