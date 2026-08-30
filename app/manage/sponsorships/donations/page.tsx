import Link from "next/link";
import { redirect } from "next/navigation";

import {
  DonationManager,
  type PickerOption,
} from "@/app/admin/donations/donation-manager";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import { getSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import { formatDollars } from "@/lib/sponsorship-types";
import {
  creditByMember,
  getCampaigns,
  getDonations,
  getSponsorCategories,
  getSponsors,
} from "@/lib/sponsorships";

export const metadata = { title: "Donations" };

export default async function ManagerDonationsPage() {
  const session = await getSession();
  const { permissions } = await getUserAccess(session!.userId);
  const access = sponsorshipAccess(permissions);

  // The whole-programme lists are their own grant; hiding the link would
  // only hide the link.
  if (!access.canSeeRecords) redirect("/manage/sponsorships");

  await connectDB();

  const [donations, campaigns, sponsors, categories, users, roles] =
    await Promise.all([
      getDonations(),
      getCampaigns(),
      getSponsors(),
      getSponsorCategories(),
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

  const credit = [...creditByMember(donations)]
    .map(([memberId, entry]) => ({
      name: nameById.get(memberId) ?? "an account that has gone",
      ...entry,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/manage/sponsorships">Sponsorships</Link>
        <span aria-hidden="true">›</span>
        <span>Donations</span>
      </nav>

      <header className="manager-header">
        <h1 className="member-title">Donations</h1>
      </header>

      <DonationManager
        donations={donations}
        campaigns={campaigns.map((campaign) => ({
          _id: campaign._id,
          name: campaign.name,
          isArchived: campaign.status === "archived",
          stretchGoals: campaign.stretchGoals,
        }))}
        sponsors={sponsors.map((sponsor) => ({
          _id: sponsor._id,
          name: sponsor.name,
        }))}
        members={members}
        categories={categories}
        canManage={access.canEditDonations}
      />

      {credit.length > 0 ? (
        <section className="member-card manager-card">
          <h2 className="member-card-title">Credit by member</h2>
          <p className="help-text">
            A donation credited to several people counts in full for each of them —
            this answers what somebody brought in, not what share of the total is
            theirs.
          </p>
          <ul className="manager-archived" style={{ marginTop: "1rem" }}>
            {credit.map((entry) => (
              <li key={entry.name}>
                <span>
                  {entry.name}
                  <span className="help-text">
                    {" "}
                    · {entry.count} donation{entry.count === 1 ? "" : "s"}
                  </span>
                </span>
                <span>{formatDollars(entry.totalCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
