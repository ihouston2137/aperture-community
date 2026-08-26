"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { RecognitionLevel, Sponsor, SponsorBenefit } from "@/lib/models";
import { uniqueIds } from "@/lib/sponsorship-types";

/** The dialog stays open on failure to show the message, so these report back. */
export type LevelActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("sponsorships.manage");
  await connectDB();
}

function revalidate() {
  revalidatePath("/admin/levels");
  revalidatePath("/admin/sponsors");
}

/**
 * Two of anything sharing a name would be indistinguishable in a picker.
 * Compared by collation rather than a built regular expression, so a name
 * containing a metacharacter is matched as the text it is.
 */
async function nameTaken(
  model: typeof RecognitionLevel | typeof SponsorBenefit,
  name: string,
  id: string
): Promise<boolean> {
  const clash = await model
    .findOne({ name, ...(id ? { _id: { $ne: id } } : {}) })
    .collation({ locale: "en", strength: 2 })
    .select("_id")
    .lean();
  return Boolean(clash);
}

/* ------------------------------------------------------- Recognition levels */

export async function saveRecognitionLevelAction(
  formData: FormData
): Promise<LevelActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  if (!name) return { ok: false, error: "Name the level." };

  if (await nameTaken(RecognitionLevel, name, id)) {
    return { ok: false, error: "A level of that name already exists." };
  }

  const benefitIds = uniqueIds(formData.getAll("benefitIds").map(String));
  if (benefitIds.length > 0) {
    const found = await SponsorBenefit.find({ _id: { $in: benefitIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== benefitIds.length) {
      return { ok: false, error: "One of those benefits no longer exists." };
    }
  }

  const payload = {
    name,
    description: String(formData.get("description") ?? "").trim().slice(0, 500),
    rank: Number(formData.get("rank") ?? 0) || 0,
    benefitIds,
    isAnonymous: formData.get("isAnonymous") === "on",
  };

  if (id) await RecognitionLevel.findByIdAndUpdate(id, payload);
  else await RecognitionLevel.create(payload);

  revalidate();
  return { ok: true };
}

export async function deleteRecognitionLevelAction(
  formData: FormData
): Promise<LevelActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That level no longer exists." };

  // Deleting it out from under the sponsors held at it would quietly demote
  // them, which is not something to do without being asked.
  const held = await Sponsor.countDocuments({ recognitionLevelId: id });
  if (held > 0) {
    return {
      ok: false,
      error: `${held} sponsor${held === 1 ? " is" : "s are"} recognised at that level. Move ${
        held === 1 ? "it" : "them"
      } first.`,
    };
  }

  await RecognitionLevel.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}

/* -------------------------------------------------------------- Benefits */

export async function saveBenefitAction(
  formData: FormData
): Promise<LevelActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 120);
  if (!name) return { ok: false, error: "Name the benefit." };

  if (await nameTaken(SponsorBenefit, name, id)) {
    return { ok: false, error: "A benefit of that name already exists." };
  }

  const payload = {
    name,
    description: String(formData.get("description") ?? "").trim().slice(0, 500),
  };

  if (id) await SponsorBenefit.findByIdAndUpdate(id, payload);
  else await SponsorBenefit.create(payload);

  revalidate();
  return { ok: true };
}

export async function deleteBenefitAction(
  formData: FormData
): Promise<LevelActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That benefit no longer exists." };

  // A benefit still promised by a level should not vanish from under it.
  const levels = await RecognitionLevel.countDocuments({ benefitIds: id });
  if (levels > 0) {
    return {
      ok: false,
      error: `${levels} level${levels === 1 ? "" : "s"} include${
        levels === 1 ? "s" : ""
      } that benefit. Take it off ${levels === 1 ? "it" : "them"} first.`,
    };
  }

  await SponsorBenefit.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}
