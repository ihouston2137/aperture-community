import { AdminHeader } from "@/components/admin-ui";
import { requireAnyPermission } from "@/lib/access";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import { connectDB } from "@/lib/db";
import {
  getRecognitionLevels,
  getSponsorBenefits,
  getSponsors,
} from "@/lib/sponsorships";

import { BenefitManager } from "./benefit-manager";
import { RecognitionManager } from "./recognition-manager";

export const metadata = { title: "Levels" };

export default async function LevelsPage() {
  const { permissions } = await requireAnyPermission([
    "sponsorships.manage",
    "sponsorships.view",
  ]);
  const access = sponsorshipAccess(permissions);
  await connectDB();

  const [levels, benefits, sponsors] = await Promise.all([
    getRecognitionLevels(),
    getSponsorBenefits(),
    getSponsors(),
  ]);

  // How many sponsors sit at each level, and how many levels promise each
  // benefit — so anything in use is obvious before somebody tries to delete it.
  const counts: Record<string, number> = {};
  for (const sponsor of sponsors) {
    if (!sponsor.recognitionLevelId) continue;
    counts[sponsor.recognitionLevelId] =
      (counts[sponsor.recognitionLevelId] ?? 0) + 1;
  }

  const usage: Record<string, number> = {};
  for (const level of levels) {
    for (const benefitId of level.benefitIds) {
      usage[benefitId] = (usage[benefitId] ?? 0) + 1;
    }
  }

  return (
    <>
      <AdminHeader
        title="Levels"
        subtitle="The tiers sponsors are recognised at, and what a sponsor at each of them receives."
      />

      <div className="levels-grid">
        <RecognitionManager
          levels={levels}
          benefits={benefits}
          counts={counts}
          canManage={access.canManageSetup}
        />

        <BenefitManager
          benefits={benefits}
          usage={usage}
          canManage={access.canManageSetup}
        />
      </div>
    </>
  );
}
