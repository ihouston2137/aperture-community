/**
 * The shapes and the pure helpers that go with them.
 *
 * Split from `lib/members.ts` because the client components that render
 * members import from here, and that module reaches the database — importing it
 * from the browser bundle would drag Mongoose in with it.
 */
import {
  membershipStatus,
  roleKind,
  type MembershipStatus,
  type RoleKind,
} from "./permissions";

/** A role reduced to what every caller here needs, safe to pass to a client component. */
export type RoleSummary = {
  _id: string;
  name: string;
  slug: string;
  description: string;
  kind: RoleKind;
  level: number;
  openToRegistration: boolean;
  permissions: string[];
  isSystem: boolean;
};

export type MemberSummary = {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  phone: string;
  membershipStatus: MembershipStatus;
  emailVerified: boolean;
  isActive: boolean;
  mustChangePassword: boolean;
  roleIds: string[];
  communityRoleIds: string[];
  managementRoleIds: string[];
  requestedRoleId: string;
  registeredAt: string;
  decisionNote: string;
};

/**
 * The display name. A name typed by hand wins, so an account named before first
 * and last names existed keeps the name it was given; only a blank one is built
 * from the parts.
 */
export function composeName(firstName: string, lastName: string, existing = ""): string {
  const built = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  return built || existing.trim();
}

export function fullName(user: {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
}): string {
  const built = [user.firstName ?? "", user.lastName ?? ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
  return built || (user.name ?? "").trim() || (user.email ?? "");
}

/**
 * A phone number is stored as typed — formats differ by country and rewriting
 * them loses information — but anything that is plainly not part of a number
 * is dropped.
 */
export function normalizePhone(value: string): string {
  return value.replace(/[^\d+()\-.\sx]/gi, "").trim().slice(0, 40);
}

export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Splits a typed list of addresses into unique, valid, lowercased ones. */
export function parseRecipients(value: string): string[] {
  const seen = new Set<string>();
  for (const part of value.split(/[,;\n]/)) {
    const address = part.trim().toLowerCase();
    if (address && isEmailAddress(address)) seen.add(address);
  }
  return [...seen].slice(0, 50);
}

export function toRoleSummary(role: any): RoleSummary {
  const kind = roleKind(role.kind);
  return {
    _id: String(role._id),
    name: role.name ?? "",
    slug: role.slug ?? "",
    description: role.description ?? "",
    kind,
    level: Number(role.level ?? 0) || 0,
    // Management roles are never offered on the registration form, whatever the
    // stored flag says.
    openToRegistration: kind === "community" && role.openToRegistration !== false,
    permissions: Array.isArray(role.permissions) ? role.permissions.map(String) : [],
    isSystem: Boolean(role.isSystem),
  };
}

/** By level, then by name — the order membership levels are shown in everywhere. */
export function sortRoles(roles: RoleSummary[]): RoleSummary[] {
  return [...roles].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

/** Splits the roles an account holds by kind, given the full role list. */
export function splitRoles(roleIds: string[], roles: RoleSummary[]) {
  const held = roles.filter((role) => roleIds.includes(role._id));
  return {
    community: sortRoles(held.filter((role) => role.kind === "community")),
    management: held.filter((role) => role.kind === "management"),
  };
}

export function toMemberSummary(user: any, roles: RoleSummary[]): MemberSummary {
  const roleIds = (user.roleIds ?? []).map(String);
  const { community, management } = splitRoles(roleIds, roles);

  return {
    _id: String(user._id),
    email: user.email ?? "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    name: user.name ?? "",
    phone: user.phone ?? "",
    membershipStatus: membershipStatus(user.membershipStatus),
    emailVerified: Boolean(user.emailVerifiedAt),
    isActive: user.isActive !== false,
    mustChangePassword: Boolean(user.mustChangePassword),
    roleIds,
    communityRoleIds: community.map((role) => role._id),
    managementRoleIds: management.map((role) => role._id),
    requestedRoleId: user.requestedRoleId ? String(user.requestedRoleId) : "",
    registeredAt: user.registeredAt
      ? new Date(user.registeredAt).toISOString()
      : user.createdAt
        ? new Date(user.createdAt).toISOString()
        : "",
    decisionNote: user.decisionNote ?? "",
  };
}
