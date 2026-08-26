"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Donation, Sponsor, SponsorshipCampaign, User } from "@/lib/models";
import {
  campaignStatus,
  dollarsToCents,
  isoDate,
  normalizeAssignments,
} from "@/lib/sponsorship-types";

/** The dialog stays open on failure to show the message, so these report back. */
export type CampaignActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("sponsorships.manage");
  await connectDB();
}

function revalidate() {
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/donations");
  revalidatePath("/admin/sponsors");
}

export async function saveCampaignAction(
  formData: FormData
): Promise<CampaignActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 160);
  if (!name) return { ok: false, error: "Name the campaign." };

  const startDate = isoDate(formData.get("startDate"));
  const endDate = isoDate(formData.get("endDate"));
  // A campaign that ends before it starts is a typo, not a date range.
  if (startDate && endDate && endDate < startDate) {
    return { ok: false, error: "The end date is before the start date." };
  }

  let assignments;
  try {
    assignments = normalizeAssignments(
      JSON.parse(String(formData.get("assignments") ?? "[]"))
    );
  } catch {
    return { ok: false, error: "Could not read those sponsor assignments." };
  }

  // Everything named has to still exist, or the campaign would list a sponsor
  // nobody can open and credit a member who has gone.
  const sponsorIds = assignments.map((entry) => entry.sponsorId);
  const memberIds = [...new Set(assignments.flatMap((entry) => entry.memberIds))];

  if (sponsorIds.length > 0) {
    const found = await Sponsor.find({ _id: { $in: sponsorIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== sponsorIds.length) {
      return { ok: false, error: "One of those sponsors no longer exists." };
    }
  }
  if (memberIds.length > 0) {
    const found = await User.find({ _id: { $in: memberIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== memberIds.length) {
      return { ok: false, error: "One of those accounts no longer exists." };
    }
  }

  const payload = {
    name,
    description: String(formData.get("description") ?? "").trim().slice(0, 2000),
    status: campaignStatus(formData.get("status")),
    startDate,
    endDate,
    goalCents: dollarsToCents(formData.get("goal")),
    assignments,
  };

  if (id) await SponsorshipCampaign.findByIdAndUpdate(id, payload);
  else await SponsorshipCampaign.create(payload);

  revalidate();
  return { ok: true };
}

export async function deleteCampaignAction(
  formData: FormData
): Promise<CampaignActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That campaign no longer exists." };

  // The donations are the record of what was raised; deleting the campaign
  // under them would leave gifts belonging to nothing.
  const donations = await Donation.countDocuments({ campaignId: id });
  if (donations > 0) {
    return {
      ok: false,
      error: `That campaign has ${donations} donation${
        donations === 1 ? "" : "s"
      } recorded. Remove those first if it really should go.`,
    };
  }

  await SponsorshipCampaign.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}
