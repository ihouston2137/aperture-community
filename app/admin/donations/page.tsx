import { AdminHeader, Panel } from "@/components/admin-ui";
import { requireAnyPermission } from "@/lib/access";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import { formatDollars } from "@/lib/sponsorship-types";
import {
  creditByMember,
  getCampaigns,
  getDonations,
  getSponsors,
} from "@/lib/sponsorships";

import { DonationManager, type PickerOption } from "./donation-manager";

export const metadata = { title: "Donations" };

export default async function DonationsPage() {
  const { permissions } = await requireAnyPermission([
    "sponsorships.manage",
    "sponsorships.view",
    "sponsorships.donations",
  ]);
  const access = sponsorshipAccess(permissions);
  await connectDB();

  const [donations, campaigns, sponsors, users, roles] = await Promise.all([
    getDonations(),
    getCampaigns(),
    getSponsors(),
    User.find({ isActive: { $ne: false } })
      .select("_id firstName lastName name email roleIds")
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
    .map((user) => ({ _id: String(user._id), name: fullName(user) }));

  const nameById = new Map(members.map((member) => [member._id, member.name]));

  // Who has brought in what, most first. The figure counts a shared donation in
  // full for each member credited with it.
  const credit = [...creditByMember(donations)]
    .map(([memberId, entry]) => ({
      name: nameById.get(memberId) ?? "an account that has gone",
      ...entry,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return (
    <>
      <AdminHeader
        title="Donations"
        subtitle="Every donation, what it was worth, and the members credited with bringing it in."
      />

      <DonationManager
        donations={donations}
        campaigns={campaigns.map((campaign) => ({
          _id: campaign._id,
          name: campaign.name,
          isClosed: campaign.status === "closed",
          stretchGoals: campaign.stretchGoals,
        }))}
        sponsors={sponsors.map((sponsor) => ({
          _id: sponsor._id,
          name: sponsor.name,
        }))}
        members={members}
        canManage={access.canEditDonations}
      />

      {credit.length > 0 ? (
        <Panel title="Credit by member">
          <p className="help-text">
            A donation credited to several people counts in full for each of them —
            this answers what somebody brought in, not what share of the total is
            theirs.
          </p>
          <ul className="admin-list" style={{ marginTop: "1rem" }}>
            {credit.map((entry) => (
              <li key={entry.name} className="admin-list-item">
                <div>
                  <h3>{entry.name}</h3>
                  <div className="admin-list-meta">
                    {entry.count} donation{entry.count === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="badge badge-published">
                  {formatDollars(entry.totalCents)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
