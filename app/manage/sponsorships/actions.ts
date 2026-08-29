"use server";

import { revalidatePath } from "next/cache";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import {
  MediaAsset,
  RecognitionLevel,
  Sponsor,
  SponsorshipCampaign,
  User,
} from "@/lib/models";
import { syncMediaUsage } from "@/lib/media-usage-sync";
import { generateThumbnail, storeUpload } from "@/lib/media-upload";
import { requireSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import {
  assignmentStatus,
  normalizeContacts,
  normalizeLogos,
  uniqueIds,
} from "@/lib/sponsorship-types";

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
    { sponsorId, memberIds: [], status: "open" },
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
    { sponsorId: String(created._id), memberIds: [], status: "open" },
  ];
  await campaign.save();

  revalidate();
  return { ok: true };
}

/** Takes a sponsor off a campaign. Their donations to it are untouched. */
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

  // Some sponsors take no assignment at all. Checked here rather than only in
  // the dialog, because the dialog can be open from before the flag was set.
  if (memberIds.length > 0) {
    const sponsor = await Sponsor.findById(sponsorId)
      .select("isUnassignable")
      .lean<any>();
    if (sponsor?.isUnassignable) {
      return {
        ok: false,
        error: "That sponsor is set to take no assignment.",
      };
    }

    const found = await User.find({ _id: { $in: memberIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== memberIds.length) {
      return { ok: false, error: "One of those accounts no longer exists." };
    }
  }

  const status = assignmentStatus(formData.get("status"));

  const assignments = (campaign.assignments ?? []).map((entry: any) =>
    String(entry.sponsorId) === sponsorId
      ? { sponsorId, memberIds, status }
      : {
          sponsorId: String(entry.sponsorId),
          memberIds: (entry.memberIds ?? []).map(String),
          status: assignmentStatus(entry.status),
        }
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

/* --------------------------------------------------------------- Logos */

/**
 * Artwork cleared for use, kept where the sponsor is read rather than where
 * media is administered.
 *
 * Somebody who has just been sent a logo by a sponsor they look after should
 * not need the media library and its permissions to put it on file — the
 * grant that lets them edit the sponsor is the grant that matters here. The
 * file still lands in the library like any other, so it can be found, reused
 * and accounted for.
 */

/** Only what a logo can sensibly be. A PDF brand pack is not a logo. */
const LOGO_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

async function logosOf(sponsorId: string) {
  if (!sponsorId) return null;
  return Sponsor.findById(sponsorId);
}

export async function uploadSponsorLogoAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditSponsors) {
    return { ok: false, error: "You cannot change this sponsor." };
  }

  const sponsorId = String(formData.get("sponsorId") ?? "");
  const sponsor = await logosOf(sponsorId);
  if (!sponsor) return { ok: false, error: "That sponsor no longer exists." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image to upload." };
  }

  let stored;
  try {
    stored = await storeUpload(file, "media", LOGO_MIME_TYPES);
  } catch {
    return {
      ok: false,
      error: "That file is not an image this site can use, or it is too large.",
    };
  }

  const thumbnail = await generateThumbnail(stored.absolutePath, stored.fileName);
  const label = String(formData.get("label") ?? "").trim().slice(0, 60);

  const asset = await MediaAsset.create({
    filename: stored.fileName,
    fileName: stored.fileName,
    url: stored.url,
    thumbnailUrl: thumbnail?.thumbnailUrl ?? "",
    width: thumbnail?.width ?? 0,
    height: thumbnail?.height ?? 0,
    originalName: stored.originalName,
    mimeType: stored.mimeType,
    size: stored.size,
    title: label || `${sponsor.name} logo`,
    alt: `${sponsor.name} logo`,
  });

  const logos = normalizeLogos(sponsor.logos);
  logos.push({
    label,
    url: stored.url,
    mediaId: String(asset._id),
    // The first one on file is the one the site shows, since otherwise
    // nothing would be.
    isPrimary: logos.length === 0,
  });

  sponsor.logos = normalizeLogos(logos);
  await sponsor.save();

  await syncMediaUsage(sponsorId, sponsor.name, [
    { kind: "sponsor-logo", source: sponsor.logos },
  ]);

  revalidate();
  return { ok: true };
}

/**
 * Takes one logo off the sponsor.
 *
 * The file itself stays in the media library: this says the sponsor no longer
 * uses that artwork, not that the artwork should be destroyed for everybody.
 * Deleting it outright is the library's job, where what else uses it is shown.
 */
export async function deleteSponsorLogoAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditSponsors) {
    return { ok: false, error: "You cannot change this sponsor." };
  }

  const sponsorId = String(formData.get("sponsorId") ?? "");
  const sponsor = await logosOf(sponsorId);
  if (!sponsor) return { ok: false, error: "That sponsor no longer exists." };

  const logos = normalizeLogos(sponsor.logos);
  const index = Number(formData.get("index") ?? -1);
  const expected = String(formData.get("expectedUrl") ?? "");

  // The row is identified by both position and what was there, so a logo
  // added or removed since the page loaded cannot be deleted by mistake.
  if (!logos[index] || logos[index].url !== expected) {
    return {
      ok: false,
      error: "That logo has changed since this page was opened. Reload and try again.",
    };
  }

  logos.splice(index, 1);
  // `normalizeLogos` hands the primary to whatever is left, so removing the
  // one the site shows does not leave the sponsor showing nothing.
  sponsor.logos = normalizeLogos(logos);
  await sponsor.save();

  await syncMediaUsage(sponsorId, sponsor.name, [
    { kind: "sponsor-logo", source: sponsor.logos },
  ]);

  revalidate();
  return { ok: true };
}

/** Chooses which logo the site shows, when a sponsor has more than one. */
export async function setPrimarySponsorLogoAction(
  formData: FormData
): Promise<ManageResult> {
  if (!(await access()).canEditSponsors) {
    return { ok: false, error: "You cannot change this sponsor." };
  }

  const sponsorId = String(formData.get("sponsorId") ?? "");
  const sponsor = await logosOf(sponsorId);
  if (!sponsor) return { ok: false, error: "That sponsor no longer exists." };

  const logos = normalizeLogos(sponsor.logos);
  const index = Number(formData.get("index") ?? -1);
  if (!logos[index]) {
    return {
      ok: false,
      error: "That logo has changed since this page was opened. Reload and try again.",
    };
  }

  sponsor.logos = normalizeLogos(
    logos.map((logo, position) => ({ ...logo, isPrimary: position === index }))
  );
  await sponsor.save();

  revalidate();
  return { ok: true };
}
