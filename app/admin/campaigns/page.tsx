import { AdminHeader } from "@/components/admin-ui";
import { requireAnyPermission } from "@/lib/access";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import {
  getCampaigns,
  getDonations,
  getSponsors,
  totalsByCampaign,
} from "@/lib/sponsorships";

import {
  CampaignManager,
  type CampaignTotalsMap,
  type PickerOption,
} from "./campaign-manager";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage() {
  const { permissions } = await requireAnyPermission([
    "sponsorships.manage",
    "sponsorships.view",
    "sponsorships.campaigns",
  ]);
  const access = sponsorshipAccess(permissions);
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
      <AdminHeader
        title="Campaigns"
        subtitle="What is being raised, over what stretch of time, and which member is looking after which sponsor while it runs."
      />

      <CampaignManager
        campaigns={campaigns}
        sponsors={sponsors.map((sponsor) => ({
          _id: sponsor._id,
          name: sponsor.name,
          isUnassignable: sponsor.isUnassignable,
        }))}
        members={members}
        totals={totals}
        canManage={access.canEditCampaigns}
      />
    </>
  );
}
