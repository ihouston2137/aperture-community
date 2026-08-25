"use server";

import { revalidatePath } from "next/cache";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { composeName, isEmailAddress, normalizePhone } from "@/lib/members";
import { User } from "@/lib/models";
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
