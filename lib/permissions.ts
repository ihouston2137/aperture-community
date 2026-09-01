export type PermissionGroup = {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
};

/**
 * Roles come in two kinds and they do not share a vocabulary.
 *
 * A `management` role grants access to parts of `/admin`. A `community` role is
 * a membership level — its name is the label a member wears in the portal, and
 * its permissions say what that level can reach on the member side. Both are
 * created and named by the Administrator; nothing here is a fixed list of
 * levels, only the set of things a level can be given.
 */
export const ROLE_KINDS = ["management", "community"] as const;
export type RoleKind = (typeof ROLE_KINDS)[number];

export function roleKind(value: unknown): RoleKind {
  return value === "community" ? "community" : "management";
}

export const permissionGroups: PermissionGroup[] = [
  {
    key: "content",
    label: "Content",
    permissions: [
      { key: "pages.manage", label: "Manage site pages" },
      { key: "stories.manage", label: "Manage stories" },
      { key: "storyTemplates.manage", label: "Manage story templates" },
      { key: "collections.manage", label: "Manage collections" },
      { key: "profiles.manage", label: "Manage profiles" },
      { key: "calendar.manage", label: "Manage calendar events" },
      { key: "docs.manage", label: "Manage documentation" },
      { key: "publications.manage", label: "Manage publications" },
    ],
  },
  {
    key: "contentDashboard",
    label: "Content dashboard",
    permissions: [
      { key: "content.dashboard", label: "Open the content dashboard" },
      { key: "content.public.view", label: "See public content" },
      { key: "content.public.edit", label: "Change public content" },
      { key: "content.protected.view", label: "See restricted content" },
      { key: "content.protected.edit", label: "Change restricted content" },
      { key: "content.published.view", label: "See live content" },
      { key: "content.published.edit", label: "Change live content" },
      { key: "content.draft.view", label: "See drafts" },
      { key: "content.draft.edit", label: "Change drafts" },
      {
        key: "content.navigation",
        label: "Change the site navigation from the dashboard",
      },
    ],
  },
  {
    key: "media",
    label: "Media",
    permissions: [
      { key: "media.view", label: "View media library" },
      { key: "media.upload", label: "Upload media" },
      { key: "media.delete", label: "Delete media" },
    ],
  },
  {
    key: "forms",
    label: "Forms",
    permissions: [
      { key: "forms.manage", label: "Manage forms" },
      { key: "forms.submissions", label: "View form submissions" },
    ],
  },
  {
    key: "design",
    label: "Design",
    permissions: [
      { key: "design.library", label: "Manage design library" },
      { key: "design.site", label: "Manage site design" },
      { key: "siteContent.manage", label: "Manage site content" },
      { key: "appearance.manage", label: "Manage appearance" },
    ],
  },
  {
    key: "community",
    label: "Community",
    permissions: [
      { key: "members.approve", label: "Approve members and set their level" },
      { key: "members.view", label: "View the member list" },
      { key: "members.relationships", label: "Link members to one another" },
      { key: "members.groups", label: "Put members into groups" },
      {
        key: "members.metadata",
        label: "Define metadata groups, and read every answer to them",
      },
      {
        key: "members.metadata.view",
        label: "Read answers to the metadata groups they are named on",
      },
      {
        key: "members.metadata.edit",
        label: "Fill in and change answers on the groups they are named on",
      },
      {
        key: "members.metadata.reports",
        label: "Open metadata reports for the groups they are named on",
      },
      { key: "registration.manage", label: "Manage registration settings" },
      { key: "attendance.view", label: "See who attended events" },
      { key: "attendance.record", label: "Record event attendance" },
    ],
  },
  {
    key: "sponsorships",
    label: "Sponsorships",
    permissions: [
      {
        key: "sponsorships.view",
        label: "Open the sponsorships dashboard and read what is running",
      },
      { key: "sponsorships.campaigns", label: "Add and edit campaigns" },
      { key: "sponsorships.sponsors", label: "Add and edit sponsors" },
      {
        // Narrower than editing a sponsor, and offered separately because it
        // is the one job somebody outside the programme is often asked to do:
        // a member with the artwork uploads it without also being handed the
        // sponsor's contacts and notes.
        key: "sponsorships.logos",
        label: "Upload and remove sponsor logos",
      },
      { key: "sponsorships.donations", label: "Add and edit donations" },
      {
        // The key keeps the older word: it is stored on every role that has
        // been granted this, and renaming it would quietly revoke them all.
        key: "sponsorships.closed",
        label: "See archived campaigns and what they raised",
      },
      {
        key: "sponsorships.records",
        label: "Browse every campaign, sponsor and donation on file",
      },
      {
        key: "sponsorships.manage",
        label: "Everything above, plus levels, benefits and categories",
      },
    ],
  },
  {
    key: "system",
    label: "System",
    permissions: [
      { key: "analytics.view", label: "View site analytics" },
      { key: "analytics.manage", label: "Manage analytics settings" },
      { key: "email.manage", label: "Manage email settings" },
      { key: "users.manage", label: "Manage users and roles" },
    ],
  },
];

