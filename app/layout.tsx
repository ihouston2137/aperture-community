import type { Metadata, Viewport } from "next";

import "./globals.css";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { customStyleCss, fontImportCss } from "@/lib/custom-style-css";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { appleTouchIcon, getPwaSettings } from "@/lib/pwa";
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
    const [content, appearance, pwa] = await Promise.all([
      getSiteContent(),
      getAppearance(),
      getPwaSettings(),
    ]);
    /*
     * iOS does not read the manifest for either of these: the home screen icon
     * comes from a `link` tag, and whether the app opens in its own window
     * comes from a `meta` tag. So the settings are said twice — once in the
     * manifest for everybody else, once here for Apple.
     */
    const apple = pwa.isEnabled ? appleTouchIcon(pwa.icons) : null;
    return {
      // Social cards need absolute URLs. Without this every image in a shared
      // preview resolves against localhost and nothing renders for the reader.
      metadataBase: siteUrl(),
      title: { default: content.metaTitle, template: `%s · ${content.metaTitle}` },
      description: content.metaDescription || undefined,
      // Through the media route like every other local asset. `public/uploads`
      // is snapshotted at build time, so a file uploaded afterwards is not
      // served from its raw path at all.
      icons:
        appearance.faviconUrl || apple
          ? {
              icon: appearance.faviconUrl
                ? protectedMediaUrl(appearance.faviconUrl)
                : undefined,
              apple: apple ? protectedMediaUrl(apple.url) : undefined,
            }
          : undefined,
      appleWebApp:
        pwa.isEnabled && pwa.display !== "browser"
          ? {
              capable: true,
              title: pwa.shortName || pwa.name || content.metaTitle,
              statusBarStyle: pwa.appleStatusBarStyle,
            }
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

/**
 * The colour the device paints its own furniture with — the title bar of an
 * installed app, the tab strip of a browser that follows it.
 *
 * Its own export because that is where Next reads it from; `themeColor` in the
 * metadata is ignored. Only stated when the app is turned on, so a site that
 * is not offering itself as an app leaves the browser's own colours alone.
 */
export async function generateViewport(): Promise<Viewport> {
  try {
    const pwa = await getPwaSettings();
    return pwa.isEnabled ? { themeColor: pwa.themeColor } : {};
  } catch {
    return {};
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
