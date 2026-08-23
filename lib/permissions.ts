export type PermissionGroup = {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
};

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

export const allPermissions: string[] = permissionGroups.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);

export function permissionLabel(key: string): string {
  for (const group of permissionGroups) {
    const found = group.permissions.find((permission) => permission.key === key);
    if (found) return found.label;
  }
  return key;
}

export const ADMINISTRATOR_ROLE_SLUG = "administrator";
