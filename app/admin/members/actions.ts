"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { sendMembershipDecisionEmail } from "@/lib/email";
import { syncMemberProfile } from "@/lib/member-profiles";
import { fullName, sortRoles, toRoleSummary } from "@/lib/members";
import { Role, User } from "@/lib/models";
import { membershipStatus } from "@/lib/permissions";
import { siteUrl } from "@/lib/registration";

export type MemberActionResult = { ok: boolean; error?: string; message?: string };

function revalidate() {
  revalidatePath("/admin/members");
  revalidatePath("/admin/users");
  revalidatePath("/admin/roles");
  revalidatePath("/admin/profiles");
}

/**
 * Replaces the community roles an account holds, leaving its management roles
 * alone. The two kinds share one list on the user, so a decision about
 * membership must not quietly take away what somebody administers.
 */
async function setCommunityRoles(user: any, roleIds: string[]) {
  const held = await Role.find({ _id: { $in: user.roleIds ?? [] } }).lean<any[]>();
  const management = held
    .filter((role) => role.kind !== "community")
    .map((role) => String(role._id));

  user.roleIds = [...new Set([...management, ...roleIds])];
}

/**
 * Approve, decline, or change the level of one member.
 *
 * The email is best-effort: a decision already recorded is not undone because a
 * mail server was unreachable, and the outcome says whether it went out.
 */
export async function decideMembershipAction(
  formData: FormData
): Promise<MemberActionResult> {
  const { session } = await requirePermission("members.approve");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  // One value per level chosen: a member can hold more than one at a time.
  const roleIds = [...new Set(formData.getAll("roleId").map(String).filter(Boolean))];
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  const notify = formData.get("notify") === "on";

  if (!["approve", "reject", "change"].includes(decision)) {
    return { ok: false, error: "Unknown decision." };
  }

  const user = await User.findById(id);
  if (!user) return { ok: false, error: "That account no longer exists." };
  if (String(user._id) === session.userId) {
    return { ok: false, error: "You cannot change your own membership here." };
  }

  let roleName = "";
  if (decision === "approve" || decision === "change") {
    if (roleIds.length === 0) {
      return { ok: false, error: "Choose at least one membership level." };
    }
    const chosen = await Role.find({
      _id: { $in: roleIds },
      kind: "community",
    }).lean<any[]>();
    if (chosen.length !== roleIds.length) {
      return { ok: false, error: "One of those membership levels no longer exists." };
    }

    // Named in the order they are shown on the screen, so the email reads the
    // way the admin saw it.
    roleName = sortRoles(chosen.map(toRoleSummary))
      .map((role) => role.name)
      .join(", ");
    await setCommunityRoles(user, chosen.map((role) => String(role._id)));
  }

  if (decision === "approve") {
    user.membershipStatus = "active";
    user.approvedAt = new Date();
    user.approvedById = session.userId;
    // Approving settles the request; the level they now hold is the answer.
    user.requestedRoleId = null;
  } else if (decision === "reject") {
    user.membershipStatus = "rejected";
    user.approvedAt = new Date();
    user.approvedById = session.userId;
  }

  user.decisionNote = note;
  await user.save();

  // The level they hold is their profile's title.
  await syncMemberProfile(String(user._id));

  revalidate();

  if (!notify) return { ok: true };

  const sent = await sendMembershipDecisionEmail({
    to: user.email,
    name: user.firstName?.trim() || fullName(user),
    decision:
      decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "changed",
    roleName,
    note,
    siteUrl: siteUrl("/login"),
  });

  return sent.ok
    ? { ok: true, message: "Saved, and the member has been emailed." }
    : { ok: true, message: `Saved. The email did not go out: ${sent.error ?? ""}`.trim() };
}

/** Suspend or reinstate an existing member without touching their roles. */
export async function setMembershipStatusAction(
  formData: FormData
): Promise<MemberActionResult> {
  const { session } = await requirePermission("members.approve");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const status = membershipStatus(formData.get("status"));

  if (id === session.userId) {
    return { ok: false, error: "You cannot change your own membership here." };
  }

  const user = await User.findById(id);
  if (!user) return { ok: false, error: "That account no longer exists." };

  user.membershipStatus = status;
  await user.save();

  revalidate();
  return { ok: true };
}
