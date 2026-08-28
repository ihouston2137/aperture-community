import type { AccountUser } from "@/components/account-menu";
import type { RegistrationOptions } from "@/components/auth-dialog";

import { getUserAccess } from "./access";
import { getCalendarPageSettings } from "./calendar-page";
import { contentPermissions } from "./content-access";
import { sponsorshipAccess } from "./sponsorship-access";
import { getAuthSettings } from "./auth-settings";
import { connectDB } from "./db";
import { canReachMemberData } from "./metadata";
import { getRoleSummaries, splitRoles } from "./members";
import { User } from "./models";
import { getSession } from "./session";

/**
 * Everything the header corner needs, read once per request.
 *
 * Signed out this is one settings read; the community roles are only fetched
 * when registration is actually open, so a site with it closed pays nothing for
 * a form nobody can reach.
 */
export async function getAccountHeaderData(): Promise<{
  user: AccountUser | null;
  registration: RegistrationOptions;
}> {
  const [session, settings] = await Promise.all([getSession(), getAuthSettings()]);

  const closed: RegistrationOptions = {
    allowRegistration: false,
    roles: [],
    defaultRoleName: "",
    needsApproval: !settings.autoApproveRegistrations,
    verifiesEmail: settings.requireEmailVerification,
  };

  // A signed-in reader is never offered the registration form, so it is not
  // built for them either.
  if (session) {
    return { user: await readUser(session.userId), registration: closed };
  }

  if (!settings.allowRegistration) return { user: null, registration: closed };

  const communityRoles = await getRoleSummaries("community");
  const defaultRole =
    communityRoles.find((role) => role._id === settings.defaultCommunityRoleId) ??
    communityRoles[0];

  return {
    user: null,
    registration: {
      allowRegistration: true,
      roles: settings.allowRoleRequest
        ? communityRoles
            .filter((role) => role.openToRegistration)
            .map((role) => ({
              _id: role._id,
              name: role.name,
              description: role.description,
            }))
        : [],
      defaultRoleName: defaultRole?.name ?? "",
      needsApproval: !settings.autoApproveRegistrations,
      verifiesEmail: settings.requireEmailVerification,
    },
  };
}

/**
 * Up to two letters: a first and last initial, or the first two characters of
 * whatever single word there is.
 */
function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

async function readUser(userId: string): Promise<AccountUser | null> {
  await connectDB();
  const record = await User.findById(userId).lean<any>();
  // A session outliving its account shows the signed-out header rather than a
  // menu belonging to nobody.
  if (!record) return null;

  const [{ permissions, isAdministrator, roleIds }, roles, calendarPage] = await Promise.all([
    getUserAccess(userId),
    getRoleSummaries(),
    // The calendar page is a place rather than a permission, so whether it
    // exists has to be asked as well as whether this member may open it.
    getCalendarPageSettings(),
  ]);
  const { community } = splitRoles((record.roleIds ?? []).map(String), roles);

  // An account with no name at all falls back to the part of its address before
  // the @ — enough to recognise yourself by, without putting the address itself
  // into the page.
  const label =
    (record.name ?? "").trim() || String(record.email ?? "").split("@")[0] || "Account";

  // Everywhere this account can go beyond its own dashboard. The menu is the
  // one place these are offered, so it carries the member's own screens as
  // well as the sections they have been given to work in.
  const sections: { label: string; href: string }[] = [];
  if (permissions.includes("community.directory")) {
    sections.push({ label: "Member directory", href: "/directory" });
  }
  // Named by its own title rather than by a fixed word, so a site that calls it
  // "What's on" says that here too.
  if (calendarPage.enabled && permissions.includes("community.calendar")) {
    sections.push({ label: calendarPage.title, href: "/calendar" });
  }
  if (contentPermissions(permissions).canView) {
    sections.push({ label: "Content", href: "/manage/content" });
  }
  if (sponsorshipAccess(permissions).canView) {
    sections.push({ label: "Sponsorships", href: "/manage/sponsorships" });
  }
  /*
   * Offered to anybody who may read a metadata group's answers — by the
   * permission that defines them, by a role named on one, or by having been
   * handed one directly. The last of those cannot be read off the permissions,
   * so it costs one narrow query for an account that holds none of the others.
   */
  if (await canReachMemberData(userId, roleIds, permissions)) {
    sections.push({ label: "Member data", href: "/manage/member-data" });
  }

  return {
    label,
    initials: initialsOf(label),
    isAdministrator,
    level: community.map((role) => role.name).join(", "),
    sections,
  };
}
