"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { normalizeGroupMembers } from "@/lib/member-groups";
import { MemberGroup, User } from "@/lib/models";

/** The dialog stays open on failure to show the message, so these report back. */
export type GroupActionResult = { ok: boolean; error?: string };

async function guard() {
  await requirePermission("members.groups");
  await connectDB();
}

function revalidate() {
  revalidatePath("/admin/groups");
}

export async function saveGroupAction(
  formData: FormData
): Promise<GroupActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "")
    .trim()
    .slice(0, 80);
  const description = String(formData.get("description") ?? "")
    .trim()
    .slice(0, 500);
  // One JSON field rather than two parallel arrays: a member and their title
  // have to stay together, and index-matched `getAll` lists are one dropped
  // entry away from giving somebody else's office to the wrong person.
  let members;
  try {
    members = normalizeGroupMembers(JSON.parse(String(formData.get("members") ?? "[]")));
  } catch {
    return { ok: false, error: "That list of members could not be read." };
  }
  const memberIds = members.map((member) => member.memberId);

  if (!name) return { ok: false, error: "Name the group." };

  // Two groups of the same name would be indistinguishable everywhere they are
  // listed. Compared without case, since that is how somebody reading a list
  // would tell them apart.
  const clash = await MemberGroup.findOne({
    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    ...(id ? { _id: { $ne: id } } : {}),
  })
    .select("_id")
    .lean();
  if (clash) return { ok: false, error: "A group of that name already exists." };

  if (memberIds.length > 0) {
    const found = await User.find({ _id: { $in: memberIds } })
      .select("_id")
      .lean<any[]>();
    if (found.length !== memberIds.length) {
      return { ok: false, error: "One of those accounts no longer exists." };
    }
  }

  const payload = { name, description, members };

  if (id) {
    // `memberIds` is the pre-titles shape. Dropped as each group is saved, so
    // no group is left carrying two answers to who is in it.
    await MemberGroup.findByIdAndUpdate(id, {
      $set: payload,
      $unset: { memberIds: "" },
    });
  } else {
    await MemberGroup.create(payload);
  }

  revalidate();
  return { ok: true };
}

export async function deleteGroupAction(
  formData: FormData
): Promise<GroupActionResult> {
  await guard();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That group no longer exists." };

  await MemberGroup.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}
