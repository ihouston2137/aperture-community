import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { contentPermissions } from "@/lib/content-access";
import { getSession } from "@/lib/session";

export const metadata = { title: "Site content" };

/**
 * The content dashboard: what somebody who writes for the site came to do, and
 * nothing else.
 *
 * Deliberately outside the site admin, for the same reason the sponsorships
 * dashboard is. The admin is organised around running the whole site — media,
 * appearance, accounts, roles — which is the right shape for an administrator
 * and the wrong shape for somebody asked to keep the stories up to date. This
 * wears the site's own chrome, so a member who never sees the admin is not sent
 * somewhere unfamiliar to write.
 *
 * The editors themselves are still the admin's. Nothing is rebuilt here — the
 * dashboard is a way in, and each row opens the editor that already exists.
 */
export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/manage/content");

  const { permissions, membershipStatus } = await getUserAccess(session.userId);

  // Sent to their own dashboard rather than to a sign-in form: they are signed
  // in, they simply have not been given this.
  if (membershipStatus !== "active" || !contentPermissions(permissions).canView) {
    redirect("/dashboard");
  }

  return (
    <SiteChrome>
      {/* Wide: the diagram wants every pixel of the window, and the inspector
          beside it wants a column of its own. */}
      <div className="member-page is-wide">{children}</div>
    </SiteChrome>
  );
}
