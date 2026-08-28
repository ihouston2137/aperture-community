"use server";

import { revalidatePath } from "next/cache";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getMetadataGroup } from "@/lib/metadata";
import { normalizeEntries } from "@/lib/metadata-types";
import { MetadataAnswer } from "@/lib/models";
import { requireSession } from "@/lib/session";

export type OwnMetadataResult = { ok: boolean; error?: string };

/**
 * A member answering their own questions.
 *
 * No permission is asked for beyond being signed in and holding a level the
 * group is asked of: these are their answers about themselves. A
 * manager-managed group is refused outright — a member never sees one, and
 * this is the door they would have to come through.
 */
export async function saveOwnMetadataAction(
  formData: FormData
): Promise<OwnMetadataResult> {
  const session = await requireSession();
  const { roleIds, membershipStatus, isActive } = await getUserAccess(
    session.userId
  );
  if (membershipStatus !== "active" || !isActive) {
    return { ok: false, error: "This account cannot use the portal." };
  }
  await connectDB();

  const groupId = String(formData.get("groupId") ?? "");
  const group = await getMetadataGroup(groupId);
  if (!group) return { ok: false, error: "That group no longer exists." };
  if (group.managedBy !== "member") {
    return { ok: false, error: "That group is not yours to answer." };
  }
  // Asked of the levels they hold, or not asked of them at all.
  if (!group.roleIds.some((roleId) => roleIds.includes(roleId))) {
    return { ok: false, error: "That group is not asked of you." };
  }

  let entries;
  try {
    entries = normalizeEntries(
      JSON.parse(String(formData.get("entries") ?? "[]")),
      group
    );
  } catch {
    return { ok: false, error: "Could not read those answers." };
  }

  await MetadataAnswer.findOneAndUpdate(
    { userId: session.userId, groupId },
    {
      userId: session.userId,
      groupId,
      entries,
      updatedById: session.userId,
      // The pre-repetition field, cleared so nothing reads it back as an entry
      // once real entries exist.
      $unset: { values: "" },
    },
    { upsert: true }
  );

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
