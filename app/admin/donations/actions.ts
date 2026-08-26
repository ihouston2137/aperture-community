"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Donation, Sponsor, SponsorshipCampaign, User } from "@/lib/models";
import {
  dollarsToCents,
  donationKind,
  donationStatus,
  isoDate,
  uniqueIds,
} from "@/lib/sponsorship-types";

/** The dialog stays open on failure to show the message, so these report back. */
export type DonationActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("sponsorships.manage");
  await connectDB();
}

function revalidate() {
  revalidatePath("/admin/donations");
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/sponsors");
}

export async function saveDonationAction(
  formData: FormData
): Promise<DonationActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const campaignId = String(formData.get("campaignId") ?? "").trim();
  const sponsorId = String(formData.get("sponsorId") ?? "").trim();
  const memberIds = uniqueIds(formData.getAll("memberIds").map(String));

  if (!campaignId) return { ok: false, error: "Choose the campaign this is for." };
  if (!sponsorId) return { ok: false, error: "Choose who gave it." };

  const valueCents = dollarsToCents(formData.get("value"));
  if (valueCents <= 0) {
    return { ok: false, error: "Enter what it is worth, in dollars." };
  }

  const [campaign, sponsor] = await Promise.all([
    SponsorshipCampaign.exists({ _id: campaignId }),
    Sponsor.exists({ _id: sponsorId }),
  ]);
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };
  if (!sponsor) return { ok: false, error: "That sponsor no longer exists." };

  if (memberIds.length > 0) {
    const found = await User.find({ _id: { $in: memberIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== memberIds.length) {
      return { ok: false, error: "One of those accounts no longer exists." };
    }
  }

  const payload = {
    campaignId,
    sponsorId,
    kind: donationKind(formData.get("kind")),
    status: donationStatus(formData.get("status")),
    // Recorded today unless somebody says otherwise; a gift almost always
    // arrives before anyone gets round to entering it.
    date: isoDate(formData.get("date")) || new Date().toISOString().slice(0, 10),
    valueCents,
    description: String(formData.get("description") ?? "").trim().slice(0, 2000),
    memberIds,
  };

  if (id) await Donation.findByIdAndUpdate(id, payload);
  else await Donation.create(payload);

  revalidate();
  return { ok: true };
}

export async function deleteDonationAction(
  formData: FormData
): Promise<DonationActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That donation no longer exists." };

  await Donation.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}
