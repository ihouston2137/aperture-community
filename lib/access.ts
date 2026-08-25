import { redirect } from "next/navigation";

import { connectDB } from "./db";
import { Role, User } from "./models";
import {
  ADMINISTRATOR_ROLE_SLUG,
  MEMBER_ROLE_SLUG,
  allCommunityPermissions,
  allPermissions,
  membershipStatus,
  type MembershipStatus,
} from "./permissions";
import { requireSession, type SessionPayload } from "./session";

/**
 * The Administrator role always exists and always holds every permission, so a
 * newly added permission is never accidentally locked away from every user.
 *
 * Only the management vocabulary is stored on it — community permissions are a
 * separate vocabulary, granted implicitly in `getUserPermissions` so that the
 * role stays a description of the admin and not of the portal.
 */
export async function ensureAdministratorRole() {
  await connectDB();
  const existing = await Role.findOne({ slug: ADMINISTRATOR_ROLE_SLUG });

  if (!existing) {
    return Role.create({
      name: "Administrator",
      slug: ADMINISTRATOR_ROLE_SLUG,
      description: "Full access to every part of the admin.",
      kind: "management",
      permissions: allPermissions,
      isSystem: true,
    });
  }

  const missing = allPermissions.filter(
    (permission) => !existing.permissions.includes(permission)
  );
  if (missing.length > 0 || existing.kind !== "management") {
    existing.permissions = allPermissions;
    existing.kind = "management";
    await existing.save();
  }
  return existing;
}

/**
 * There is always at least one membership level, so registration always has
 * something to assign. It is an ordinary community role once created — the
 * Administrator can rename it, change what it grants, or add levels above it.
 */
export async function ensureDefaultCommunityRole() {
  await connectDB();
  const existing = await Role.findOne({ slug: MEMBER_ROLE_SLUG });
  if (existing) return existing;

  // Only seed one if the site has no membership levels at all; a site that
  // named its own levels should not grow a stray "Member" beside them.
  const anyCommunityRole = await Role.exists({ kind: "community" });
  if (anyCommunityRole) return null;

  return Role.create({
    name: "Member",
    slug: MEMBER_ROLE_SLUG,
    description: "The starting membership level, assigned at registration.",
    kind: "community",
    level: 0,
    openToRegistration: true,
    permissions: ["community.portal", "community.profile", "community.calendar"],
    isSystem: true,
  });
}

export type UserAccess = {
  permissions: string[];
  membershipStatus: MembershipStatus;
  isActive: boolean;
  isAdministrator: boolean;
};

/**
 * Everything the access layer knows about one account, read once.
 *
 * An account that cannot sign in holds nothing: a deactivated account, or one
 * whose membership is not `active`, comes back with an empty permission set
 * rather than with permissions that are then checked somewhere else.
 */
export async function getUserAccess(userId: string): Promise<UserAccess> {
  await connectDB();
  const user = await User.findById(userId).lean<{
    roleIds?: unknown[];
    isActive?: boolean;
    membershipStatus?: string;
  }>();

  const status = membershipStatus(user?.membershipStatus);
  const isActive = Boolean(user) && user?.isActive !== false;

  if (!user || !isActive || status !== "active") {
    return { permissions: [], membershipStatus: status, isActive, isAdministrator: false };
  }

  const roles = await Role.find({ _id: { $in: user.roleIds ?? [] } }).lean<
    { slug?: string; permissions?: string[] }[]
  >();

  const permissions = new Set<string>();
  let isAdministrator = false;

  for (const role of roles) {
    if (role.slug === ADMINISTRATOR_ROLE_SLUG) isAdministrator = true;
    for (const permission of role.permissions ?? []) permissions.add(permission);
  }

  // An Administrator can reach the portal without also being given a membership
  // level, which would otherwise show them in the member directory.
  if (isAdministrator) {
    for (const permission of allCommunityPermissions) permissions.add(permission);
  }

  return { permissions: [...permissions], membershipStatus: status, isActive, isAdministrator };
}

export async function getUserPermissions(userId: string): Promise<string[]> {
  const { permissions } = await getUserAccess(userId);
  return permissions;
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
