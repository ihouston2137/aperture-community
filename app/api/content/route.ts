import { connectDB } from "@/lib/db";
import { Bio, SitePage, Story } from "@/lib/models";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { getSafeMode } from "@/lib/safe-mode";
import { getAppearance, getSiteContent } from "@/lib/site-settings";

/**
 * Public read-only snapshot of the site: appearance, site content, the home
 * page reference, the latest story and the primary profile.
 */
export async function GET() {
  await connectDB();

  const [appearance, siteContent, home, latestStory, primaryBio] = await Promise.all([
    getAppearance(),
    getSiteContent(),
    SitePage.findOne({ isHome: true, status: "published" }).select("title slug").lean<any>(),
    Story.findOne({ status: "published" }).sort({ publishDate: -1 }).lean<any>(),
    Bio.findOne({ isPrimary: true }).lean<any>(),
  ]);

  const safeMode = await getSafeMode(siteContent.safeModeDefault);

  return Response.json({
    appearance,
    siteContent,
    home: home ? { title: home.title, slug: home.slug } : null,
    latestStory: latestStory
      ? {
          headline: latestStory.headline,
          slug: latestStory.slug,
          subHeadline: latestStory.subHeadline ?? "",
          publishDate: latestStory.publishDate,
          featureMediaUrl: protectedMediaUrl(latestStory.featureMediaUrl ?? ""),
        }
      : null,
    primaryBio: primaryBio
      ? {
          name: primaryBio.name,
          slug: primaryBio.slug,
          title: primaryBio.title ?? "",
          location: primaryBio.location ?? "",
          description: primaryBio.description ?? "",
          headshotUrl: protectedMediaUrl(primaryBio.headshotUrl ?? ""),
        }
      : null,
    nsfw: {
      enabled: NSFW_FEATURES_ENABLED,
      // Reported as off with the feature disabled so a consumer never draws a
      // toggle for a mode the site cannot enter.
      safeModeDefault: NSFW_FEATURES_ENABLED && siteContent.safeModeDefault,
      safeMode,
    },
  });
}
