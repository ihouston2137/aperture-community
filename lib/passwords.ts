import { compareSync, hashSync } from "bcrypt-ts";

import { MIN_PASSWORD_LENGTH } from "./auth-rules";
import { connectDB } from "./db";
import { User } from "./models";
import { createSession } from "./session";
import { clearCodes } from "./verification";

export type PasswordChangeResult = { ok: boolean; error?: string };

/**
 * Sets a new password for one account, given the current one.
 *
 * Shared by the admin's change-password page and the member dashboard's popup,
 * so the rules — the minimum length, the recovery codes dropped, the session
 * reissued — are stated once and cannot drift apart.
 */
export async function changeUserPassword(
  userId: string,
  input: { current: string; next: string; confirm: string }
): Promise<PasswordChangeResult> {
  if (input.next.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (input.next !== input.confirm) {
    return { ok: false, error: "New passwords do not match." };
  }

  await connectDB();
  const user = await User.findById(userId);
  if (!user) return { ok: false, error: "Account not found." };
  if (!compareSync(input.current, user.passwordHash)) {
    return { ok: false, error: "Current password is incorrect." };
  }

  user.passwordHash = hashSync(input.next, 10);
  user.mustChangePassword = false;
  await user.save();

  // Any recovery code outstanding was issued against the old password.
  await clearCodes(String(user._id));

  // The cookie carries `mustChangePassword`, which no longer holds.
  await createSession({
    userId: String(user._id),
    email: user.email,
    name: user.name ?? "",
    mustChangePassword: false,
  });

  return { ok: true };
}
