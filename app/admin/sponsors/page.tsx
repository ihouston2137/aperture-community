import { AdminHeader } from "@/components/admin-ui";
import { requireAnyPermission } from "@/lib/access";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import { connectDB } from "@/lib/db";
import {
  getDonations,
  getRecognitionLevels,
  getSponsorCategories,
  getSponsors,
} from "@/lib/sponsorships";

import { CategoryManager } from "./category-manager";
import { SponsorManager, type SponsorTotals } from "./sponsor-manager";

export const metadata = { title: "Sponsors" };

export default async function SponsorsPage() {
  const { permissions } = await requireAnyPermission([
    "sponsorships.manage",
    "sponsorships.view",
    "sponsorships.sponsors",
  ]);
  const access = sponsorshipAccess(permissions);
  await connectDB();

  const [sponsors, donations, levels, categories] = await Promise.all([
    getSponsors(),
    getDonations(),
    getRecognitionLevels(),
    getSponsorCategories(),
  ]);

  // What each has given, so the list answers the first question anyone asks of
  // it without opening anything.
  const totals: SponsorTotals = {};
  for (const donation of donations) {
    const entry = totals[donation.sponsorId] ?? { totalCents: 0, count: 0 };
    entry.totalCents += donation.valueCents;
    entry.count += 1;
    totals[donation.sponsorId] = entry;
  }

  // How many sponsors carry each category, so one in use is obvious.
  const categoryCounts: Record<string, number> = {};
  for (const sponsor of sponsors) {
    for (const categoryId of sponsor.categoryIds) {
      categoryCounts[categoryId] = (categoryCounts[categoryId] ?? 0) + 1;
    }
  }

  return (
    <>
      <AdminHeader
        title="Sponsors"
        subtitle="Everybody who gives to a campaign — how to reach them, who to ask for, the artwork cleared for use, and what they are recognised at."
      />

      <SponsorManager
        sponsors={sponsors}
        levels={levels}
        categories={categories}
        totals={totals}
        canManage={access.canEditSponsors}
      />

      <CategoryManager
        categories={categories}
        counts={categoryCounts}
        canManage={access.canManageSetup}
      />
    </>
  );
}
