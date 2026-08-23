"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { compareSync, hashSync } from "bcrypt-ts";

import { connectDB } from "@/lib/db";
import { User } from "@/lib/models";
import { ensureSeed } from "@/lib/seed";
import { clearSession, createSession, requireSession } from "@/lib/session";
import { SAFE_MODE_COOKIE } from "@/lib/safe-mode";

export type FormState = { error?: string; message?: string } | undefined;

export async function loginAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Email and password are required." };

  await ensureSeed();
  await connectDB();

  const user = await User.findOne({ email });
  if (!user || user.isActive === false || !compareSync(password, user.passwordHash)) {
    // Deliberately vague so the form cannot be used to enumerate accounts.
    return { error: "Invalid email or password." };
  }

  await createSession({
    userId: user._id.toString(),
    email: user.email,
    name: user.name ?? "",
    mustChangePassword: Boolean(user.mustChangePassword),
  });

  redirect(user.mustChangePassword ? "/admin/change-password" : "/admin");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireSession(true);

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (next.length < 10) {
    return { error: "New password must be at least 10 characters." };
  }
  if (next !== confirm) return { error: "New passwords do not match." };

  await connectDB();
  const user = await User.findById(session.userId);
  if (!user) return { error: "Account not found." };
  if (!compareSync(current, user.passwordHash)) {
    return { error: "Current password is incorrect." };
  }

  user.passwordHash = hashSync(next, 10);
  user.mustChangePassword = false;
  await user.save();

  await createSession({
    userId: user._id.toString(),
    email: user.email,
    name: user.name ?? "",
    mustChangePassword: false,
  });

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
