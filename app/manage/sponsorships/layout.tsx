import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { getSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";

export const metadata = { title: "Sponsorships" };

/**
 * The sponsorships dashboard: everything somebody running a campaign needs, and
 * nothing else.
 *
 * Deliberately outside the site admin. The admin is organised around the whole
 * site — pages, media, appearance, accounts — which is the right shape for
 * somebody who runs it and the wrong shape for somebody who has been asked to
 * keep the sponsorship records up to date. This wears the site's own chrome, so
 * a member who never sees the admin is not sent somewhere unfamiliar to do it.
 *
 * There is no tab bar. Each screen is reached by opening the thing it is about,
 * and every screen below the top carries the way back — which keeps where you
 * are and how you got there the same question.
 */
export default async function SponsorshipsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/manage/sponsorships");

  const { permissions, membershipStatus } = await getUserAccess(session.userId);

  // Sent to their own dashboard rather than to a sign-in form: they are signed
  // in, they simply have not been given this.
  if (membershipStatus !== "active" || !sponsorshipAccess(permissions).canView) {
    redirect("/dashboard");
  }

  return (
    <SiteChrome>
      <div className="member-page">{children}</div>
    </SiteChrome>
  );
}
