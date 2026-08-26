"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { compareSync } from "bcrypt-ts";

import { safeNextPath } from "@/lib/auth-rules";
import { getAuthSettings } from "@/lib/auth-settings";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { changeUserPassword } from "@/lib/passwords";
import { membershipStatus } from "@/lib/permissions";
import {
  holdsManagementRole,
  postLoginPath,
  startVerification,
} from "@/lib/registration";
import { ensureSeed } from "@/lib/seed";
import { clearPendingAuth, clearSession, createSession, requireSession } from "@/lib/session";
import { SAFE_MODE_COOKIE } from "@/lib/safe-mode";

export type FormState = { error?: string; message?: string } | undefined;

/** What a membership state that cannot sign in is told at the form. */
const blockedMessages: Record<string, string> = {
  pending: "Your membership is waiting to be approved. You will get an email when it is.",
  rejected: "Your membership application was not approved.",
  suspended: "Your account has been suspended. Contact an administrator.",
};

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  // Set by the header popup, so signing in from a page returns to that page.
  const next = safeNextPath(formData.get("next"));

  if (!email || !password) return { error: "Email and password are required." };

  await ensureSeed();
  await connectDB();

  const user = await User.findOne({ email });
  if (!user || user.isActive === false || !compareSync(password, user.passwordHash)) {
    // Deliberately vague so the form cannot be used to enumerate accounts.
    return { error: "Invalid email or password." };
  }

  // Only reported once the password is right, so it tells an attacker nothing
  // they could not already work out.
  const status = membershipStatus(user.membershipStatus);
  if (status !== "active") return { error: blockedMessages[status] };

  const settings = await getAuthSettings();

  // A registration that stalled before the code was entered resumes here rather
  // than leaving the account permanently unreachable.
  if (settings.requireEmailVerification && !user.emailVerifiedAt) {
    const started = await startVerification(user, "email", next);
    if (!started.ok) return { error: started.error };
    redirect("/verify");
  }

  const needsSecondFactor =
    settings.twoFactorMode === "everyone" ||
    (settings.twoFactorMode === "admins" && (await holdsManagementRole(user.roleIds)));

  if (needsSecondFactor) {
    const started = await startVerification(user, "login", next);
    if (!started.ok) return { error: started.error };
    redirect("/verify");
  }

  user.lastLoginAt = new Date();
  await user.save();

  await createSession({
    userId: user._id.toString(),
    email: user.email,
    name: user.name ?? "",
    mustChangePassword: Boolean(user.mustChangePassword),
  });

  if (user.mustChangePassword) redirect("/admin/change-password");
  redirect(next || (await postLoginPath(user._id.toString())));
}

/**
 * @param next where to land afterwards. The header menu passes the current
 * page, so signing out of the site leaves the reader where they were rather
 * than at a sign-in form they did not ask for.
 */
export async function logoutAction(formData?: FormData) {
  const next = safeNextPath(formData?.get("next"));
  await clearSession();
  await clearPendingAuth();
  redirect(next || "/login");
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSession(true);

  const result = await changeUserPassword(session.userId, {
    current: String(formData.get("currentPassword") ?? ""),
    next: String(formData.get("newPassword") ?? ""),
    confirm: String(formData.get("confirmPassword") ?? ""),
  });
  if (!result.ok) return { error: result.error };

  redirect("/admin?passwordChanged=1");
}

export async function setSafeModeAction(enabled: boolean) {
  const store = await cookies();
  store.set(SAFE_MODE_COOKIE, enabled ? "on" : "off", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
