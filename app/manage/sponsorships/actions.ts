"use server";

import { revalidatePath } from "next/cache";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { RecognitionLevel, Sponsor, SponsorshipCampaign, User } from "@/lib/models";
import { requireSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import { normalizeContacts, uniqueIds } from "@/lib/sponsorship-types";

/** The dialog stays open on failure to show the message, so these report back. */
export type ManageResult = { ok: boolean; error?: string };

/**
 * Narrow actions, each changing one thing.
 *
 * The campaign editor writes the whole record, which is right when somebody is
 * editing the whole record and wrong when they are changing who looks after one
 * sponsor: two people working on the same campaign would overwrite each other's
 * unrelated edits. These touch only the field they are named for.
 */
async function access() {
  const session = await requireSession();
  const { permissions } = await getUserAccess(session.userId);
  await connectDB();
  return sponsorshipAccess(permissions);
}

function revalidate() {
  revalidatePath("/manage/sponsorships", "layout");
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/sponsors");
}

/** Puts a sponsor on a campaign, with nobody looking after them yet. */
export async function addCampaignSponsorAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditCampaigns) {
    return { ok: false, error: "You cannot change this campaign." };
  }

  const campaignId = String(formData.get("campaignId") ?? "");
  const sponsorId = String(formData.get("sponsorId") ?? "");
  if (!sponsorId) return { ok: false, error: "Choose a sponsor." };

  const campaign = await SponsorshipCampaign.findById(campaignId);
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };
  if (!(await Sponsor.exists({ _id: sponsorId }))) {
    return { ok: false, error: "That sponsor no longer exists." };
  }

  const already = (campaign.assignments ?? []).some(
    (entry: any) => String(entry.sponsorId) === sponsorId
  );
  if (already) return { ok: false, error: "They are already on this campaign." };

  campaign.assignments = [
    ...(campaign.assignments ?? []),
    { sponsorId, memberIds: [] },
  ];
  await campaign.save();

  revalidate();
  return { ok: true };
}

/**
 * Creates a sponsor and puts them straight on the campaign.
 *
 * Only a name is asked for. Somebody adding a sponsor mid-campaign has just got
 * off the phone with them; the rest of the record can be filled in later, and a
 * form that insisted on it now would get a row of placeholders instead.
 */
export async function createCampaignSponsorAction(
  formData: FormData
): Promise<ManageResult> {
  const allowed = await access();
  if (!allowed.canEditCampaigns) {
    return { ok: false, error: "You cannot change this campaign." };
  }
  if (!allowed.canEditSponsors) {
    return { ok: false, error: "You cannot create a sponsor." };
  }

  const campaignId = String(formData.get("campaignId") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 160);
  if (!name) return { ok: false, error: "Name the sponsor." };

  const campaign = await SponsorshipCampaign.findById(campaignId);
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };

  // A second sponsor of the same name would be indistinguishable in every list
  // it appears in, and is nearly always the same one entered twice.
  const clash = await Sponsor.findOne({ name })
    .collation({ locale: "en", strength: 2 })
    .select("_id")
    .lean<any>();
  if (clash) {
    return {
      ok: false,
      error: "A sponsor of that name is already on file — choose them above.",
    };
  }

  const created = await Sponsor.create({ name });
  campaign.assignments = [
    ...(campaign.assignments ?? []),
    { sponsorId: String(created._id), memberIds: [] },
  ];
  await campaign.save();

  revalidate();
  return { ok: true };
}

/** Takes a sponsor off a campaign. Their gifts to it are untouched. */
export async function removeCampaignSponsorAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditCampaigns) {
    return { ok: false, error: "You cannot change this campaign." };
  }

  const campaignId = String(formData.get("campaignId") ?? "");
  const sponsorId = String(formData.get("sponsorId") ?? "");

  await SponsorshipCampaign.findByIdAndUpdate(campaignId, {
    $pull: { assignments: { sponsorId } },
  });

  revalidate();
  return { ok: true };
}

