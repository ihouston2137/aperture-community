"use server";

import { revalidatePath } from "next/cache";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { syncMediaUsage } from "@/lib/media-usage-sync";
import { getMemberProfile, syncMemberProfile } from "@/lib/member-profiles";
import { composeName, isEmailAddress, normalizePhone } from "@/lib/members";
import { Bio, User } from "@/lib/models";
import { changeUserPassword } from "@/lib/passwords";
import { sanitizeMediaPath } from "@/lib/protected-media-url";
import { createSession, requireSession } from "@/lib/session";

export type ProfileResult = { ok: boolean; error?: string; message?: string };

/**
 * A member editing their own details.
 *
 * Only the four fields the community collects. Roles, membership status and the
 * verified flag are all decided elsewhere — nothing a member submits here can
 * change what they are allowed to reach.
 */
export async function saveOwnProfileAction(formData: FormData): Promise<ProfileResult> {
  const session = await requireSession();
  const { permissions } = await getUserAccess(session.userId);
  if (!permissions.includes("community.profile")) {
    return { ok: false, error: "Your membership level cannot edit its own profile." };
  }

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));

  if (!firstName || !lastName) return { ok: false, error: "Enter your first and last name." };
  if (!isEmailAddress(email)) return { ok: false, error: "Enter a valid email address." };

  await connectDB();

  const clash = await User.findOne({ email, _id: { $ne: session.userId } })
    .select("_id")
    .lean();
  if (clash) return { ok: false, error: "Another account already uses that email." };

  const user = await User.findById(session.userId);
  if (!user) return { ok: false, error: "Account not found." };

  // Changing the address makes it unconfirmed again, so the next sign-in asks
  // for a code sent to the new one — otherwise a typo here would quietly cut
  // the member off from password recovery.
  const addressChanged = user.email !== email;

  user.firstName = firstName;
  user.lastName = lastName;
  user.email = email;
  user.phone = phone;
  user.name = composeName(firstName, lastName);
  if (addressChanged) user.emailVerifiedAt = null;
  await user.save();

  // Their profile shows their first name and last initial.
  await syncMemberProfile(String(user._id));

  // The header reads the name from the session cookie, so it is reissued.
  await createSession({
    userId: String(user._id),
    email: user.email,
    name: user.name,
    mustChangePassword: Boolean(user.mustChangePassword),
  });

  revalidatePath("/dashboard");
  return {
    ok: true,
    message: addressChanged
      ? "Saved. You will be asked to confirm your new email address next time you sign in."
      : "Your details have been saved.",
  };
}

/**
 * A member changing their own password from the dashboard popup.
 *
 * The same rules as the admin's change-password page, but answered rather than
 * redirected: the popup stays where the member already is. `/admin/change-
 * password` remains a real page for anyone who arrives at it directly, and for
 * an account being forced to change one before it can go anywhere else.
 */
export async function changeOwnPasswordAction(
  formData: FormData
): Promise<ProfileResult> {
  const session = await requireSession(true);

  const result = await changeUserPassword(session.userId, {
    current: String(formData.get("currentPassword") ?? ""),
    next: String(formData.get("newPassword") ?? ""),
    confirm: String(formData.get("confirmPassword") ?? ""),
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard");
  return { ok: true, message: "Your password has been changed." };
}

/**
 * A member editing their own profile.
 *
 * The name and the membership are read from the account and the levels it
 * holds, so submitting those here would mean nothing — an administrator with
 * `profiles.manage` is the one who can change everything about any profile.
 */
export async function saveOwnBioAction(formData: FormData): Promise<ProfileResult> {
  const session = await requireSession();
  const { permissions } = await getUserAccess(session.userId);
  if (!permissions.includes("community.profile")) {
    return { ok: false, error: "Your membership level cannot edit its own profile." };
  }

  const bio = await getMemberProfile(session.userId);
  if (!bio) return { ok: false, error: "Your profile could not be found." };

  const headshotMediaId = String(formData.get("headshotMediaId") ?? "");
  const headshotUrl = sanitizeMediaPath(String(formData.get("headshotUrl") ?? ""));

  await Bio.findByIdAndUpdate(bio._id, {
    title: String(formData.get("title") ?? "").trim().slice(0, 120),
    location: String(formData.get("location") ?? "").trim().slice(0, 120),
    description: String(formData.get("description") ?? "").trim().slice(0, 2000),
    headshotMediaId,
    headshotUrl,
  });

  await syncMediaUsage(String(bio._id), bio.name ?? "", [
    { kind: "bio-headshot", source: { headshotMediaId, headshotUrl } },
  ]);

  revalidatePath("/dashboard");
  revalidatePath("/admin/profiles");
  revalidatePath("/", "layout");

  return { ok: true, message: "Your profile has been saved." };
}
