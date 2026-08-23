import { AdminHeader } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";

import { MediaManager } from "./media-manager";

export const metadata = { title: "Media library" };

export default async function MediaPage() {
  const { can } = await requirePermission("media.view");

  return (
    <>
      <AdminHeader
        title="Media library"
        subtitle="Images, video, audio and external embeds used across the site."
      />
      <MediaManager canUpload={can("media.upload")} canDelete={can("media.delete")} />
    </>
  );
}