/** Sets who looks after one sponsor on one campaign. */
export async function setCampaignAssignedAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditCampaigns) {
    return { ok: false, error: "You cannot change this campaign." };
  }

  const campaignId = String(formData.get("campaignId") ?? "");
  const sponsorId = String(formData.get("sponsorId") ?? "");
  const memberIds = uniqueIds(formData.getAll("memberIds").map(String));

  const campaign = await SponsorshipCampaign.findById(campaignId);
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };

  if (memberIds.length > 0) {
    const found = await User.find({ _id: { $in: memberIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== memberIds.length) {
      return { ok: false, error: "One of those accounts no longer exists." };
    }
  }

  const assignments = (campaign.assignments ?? []).map((entry: any) =>
    String(entry.sponsorId) === sponsorId
      ? { sponsorId, memberIds }
      : { sponsorId: String(entry.sponsorId), memberIds: (entry.memberIds ?? []).map(String) }
  );
  campaign.assignments = assignments;
  await campaign.save();

  revalidate();
  return { ok: true };
}

/** Moves a sponsor to a recognition level, or off every level. */
export async function setSponsorRecognitionAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditSponsors) {
    return { ok: false, error: "You cannot change this sponsor." };
  }

  const sponsorId = String(formData.get("sponsorId") ?? "");
  const recognitionLevelId = String(formData.get("recognitionLevelId") ?? "").trim();

  if (recognitionLevelId && !(await RecognitionLevel.exists({ _id: recognitionLevelId }))) {
    return { ok: false, error: "That recognition level no longer exists." };
  }
  if (!(await Sponsor.exists({ _id: sponsorId }))) {
    return { ok: false, error: "That sponsor no longer exists." };
  }

  await Sponsor.findByIdAndUpdate(sponsorId, { recognitionLevelId });

  revalidate();
  return { ok: true };
}

/* --------------------------------------------------------- Sponsor contacts */

/**
 * The people to ask for at a sponsor, added and corrected from the sponsor's own
 * page.
 *
 * A contact is identified by where it sits in the list *and* by the name that
 * was there when the page was drawn. Two people tidying the same sponsor at once
 * would otherwise shift the list under each other and edit the wrong row.
 */
async function contactsOf(sponsorId: string) {
  const sponsor = await Sponsor.findById(sponsorId);
  if (!sponsor) return null;
  return sponsor;
}

export async function saveSponsorContactAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditSponsors) {
    return { ok: false, error: "You cannot change this sponsor." };
  }

  const sponsorId = String(formData.get("sponsorId") ?? "");
  const sponsor = await contactsOf(sponsorId);
  if (!sponsor) return { ok: false, error: "That sponsor no longer exists." };

  const contact = {
    name: String(formData.get("name") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
  };
  if (!contact.name && !contact.email && !contact.phone) {
    return { ok: false, error: "A contact needs a name, an email or a phone number." };
  }

  const contacts = normalizeContacts(sponsor.contacts);
  const indexValue = String(formData.get("index") ?? "");

  if (indexValue === "") {
    contacts.push(contact);
  } else {
    const index = Number(indexValue);
    const expected = String(formData.get("expectedName") ?? "");
    if (!contacts[index] || contacts[index].name !== expected) {
      return {
        ok: false,
        error: "That contact has changed since this page was opened. Reload and try again.",
      };
    }
    contacts[index] = contact;
  }

  sponsor.contacts = normalizeContacts(contacts);
  await sponsor.save();

  revalidate();
  return { ok: true };
}

export async function deleteSponsorContactAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditSponsors) {
    return { ok: false, error: "You cannot change this sponsor." };
  }

  const sponsorId = String(formData.get("sponsorId") ?? "");
  const sponsor = await contactsOf(sponsorId);
  if (!sponsor) return { ok: false, error: "That sponsor no longer exists." };

  const contacts = normalizeContacts(sponsor.contacts);
  const index = Number(formData.get("index") ?? -1);
  const expected = String(formData.get("expectedName") ?? "");

  if (!contacts[index] || contacts[index].name !== expected) {
    return {
      ok: false,
      error: "That contact has changed since this page was opened. Reload and try again.",
    };
  }

  contacts.splice(index, 1);
  sponsor.contacts = contacts;
  await sponsor.save();

  revalidate();
  return { ok: true };
}
