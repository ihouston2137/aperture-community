"use server";

import { revalidatePath } from "next/cache";
import { hashSync } from "bcrypt-ts";

import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { composeName, isEmailAddress, normalizePhone } from "@/lib/members";
import { User } from "@/lib/models";
import { membershipStatus } from "@/lib/permissions";

/**
 * The dialogs stay open on failure to show the message, so these actions report
 * back rather than returning silently.
 */
export type UserActionResult = { ok: boolean; error?: string };

export async function saveUserAction(formData: FormData): Promise<UserActionResult> {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const isActive = formData.get("isActive") === "on";
  const emailVerified = formData.get("emailVerified") === "on";
  const status = membershipStatus(formData.get("membershipStatus"));
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);

  if (!email) return { ok: false, error: "An email address is required." };
  if (!isEmailAddress(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  if (!firstName && !lastName) {
    return { ok: false, error: "Enter a first or last name." };
  }

  // `email` is unique in the schema; checking first turns a driver-level
  // duplicate-key throw into a message the dialog can show.
  const clash = await User.findOne({ email, ...(id ? { _id: { $ne: id } } : {}) })
    .select("_id")
    .lean();
  if (clash) return { ok: false, error: "Another account already uses that email." };

  // Any of these ends your own access the moment the page reloads.
  if (id && id === session.userId && (!isActive || status !== "active")) {
    return { ok: false, error: "You cannot lock yourself out of your own account." };
  }

  if (id) {
    const user = await User.findById(id);
    if (!user) return { ok: false, error: "That account no longer exists." };

    user.email = email;
    user.firstName = firstName;
    user.lastName = lastName;
    user.name = composeName(firstName, lastName, user.name);
    user.phone = phone;
    user.isActive = isActive;
    user.membershipStatus = status;
    user.roleIds = roleIds;
    if (emailVerified && !user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    if (!emailVerified) user.emailVerifiedAt = null;
    if (password) {
      user.passwordHash = hashSync(password, 10);
      user.mustChangePassword = true;
    }
    await user.save();
  } else {
    if (!password) return { ok: false, error: "Set a temporary password." };
    await User.create({
      email,
      firstName,
      lastName,
      name: composeName(firstName, lastName),
      phone,
      passwordHash: hashSync(password, 10),
      // New accounts always pick their own password on first sign-in.
      mustChangePassword: true,
      isActive,
      membershipStatus: status,
      // Created by hand from inside the admin, so the address is taken as
      // known — nobody should have to confirm an address given to them.
      emailVerifiedAt: emailVerified ? new Date() : null,
      roleIds,
    });
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/members");
  return { ok: true };
}

export async function deleteUserAction(formData: FormData): Promise<UserActionResult> {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That account no longer exists." };
  // Deleting your own account would lock you out mid-session.
  if (id === session.userId) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  await User.findByIdAndDelete(id);

  revalidatePath("/admin/users");
  revalidatePath("/admin/members");
  return { ok: true };
}
