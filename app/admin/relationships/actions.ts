"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { MemberRelationship, User } from "@/lib/models";
import { normalizeRelatedIds } from "@/lib/relationships";

/** The dialog stays open on failure to show the message, so these report back. */
export type RelationshipActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("members.relationships");
  await connectDB();
}

function revalidate() {
  revalidatePath("/admin/relationships");
  revalidatePath("/directory");
}

export async function saveRelationshipAction(
  formData: FormData
): Promise<RelationshipActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const memberId = String(formData.get("memberId") ?? "").trim();
  const label = String(formData.get("label") ?? "")
    .trim()
    .slice(0, 80);
  const reverseLabel = String(formData.get("reverseLabel") ?? "")
    .trim()
    .slice(0, 80);
  const relatedIds = normalizeRelatedIds(
    memberId,
    formData.getAll("relatedIds").map(String)
  );

  if (!memberId) return { ok: false, error: "Choose the member this is about." };
  if (!label) return { ok: false, error: "Name what the others are to this member." };
  if (!reverseLabel) {
    return { ok: false, error: "Name what this member is to the others." };
  }
  if (relatedIds.length === 0) {
    return { ok: false, error: "Add at least one other member." };
  }

  // Every id has to be a real account, or the directory would show a link to
  // nobody.
  const found = await User.find({ _id: { $in: [memberId, ...relatedIds] } })
    .select("_id")
    .lean<any[]>();
  if (found.length !== relatedIds.length + 1) {
    return { ok: false, error: "One of those accounts no longer exists." };
  }

  const payload = { memberId, label, reverseLabel, relatedIds };

  if (id) await MemberRelationship.findByIdAndUpdate(id, payload);
  else await MemberRelationship.create(payload);

  revalidate();
  return { ok: true };
}

export async function deleteRelationshipAction(
  formData: FormData
): Promise<RelationshipActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That relationship no longer exists." };

  await MemberRelationship.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}
