"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Donation, Sponsor, SponsorshipCampaign, User } from "@/lib/models";
import {
  campaignStatus,
  dollarsToCents,
  isoDate,
  normalizeAssignments,
  normalizeStretchGoals,
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
  let stretchGoals;
  try {
    assignments = normalizeAssignments(
      JSON.parse(String(formData.get("assignments") ?? "[]"))
    );
    stretchGoals = normalizeStretchGoals(
      JSON.parse(String(formData.get("stretchGoals") ?? "[]"))
    );
  } catch {
    return { ok: false, error: "Could not read that campaign's details." };
  }

  // A tier above nothing is not a stretch: without a goal there is no target
  // for it to be above, and the bar would have nothing to measure it against.
  const goalCents = dollarsToCents(formData.get("goal"));
  if (stretchGoals.length > 0 && goalCents <= 0) {
    return {
      ok: false,
      error: "Stretch goals sit above a goal — set the campaign's goal first.",
    };
  }
  if (stretchGoals.some((goal) => !goal.description)) {
    return { ok: false, error: "Say what each stretch goal is for." };
  }

  // A tier keeps its id for life, because donations are applied to it by id.
  // Two tiers sharing one would take each other's gifts, so a repeat is given
  // a fresh id rather than being allowed through.
  const seen = new Set<string>();
  stretchGoals = stretchGoals.map((goal) => {
    const id = seen.has(goal.id) ? randomUUID() : goal.id;
    seen.add(id);
    return id === goal.id ? goal : { ...goal, id };
  });

  // Everything named has to still exist, or the campaign would list a sponsor
  // nobody can open and credit a member who has gone.
  const sponsorIds = assignments.map((entry) => entry.sponsorId);
  const memberIds = [...new Set(assignments.flatMap((entry) => entry.memberIds))];

  // Read alongside the existence check rather than in a query of its own: the
  // same rows answer both questions.
  const unassignable = new Set<string>();
  if (sponsorIds.length > 0) {
    const found = await Sponsor.find({ _id: { $in: sponsorIds } })
      .select("_id isUnassignable")
      .lean<any[]>();
    if (found.length !== sponsorIds.length) {
      return { ok: false, error: "One of those sponsors no longer exists." };
    }
    for (const sponsor of found) {
      if (sponsor.isUnassignable) unassignable.add(String(sponsor._id));
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
    goalCents,
    stretchGoals,
    // A sponsor set to take no assignment keeps none, whatever the form sent:
    // the flag is the sponsor's own, and a campaign does not get to overrule it
    // by having had its dialog open since before the flag was set.
    assignments: assignments.map((entry) =>
      unassignable.has(entry.sponsorId) ? { ...entry, memberIds: [] } : entry
    ),
  };

  if (id) {
    await SponsorshipCampaign.findByIdAndUpdate(id, payload);

    // A tier that has gone takes its earmarks with it: a gift pointing at
    // nothing would read as unallocated anyway, and saying so in the data
    // beats working it out at every place that shows one.
    await Donation.updateMany(
      {
        campaignId: id,
        stretchGoalId: { $nin: ["", ...stretchGoals.map((goal) => goal.id)] },
      },
      { $set: { stretchGoalId: "" } }
    );
  } else {
    await SponsorshipCampaign.create(payload);
  }

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
