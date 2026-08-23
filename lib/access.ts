import { redirect } from "next/navigation";

import { connectDB } from "./db";
import { Role, User } from "./models";
import { ADMINISTRATOR_ROLE_SLUG, allPermissions } from "./permissions";
import { requireSession, type SessionPayload } from "./session";

/**
 * The Administrator role always exists and always holds every permission, so a
 * newly added permission is never accidentally locked away from every user.
 */
export async function ensureAdministratorRole() {
  await connectDB();
  const existing = await Role.findOne({ slug: ADMINISTRATOR_ROLE_SLUG });

  if (!existing) {
    return Role.create({
      name: "Administrator",
      slug: ADMINISTRATOR_ROLE_SLUG,
      description: "Full access to every part of the admin.",
      permissions: allPermissions,
      isSystem: true,
    });
  }

  const missing = allPermissions.filter(
    (permission) => !existing.permissions.includes(permission)
  );
  if (missing.length > 0) {
    existing.permissions = allPermissions;
    await existing.save();
  }
  return existing;
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  await connectDB();
  const user = await User.findById(userId).lean<{
    roleIds?: unknown[];
    isActive?: boolean;
  }>();
  if (!user || user.isActive === false) return [];

  const roles = await Role.find({ _id: { $in: user.roleIds ?? [] } }).lean<
    { permissions?: string[] }[]
  >();

  const permissions = new Set<string>();
  for (const role of roles) {
    for (const permission of role.permissions ?? []) permissions.add(permission);
  }
  return [...permissions];
}

export type AccessContext = {
  session: SessionPayload;
  permissions: string[];
  can: (permission: string) => boolean;
};

export async function getAccessContext(
  allowPasswordChange = false
): Promise<AccessContext> {
  const session = await requireSession(allowPasswordChange);
  await ensureAdministratorRole();
  const permissions = await getUserPermissions(session.userId);
  return {
    session,
    permissions,
    can: (permission: string) => permissions.includes(permission),
  };
}

export async function requirePermission(permission: string): Promise<AccessContext> {
  const context = await getAccessContext();
  if (!context.can(permission)) redirect("/admin?denied=" + encodeURIComponent(permission));
  return context;
}

/**
 * For screens that serve two audiences — someone who may only read a report and
 * someone who may also change how it is produced. Holding either is enough to
 * get in; the page itself decides what each of them sees.
 */
export async function requireAnyPermission(
  permissions: string[]
): Promise<AccessContext> {
  const context = await getAccessContext();
  if (!permissions.some((permission) => context.can(permission))) {
    redirect("/admin?denied=" + encodeURIComponent(permissions[0]));
  }
  return context;
}

/** Route-handler variant: returns null instead of redirecting. */
export async function checkPermission(
  session: SessionPayload | null,
  permission: string
): Promise<boolean> {
  if (!session) return false;
  const permissions = await getUserPermissions(session.userId);
  return permissions.includes(permission);
}