/**
 * What a membership level can be given. Deliberately about reaching things
 * rather than editing them — anything that edits site content is a management
 * permission, even when a member holds it.
 */
export const communityPermissionGroups: PermissionGroup[] = [
  {
    key: "portal",
    label: "Portal",
    permissions: [
      { key: "community.portal", label: "Sign in to the member portal" },
      { key: "community.directory", label: "Browse the member directory" },
      { key: "community.directory.contact", label: "See member phone numbers and emails" },
      { key: "community.profile", label: "Edit their own member profile" },
    ],
  },
  {
    key: "community-content",
    label: "Member content",
    permissions: [
      { key: "community.calendar", label: "View the community calendar" },
      { key: "community.docs", label: "Read member documentation" },
      { key: "community.collections", label: "View member collections" },
      { key: "community.publications", label: "Read member publications" },
      { key: "community.media", label: "View member media" },
    ],
  },
  {
    key: "community-participation",
    label: "Participation",
    permissions: [
      { key: "community.forms", label: "Submit member forms" },
      { key: "community.events.rsvp", label: "RSVP to events" },
      { key: "community.events.host", label: "Propose events" },
      { key: "community.upload", label: "Upload to member collections" },
    ],
  },
  {
    /*
     * The two sponsorship jobs a membership level may be given.
     *
     * The same keys the management group offers, not copies of them: a
     * permission means one thing wherever it is granted, and two keys meaning
     * "may see the sponsorships dashboard" would be two things to keep in step
     * and one of them eventually forgotten.
     *
     * Only these two. Everything else about the programme — campaigns,
     * donations, the sponsor records, what a level is worth — stays with the
     * management roles, because those are decisions about how the community
     * is funded rather than jobs somebody helps with.
     */
    key: "community-sponsorships",
    label: "Sponsorships",
    permissions: [
      {
        key: "sponsorships.view",
        label: "Open the sponsorships dashboard and read what is running",
      },
      { key: "sponsorships.logos", label: "Upload and remove sponsor logos" },
    ],
  },
];

export const allPermissions: string[] = permissionGroups.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);

export const allCommunityPermissions: string[] = communityPermissionGroups.flatMap(
  (group) => group.permissions.map((permission) => permission.key)
);

export function permissionGroupsFor(kind: RoleKind): PermissionGroup[] {
  return kind === "community" ? communityPermissionGroups : permissionGroups;
}

export function allPermissionsFor(kind: RoleKind): string[] {
  return kind === "community" ? allCommunityPermissions : allPermissions;
}

export function permissionLabel(key: string): string {
  for (const group of [...permissionGroups, ...communityPermissionGroups]) {
    const found = group.permissions.find((permission) => permission.key === key);
    if (found) return found.label;
  }
  return key;
}

export const ADMINISTRATOR_ROLE_SLUG = "administrator";

/** The community role seeded on a fresh install, so registration always has a default. */
export const MEMBER_ROLE_SLUG = "member";

/* ------------------------------------------------------------- Membership */

/**
 * Where an account sits in the join process. `active` is the only state that
 * can sign in; everything else is reported to the person at the login form.
 */
export const MEMBERSHIP_STATUSES = ["pending", "active", "rejected", "suspended"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export function membershipStatus(value: unknown): MembershipStatus {
  return MEMBERSHIP_STATUSES.includes(value as MembershipStatus)
    ? (value as MembershipStatus)
    : "active";
}

export const membershipStatusLabels: Record<MembershipStatus, string> = {
  pending: "Awaiting approval",
  active: "Active",
  rejected: "Declined",
  suspended: "Suspended",
};
