import { getAuthSettings, type AuthSettingsValues } from "./auth-settings";
import { connectDB } from "./db";
import { sendRegistrationNotification, sendVerificationCodeEmail } from "./email";
import { fullName } from "./members";
import { Role, User } from "./models";
import { getUserAccess } from "./access";
import { createPendingAuth } from "./session";
import { issueCode, type VerificationPurpose } from "./verification";

/** The public origin, used in the links inside notification emails. */
export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  return `${base}${path}`;
}

/**
 * Issues a code, emails it, and puts the account into the half-signed-in state
 * the verify screen reads.
 *
 * The cookie is only set once the mail is away: a code the person cannot
 * receive would strand them on a screen with nothing to type.
 */
export async function startVerification(
  user: { _id: unknown; email: string; firstName?: string; lastName?: string; name?: string },
  purpose: VerificationPurpose,
  /** Carried through the code screen so a popup sign-in returns to its page. */
  next = ""
): Promise<{ ok: boolean; error?: string }> {
  const userId = String(user._id);
  const issued = await issueCode(userId, purpose, user.email);

  if (!issued.ok) {
    // A code was sent moments ago and is still valid — send them to the screen
    // that asks for it rather than refusing outright.
    await createPendingAuth({
      userId,
      email: user.email,
      name: fullName(user),
      purpose,
      next,
    });
    return { ok: true };
  }

  const sent = await sendVerificationCodeEmail({
    to: user.email,
    name: user.firstName?.trim() || fullName(user),
    code: issued.code,
    purpose,
    expiresAt: issued.expiresAt,
  });

  if (!sent.ok) {
    return {
      ok: false,
      error: `The code could not be emailed. ${sent.error ?? ""}`.trim(),
    };
  }

  await createPendingAuth({
    userId,
    email: user.email,
    name: fullName(user),
    purpose,
    next,
  });
  return { ok: true };
}

/**
 * Announces a completed registration to the addresses configured under
 * Registration, once, when the account becomes real — after the address is
 * confirmed when verification is on, and at sign-up when it is off.
 *
 * Never throws: a notification nobody configured, or an SMTP server that is
 * down, must not undo somebody joining.
 */
export async function notifyNewRegistration(
  userId: string,
  settings?: AuthSettingsValues
) {
  try {
    const config = settings ?? (await getAuthSettings());
    if (!config.notifyOnRegistration || config.registrationRecipients.length === 0) {
      return;
    }

    await connectDB();
    const user = await User.findById(userId).lean<any>();
    if (!user || user.registrationNotifiedAt) return;

    const roleIds = [...(user.roleIds ?? []), user.requestedRoleId].filter(Boolean);
    const roles = await Role.find({ _id: { $in: roleIds } }).lean<any[]>();
    const nameOf = (id: unknown) =>
      roles.find((role) => String(role._id) === String(id))?.name ?? "";

    await sendRegistrationNotification({
      recipients: config.registrationRecipients,
      subject: config.registrationSubject,
      intro: config.registrationIntro,
      member: {
        name: fullName(user),
        email: user.email ?? "",
        phone: user.phone ?? "",
        requestedRole: nameOf(user.requestedRoleId),
        assignedRole: (user.roleIds ?? []).map(nameOf).filter(Boolean).join(", "),
      },
      needsApproval: user.membershipStatus === "pending",
      reviewUrl: siteUrl("/admin/members"),
    });

    // Recorded whatever the send returned, so a broken mail server produces one
    // failed attempt rather than one on every later read of the account.
    await User.updateOne({ _id: userId }, { $set: { registrationNotifiedAt: new Date() } });
  } catch {
    // Reported nowhere on purpose — the person joining is not the right
    // audience for a notification problem.
  }
}

/** True when the account holds any role that grants admin access. */
export async function holdsManagementRole(roleIds: unknown[]): Promise<boolean> {
  if (!roleIds || roleIds.length === 0) return false;
  await connectDB();
  const found = await Role.exists({
    _id: { $in: roleIds },
    kind: "management",
    "permissions.0": { $exists: true },
  });
  return Boolean(found);
}

/**
 * Where signing in lands. Anyone who can manage something goes to the admin;
 * everyone else goes to the site, which is all a member has until the portal
 * pages are built on top of the community permissions.
 */
export async function postLoginPath(userId: string): Promise<string> {
  const { permissions, isAdministrator } = await getUserAccess(userId);
  if (isAdministrator) return "/admin";
  return permissions.some((permission) => !permission.startsWith("community.")) ? "/admin" : "/";
}
