export type NavItem = {
  href: string;
  label: string;
  /** Omit to always show the link. */
  permission?: string;
  /** Shown when the user holds any one of these. */
  anyPermission?: string[];
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const adminNavGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [{ href: "/admin", label: "Dashboard" }],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/pages", label: "Pages", permission: "pages.manage" },
      { href: "/admin/stories", label: "Stories", permission: "stories.manage" },
      {
        href: "/admin/collections",
        label: "Collections",
        permission: "collections.manage",
      },
      {
        href: "/admin/publications",
        label: "Publications",
        permission: "publications.manage",
      },
      { href: "/admin/profiles", label: "Profiles", permission: "profiles.manage" },
      { href: "/admin/calendar", label: "Calendar", permission: "calendar.manage" },
      { href: "/admin/docs", label: "Documentation", permission: "docs.manage" },
    ],
  },
  {
    label: "Forms",
    items: [
      { href: "/admin/forms", label: "Forms", permission: "forms.manage" },
      {
        href: "/admin/forms/submissions",
        label: "Submissions",
        permission: "forms.submissions",
      },
    ],
  },
  {
    label: "Media",
    items: [{ href: "/admin/media", label: "Media library", permission: "media.view" }],
  },
  {
    label: "Design",
    items: [
      // Appearance also hosts the site content settings, as a second tab, so
      // either permission is enough to reach it.
      {
        href: "/admin/styles",
        label: "Appearance & Content",
        anyPermission: ["appearance.manage", "siteContent.manage"],
      },
      {
        href: "/admin/design-library",
        label: "Design Library",
        permission: "design.library",
      },
      {
        href: "/admin/site-design",
        label: "Other Settings",
        permission: "design.site",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/admin/analytics",
        label: "Analytics",
        anyPermission: ["analytics.view", "analytics.manage"],
      },
      { href: "/admin/email", label: "Email", permission: "email.manage" },
      { href: "/admin/users", label: "Users & roles", permission: "users.manage" },
      { href: "/admin/change-password", label: "Change password" },
    ],
  },
];
