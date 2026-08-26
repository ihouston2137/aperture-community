import Link from "next/link";
import { redirect } from "next/navigation";

import {
  SponsorManager,
  type SponsorTotals,
} from "@/app/admin/sponsors/sponsor-manager";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import {
  getDonations,
  getRecognitionLevels,
  getSponsorCategories,
  getSponsors,
} from "@/lib/sponsorships";

export const metadata = { title: "Sponsors" };

/**
 * The sponsor records, without the panels that define what a level or a
 * category *is*.
 *
 * Somebody keeping the records up to date puts a sponsor at Gold; deciding what
 * Gold means is a decision about the programme, and stays in the site admin.
 */
export default async function ManagerSponsorsPage() {
  const session = await getSession();
  const { permissions } = await getUserAccess(session!.userId);
  const access = sponsorshipAccess(permissions);

  // The whole-programme lists are their own grant; hiding the link would
  // only hide the link.
  if (!access.canSeeRecords) redirect("/manage/sponsorships");

  await connectDB();

  const [sponsors, donations, levels, categories] = await Promise.all([
    getSponsors(),
    getDonations(),
    getRecognitionLevels(),
    getSponsorCategories(),
  ]);

  const totals: SponsorTotals = {};
  for (const donation of donations) {
    const entry = totals[donation.sponsorId] ?? { totalCents: 0, count: 0 };
    entry.totalCents += donation.valueCents;
    entry.count += 1;
    totals[donation.sponsorId] = entry;
  }

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/manage/sponsorships">Sponsorships</Link>
        <span aria-hidden="true">›</span>
        <span>Sponsors</span>
      </nav>

      <header className="manager-header">
        <h1 className="member-title">Sponsors</h1>
      </header>

      <SponsorManager
        sponsors={sponsors}
        levels={levels}
        categories={categories}
        totals={totals}
        canManage={access.canEditSponsors}
      />
    </>
  );
}
