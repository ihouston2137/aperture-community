"use server";

import { redirect } from "next/navigation";
import { hashSync } from "bcrypt-ts";

import {
  MIN_PASSWORD_LENGTH,
  safeNextPath,
  type AuthFormState,
} from "@/lib/auth-rules";
import { getAuthSettings } from "@/lib/auth-settings";
import { connectDB } from "@/lib/db";
import { sendVerificationCodeEmail } from "@/lib/email";
import { composeName, isEmailAddress, normalizePhone } from "@/lib/members";
import { Role, User } from "@/lib/models";
import {
  notifyNewRegistration,
  postLoginPath,
  startVerification,
} from "@/lib/registration";
import { ensureSeed } from "@/lib/seed";
import {
  clearPendingAuth,
  createSession,
  getPendingAuth,
  type PendingAuth,
} from "@/lib/session";
import { clearCodes, consumeCode, issueCode } from "@/lib/verification";

function readPassword(formData: FormData): { password?: string; error?: string } {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password !== confirm) return { error: "The two passwords do not match." };
  return { password };
}

/* ------------------------------------------------------------- Registration */

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  await ensureSeed();
  await connectDB();

  const settings = await getAuthSettings();
  if (!settings.allowRegistration) {
    return { error: "Registration is closed at the moment." };
  }

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const requestedRoleId = String(formData.get("requestedRoleId") ?? "");
  // Set by the header popup, so registering from a page returns to that page.
  const next = safeNextPath(formData.get("next"));

  if (!firstName || !lastName) return { error: "Enter your first and last name." };
  if (!isEmailAddress(email)) return { error: "Enter a valid email address." };
  if (!phone) return { error: "Enter a phone number." };

  const { password, error } = readPassword(formData);
  if (error) return { error };

  // The role assigned at registration is always the configured default, whatever
  // was asked for — the request is a note for whoever approves it. A default
  // that has since been deleted falls back to the lowest level rather than
  // turning registration off by accident.
  const defaultRole =
    (settings.defaultCommunityRoleId
      ? await Role.findOne({ _id: settings.defaultCommunityRoleId, kind: "community" })
      : null) ?? (await Role.findOne({ kind: "community" }).sort({ level: 1 }));

  if (!defaultRole) {
    return {
      error: "Registration is not set up yet. Ask an administrator to add a membership level.",
    };
  }

  let requestedRole = null;
  if (settings.allowRoleRequest && requestedRoleId) {
    requestedRole = await Role.findOne({
      _id: requestedRoleId,
      kind: "community",
      openToRegistration: { $ne: false },
    });
    if (!requestedRole) return { error: "Choose a membership level from the list." };
  }

  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing) {
    // Says an account exists, which is what the person in front of the form
    // needs to hear; the sign-in form remains the vague one.
    return { error: "An account already uses that email. Try signing in instead." };
  }

  const needsApproval = !settings.autoApproveRegistrations;
  const user = await User.create({
    email,
    passwordHash: hashSync(password!, 10),
    firstName,
    lastName,
    name: composeName(firstName, lastName),
    phone,
    roleIds: [defaultRole._id],
    requestedRoleId: requestedRole?._id ?? null,
    membershipStatus: needsApproval ? "pending" : "active",
    emailVerifiedAt: settings.requireEmailVerification ? null : new Date(),
    registeredAt: new Date(),
    mustChangePassword: false,
    isActive: true,
  });

  if (settings.requireEmailVerification) {
    const started = await startVerification(user, "email", next);
    if (!started.ok) {
      // Without a code the account can never be opened, so it does not linger.
      await User.deleteOne({ _id: user._id });
      return { error: started.error ?? "Could not send your verification code." };
    }
    redirect("/verify");
  }

  await notifyNewRegistration(String(user._id), settings);
  redirect(needsApproval ? "/register/pending" : "/login?registered=1");
}

/* -------------------------------------------------------------- Verification */

async function landAfterVerification(pending: PendingAuth) {
  await connectDB();
  const user = await User.findById(pending.userId);
  if (!user) return { error: "That account no longer exists." };

  if (pending.purpose === "email" && !user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date();
    await user.save();
    await notifyNewRegistration(String(user._id));
  }

  await clearPendingAuth();

  // A confirmed address does not make a membership approved.
  if (user.membershipStatus === "pending") redirect("/register/pending");
  if (user.membershipStatus !== "active" || user.isActive === false) {
    redirect("/login?blocked=1");
  }

  user.lastLoginAt = new Date();
  await user.save();

  await createSession({
    userId: String(user._id),
    email: user.email,
    name: user.name ?? "",
    mustChangePassword: Boolean(user.mustChangePassword),
  });

  if (user.mustChangePassword) redirect("/admin/change-password");
  redirect(pending.next || (await postLoginPath(String(user._id))));
}

export async function verifyCodeAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const pending = await getPendingAuth();
  if (!pending) redirect("/login");

  const result = await consumeCode(
    pending.userId,
    pending.purpose,
    String(formData.get("code") ?? "")
  );
  if (!result.ok) return { error: result.error };

  return landAfterVerification(pending);
}

export async function resendCodeAction(): Promise<{ ok: boolean; message: string }> {
  const pending = await getPendingAuth();
  if (!pending) return { ok: false, message: "Start again from the sign-in page." };

  await connectDB();
  const user = await User.findById(pending.userId);
  if (!user) return { ok: false, message: "That account no longer exists." };

  const started = await startVerification(user, pending.purpose, pending.next);
  return started.ok
    ? { ok: true, message: "A new code is on its way." }
    : { ok: false, message: started.error ?? "Could not send a new code." };
}

export async function cancelVerificationAction() {
  await clearPendingAuth();
  redirect("/login");
}

/* ---------------------------------------------------------- Password recovery */

/**
 * Always reports the same thing. The reply cannot be used to find out which
 * addresses have accounts, so the screen it returns to shows the code form
 * whether or not anything was sent.
 */
export async function requestPasswordResetAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isEmailAddress(email)) return { error: "Enter a valid email address." };

  await ensureSeed();
  await connectDB();

  const user = await User.findOne({ email });
  if (user && user.isActive !== false) {
    const { requireEmailVerification } = await getAuthSettings();
    const issued = await issueCode(String(user._id), "password", user.email);
    if (issued.ok) {
      await sendVerificationCodeEmail({
        to: user.email,
        name: user.firstName?.trim() || user.name || "",
        code: issued.code,
        purpose: "password",
        expiresAt: issued.expiresAt,
      });
      // Recovering the password proves the address works, so a registration
      // that stalled at the code screen is unblocked by it too.
      if (requireEmailVerification && !user.emailVerifiedAt) {
        user.emailVerifiedAt = new Date();
        await user.save();
      }
    }
  }

  return {
    message: "If that address has an account, a six-digit code is on its way to it.",
  };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "");

  const { password, error } = readPassword(formData);
  if (error) return { error };

  await connectDB();
  const user = await User.findOne({ email });
  // The same message for a wrong code and an address with no account.
  const rejected = { error: "That code is not right, or it has expired." };
  if (!user || user.isActive === false) return rejected;

  const result = await consumeCode(String(user._id), "password", code);
  if (!result.ok) return { error: result.error };

  user.passwordHash = hashSync(password!, 10);
  user.mustChangePassword = false;
  await user.save();

  // Any code still outstanding for this account was issued to whoever had the
  // old password, so none of them survive the change.
  await clearCodes(String(user._id));
  await clearPendingAuth();

  redirect("/login?passwordReset=1");
}
