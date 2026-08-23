import { redirect } from "next/navigation";

/**
 * Site content is now a tab on the Appearance screen, beside the live preview.
 * The old route is kept so existing links and bookmarks still land somewhere
 * useful.
 */
export default function SiteContentPage() {
  redirect("/admin/styles");
}
