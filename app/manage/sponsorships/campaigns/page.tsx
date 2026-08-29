import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CampaignManager,
  type CampaignTotalsMap,
  type PickerOption,
} from "@/app/admin/campaigns/campaign-manager";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import { getSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import {
  getCampaigns,
  getDonations,
  getSponsors,
  totalsByCampaign,
} from "@/lib/sponsorships";

import { ToneLegend } from "../tone-legend";

export const metadata = { title: "Campaigns" };

/**
 * Every campaign on file, closed ones included.
 *
 * The dashboard is about what is running; this is the record of everything. A
 * closed campaign is withheld here for the same reason it is withheld there —
 * its final figures are their own grant.
 */
export default async function ManagerCampaignsPage() {
  const session = await getSession();
  const { permissions } = await getUserAccess(session!.userId);
  const access = sponsorshipAccess(permissions);

  // Hiding the link would only hide the link.
  if (!access.canSeeRecords) redirect("/manage/sponsorships");

  await connectDB();

  const [campaigns, sponsors, donations, users, roles] = await Promise.all([
    getCampaigns(),
    getSponsors(),
    getDonations(),
    /*
     * Inactive accounts included.
     *
     * A campaign is a record of who looked after whom, and last year's
     * campaign does not stop having had its people because they have since
     * left. Filtering them out did two things wrong at once: an assignment
     * already on file read as "somebody who has gone", and nobody could put a
     * past member back on a past campaign to correct it.
     */
    User.find()
      .select("_id firstName lastName name email roleIds isActive")
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean<any[]>(),
    getRoleSummaries("community"),
  ]);

  const visible = access.canSeeClosed
    ? campaigns
    : campaigns.filter((campaign) => campaign.status !== "closed");

  const seedEmail = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const members: PickerOption[] = users
    .filter((user) => {
      if (seedEmail && String(user.email ?? "").toLowerCase() === seedEmail) {
        return false;
      }
      return roles.some((role) => (user.roleIds ?? []).map(String).includes(role._id));
    })
    .map((user) => ({
      _id: String(user._id),
      name: fullName(user),
      // Said in the picker, because naming somebody who has left is usually
      // deliberate and occasionally a mistake.
      title: user.isActive === false ? "inactive" : undefined,
    }));

  const totals: CampaignTotalsMap = {};
  for (const [campaignId, entry] of totalsByCampaign(donations)) {
    totals[campaignId] = entry;
  }

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/manage/sponsorships">Sponsorships</Link>
        <span aria-hidden="true">›</span>
        <span>Campaigns</span>
      </nav>

      <header className="manager-header">
        <h1 className="member-title">Campaigns</h1>
      </header>

      <CampaignManager
        campaigns={visible}
        sponsors={sponsors.map((sponsor) => ({
          _id: sponsor._id,
          name: sponsor.name,
        }))}
        members={members}
        totals={totals}
        canManage={access.canEditCampaigns}
      />

      <ToneLegend />
    </>
  );
}
