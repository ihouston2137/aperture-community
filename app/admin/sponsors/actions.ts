"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { clearMediaUsage, syncMediaUsage } from "@/lib/media-usage-sync";
import {
  Donation,
  RecognitionLevel,
  Sponsor,
  SponsorCategory,
  SponsorshipCampaign,
} from "@/lib/models";
import {
  normalizeContacts,
  normalizeLinks,
  normalizeLogos,
  sponsorSize,
  sponsorType,
  uniqueIds,
} from "@/lib/sponsorship-types";

/** The dialog stays open on failure to show the message, so these report back. */
export type SponsorActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("sponsorships.manage");
  await connectDB();
}

function revalidate() {
  revalidatePath("/admin/sponsors");
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/donations");
}

export async function saveSponsorAction(
  formData: FormData
): Promise<SponsorActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 160);
  if (!name) return { ok: false, error: "Name the sponsor." };

  let logos, contacts, links;
  try {
    logos = normalizeLogos(JSON.parse(String(formData.get("logos") ?? "[]")));
    contacts = normalizeContacts(JSON.parse(String(formData.get("contacts") ?? "[]")));
    links = normalizeLinks(JSON.parse(String(formData.get("links") ?? "[]")));
  } catch {
    return { ok: false, error: "Could not read that sponsor's details." };
  }

  const payload = {
    name,
    type: sponsorType(formData.get("type")),
    industry: String(formData.get("industry") ?? "").trim().slice(0, 120),
    size: sponsorSize(formData.get("size")),
    email: String(formData.get("email") ?? "").trim().slice(0, 200),
    phone: String(formData.get("phone") ?? "").trim().slice(0, 40),
    address: String(formData.get("address") ?? "").trim().slice(0, 400),
    website: String(formData.get("website") ?? "").trim().slice(0, 500),
    links,
    logos,
    contacts,
    notes: String(formData.get("notes") ?? "").trim().slice(0, 2000),
    recognitionLevelId: String(formData.get("recognitionLevelId") ?? "").trim(),
    categoryIds: uniqueIds(formData.getAll("categoryIds").map(String)),
  };

  if (payload.recognitionLevelId) {
    const level = await RecognitionLevel.exists({ _id: payload.recognitionLevelId });
    if (!level) return { ok: false, error: "That recognition level no longer exists." };
  }

  if (payload.categoryIds.length > 0) {
    const found = await SponsorCategory.find({ _id: { $in: payload.categoryIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== payload.categoryIds.length) {
      return { ok: false, error: "One of those categories no longer exists." };
    }
  }

  let sponsorId = id;
  if (id) {
    await Sponsor.findByIdAndUpdate(id, payload);
  } else {
    const created = await Sponsor.create(payload);
    sponsorId = String(created._id);
  }

  // Logos are media like any other, so the library can say where each is used.
  // `collectMediaRefs` reads any `*mediaId` key and any upload path, which is
  // exactly what a logo row holds.
  await syncMediaUsage(sponsorId, name, [{ kind: "sponsor-logo", source: logos }]);

  revalidate();
  return { ok: true };
}

export async function deleteSponsorAction(
  formData: FormData
): Promise<SponsorActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That sponsor no longer exists." };

  // A sponsor with gifts recorded against it is the only record of where those
  // gifts came from, so it is not something to delete by accident.
  const donations = await Donation.countDocuments({ sponsorId: id });
  if (donations > 0) {
    return {
      ok: false,
      error: `That sponsor has ${donations} donation${
        donations === 1 ? "" : "s"
      } recorded. Remove those first if it really should go.`,
    };
  }

  await clearMediaUsage(id);
  await Sponsor.findByIdAndDelete(id);
  // Nothing should be left holding it for a campaign either.
  await SponsorshipCampaign.updateMany(
    {},
    { $pull: { assignments: { sponsorId: id } } }
  );

  revalidate();
  return { ok: true };
}

/* ------------------------------------------------------------- Categories */

export async function saveCategoryAction(
  formData: FormData
): Promise<SponsorActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return { ok: false, error: "Name the category." };

  // Compared by collation rather than a built regular expression, so a name
  // containing a metacharacter is matched as the text it is.
  const clash = await SponsorCategory.findOne({
    name,
    ...(id ? { _id: { $ne: id } } : {}),
  })
    .collation({ locale: "en", strength: 2 })
    .select("_id")
    .lean();
  if (clash) return { ok: false, error: "A category of that name already exists." };

  const payload = {
    name,
    description: String(formData.get("description") ?? "").trim().slice(0, 500),
  };

  if (id) await SponsorCategory.findByIdAndUpdate(id, payload);
  else await SponsorCategory.create(payload);

  revalidate();
  return { ok: true };
}

export async function deleteCategoryAction(
  formData: FormData
): Promise<SponsorActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That category no longer exists." };

  // Unlike a level or a benefit, a category carries nothing of its own — so it
  // is simply taken off the sponsors holding it rather than refused.
  await Sponsor.updateMany({ categoryIds: id }, { $pull: { categoryIds: id } });
  await SponsorCategory.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}
