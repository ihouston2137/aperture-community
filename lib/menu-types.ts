/**
 * Menus: what they hold, who can see each item, and what an item points at.
 *
 * Kept free of database imports because the menu editor and the menu block are
 * client components that read these types and helpers.
 */

/** What a link can point at. `url` is the escape hatch for anything external. */
export const MENU_TARGET_TYPES = [
  "page",
  "story",
  "collection",
  "publication",
  "documentation",
  "form",
  "url",
] as const;
export type MenuTargetType = (typeof MENU_TARGET_TYPES)[number];

export const MENU_TARGET_LABELS: Record<MenuTargetType, string> = {
  page: "Page",
  story: "Story",
  collection: "Collection",
  publication: "Publication",
  documentation: "Documentation",
  form: "Form",
  url: "Web address",
};

/** The content types a menu link can reach, and therefore can also protect. */
export const MENU_CONTENT_TYPES = MENU_TARGET_TYPES.filter(
  (type): type is Exclude<MenuTargetType, "url"> => type !== "url"
);
export type MenuContentType = (typeof MENU_CONTENT_TYPES)[number];

export function menuTargetType(value: unknown): MenuTargetType {
  return MENU_TARGET_TYPES.includes(value as MenuTargetType)
    ? (value as MenuTargetType)
    : "url";
}

/* ------------------------------------------------------------- Visibility */

/**
 * Who an item is for.
 *
 * `public` is everyone, signed in or not. `signedIn` is any active account
 * whatever it holds. `roles` names membership levels and management roles —
 * both kinds live in one list, because a menu does not care which kind grants
 * the access, only that the viewer has it.
 */
export const MENU_VISIBILITY_MODES = ["public", "signedIn", "roles"] as const;
export type MenuVisibilityMode = (typeof MENU_VISIBILITY_MODES)[number];

export const MENU_VISIBILITY_LABELS: Record<MenuVisibilityMode, string> = {
  public: "Everyone",
  signedIn: "Anyone signed in",
  roles: "Only these roles",
};

export type MenuVisibility = {
  mode: MenuVisibilityMode;
  roleIds: string[];
};

export const publicVisibility: MenuVisibility = { mode: "public", roleIds: [] };

export function normalizeVisibility(input: unknown): MenuVisibility {
  const raw = (input ?? {}) as Record<string, unknown>;
  const mode = MENU_VISIBILITY_MODES.includes(raw.mode as MenuVisibilityMode)
    ? (raw.mode as MenuVisibilityMode)
    : "public";
  const roleIds = Array.isArray(raw.roleIds)
    ? [...new Set(raw.roleIds.map(String).filter(Boolean))].slice(0, 50)
    : [];

  // A restriction naming nobody would hide the item from everyone, which is
  // never what was meant by choosing it and leaving the list empty.
  if (mode === "roles" && roleIds.length === 0) return { ...publicVisibility };
  return { mode, roleIds };
}

/** Who is looking, as the visibility rules need them. */
export type MenuViewer = {
  signedIn: boolean;
  /** Every role the viewer holds, of either kind. */
  roleIds: string[];
  /** An Administrator sees everything, so nothing can be hidden from them. */
  isAdministrator: boolean;
};

export const anonymousViewer: MenuViewer = {
  signedIn: false,
  roleIds: [],
  isAdministrator: false,
};

export function visibilityAllows(
  visibility: MenuVisibility,
  viewer: MenuViewer
): boolean {
  if (visibility.mode === "public") return true;
  if (viewer.isAdministrator) return true;
  if (!viewer.signedIn) return false;
  if (visibility.mode === "signedIn") return true;
  return visibility.roleIds.some((roleId) => viewer.roleIds.includes(roleId));
}

/**
 * The least restrictive of several rules.
 *
 * Content reachable from two menus is as open as the most open way to it —
 * anything else would let adding a link to a members-only menu quietly take a
 * public page away from the public.
 */
export function widestVisibility(rules: MenuVisibility[]): MenuVisibility {
  if (rules.length === 0) return { ...publicVisibility };
  if (rules.some((rule) => rule.mode === "public")) return { ...publicVisibility };
  if (rules.some((rule) => rule.mode === "signedIn")) {
    return { mode: "signedIn", roleIds: [] };
  }
  return {
    mode: "roles",
    roleIds: [...new Set(rules.flatMap((rule) => rule.roleIds))],
  };
}

/**
 * A rule and the rule above it, combined.
 *
 * A link inside a restricted group is at least as restricted as the group: the
 * group is how it is reached, so opening the link alone would not open the way
 * to it.
 */
export function narrowVisibility(
  parent: MenuVisibility,
  child: MenuVisibility
): MenuVisibility {
  if (parent.mode === "public") return child;
  if (child.mode === "public") return parent;
  if (parent.mode === "signedIn") return child;
  if (child.mode === "signedIn") return parent;
  // Both name roles: only the roles in both can reach it.
  const shared = parent.roleIds.filter((roleId) => child.roleIds.includes(roleId));
  return { mode: "roles", roleIds: shared };
}

/* ------------------------------------------------------------------ Items */

export type MenuItem = {
  id: string;
  /** A `label` is not a link; it opens a group of the items beneath it. */
  kind: "link" | "label";
  label: string;
  targetType: MenuTargetType;
  /** The chosen record, for an internal target. */
  targetId: string;
  /** Where it goes. Resolved from `targetId` on read; typed in full for a url. */
  href: string;
  newTab: boolean;
  showCaret: boolean;
  visibility: MenuVisibility;
  children: MenuItem[];
};

export type MenuRecord = {
  _id: string;
  name: string;
  slug: string;
  /** The one the site header uses. Exactly one menu carries this. */
  isSite: boolean;
  items: MenuItem[];
};

let counter = 0;
export function menuItemId(): string {
  counter += 1;
  return `mi-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function blankMenuItem(kind: "link" | "label" = "link"): MenuItem {
  return {
    id: menuItemId(),
    kind,
    label: "",
    targetType: "url",
    targetId: "",
    href: "",
    newTab: false,
    showCaret: true,
    visibility: { ...publicVisibility },
    children: [],
  };
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** One level of nesting only, matching what the header has always rendered. */
export function normalizeMenuItems(input: unknown, depth = 0): MenuItem[] {
  if (!Array.isArray(input)) return [];

  return input.slice(0, 50).map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const kind = row.kind === "label" ? "label" : "link";

    return {
      id: str(row.id) || menuItemId(),
      kind,
      label: str(row.label).slice(0, 120),
      targetType: menuTargetType(row.targetType),
      targetId: str(row.targetId),
      href: str(row.href).slice(0, 2000),
      newTab: Boolean(row.newTab),
      // Absent means yes, so a menu saved before the option existed keeps the
      // arrow it was already showing.
      showCaret: row.showCaret !== false,
      visibility: normalizeVisibility(row.visibility),
      children: depth === 0 && kind === "label" ? normalizeMenuItems(row.children, 1) : [],
    };
  });
}

/**
 * The menu as one viewer sees it.
 *
 * A group whose every child is hidden is dropped too: an arrow that opens
 * nothing is worse than no arrow.
 */
export function visibleMenuItems(items: MenuItem[], viewer: MenuViewer): MenuItem[] {
  const out: MenuItem[] = [];

  for (const item of items) {
    if (!visibilityAllows(item.visibility, viewer)) continue;

    if (item.kind === "label") {
      const children = item.children.filter((child) =>
        visibilityAllows(narrowVisibility(item.visibility, child.visibility), viewer)
      );
      if (children.length === 0) continue;
      out.push({ ...item, children });
      continue;
    }

    out.push({ ...item, children: [] });
  }

  return out;
}

/** A label with nothing under it has no group to open, so it reads as a link. */
export function isMenuGroup(item: MenuItem): boolean {
  return item.kind === "label" && item.children.length > 0;
}

/* ------------------------------------------------------- The menu block */

export const MENU_BLOCK_LAYOUTS = ["list", "dropdown"] as const;
export type MenuBlockLayout = (typeof MENU_BLOCK_LAYOUTS)[number];

export function menuBlockLayout(value: unknown): MenuBlockLayout {
  return value === "dropdown" ? "dropdown" : "list";
}

export const MENU_BLOCK_DIRECTIONS = ["vertical", "horizontal"] as const;
export type MenuBlockDirection = (typeof MENU_BLOCK_DIRECTIONS)[number];

export function menuBlockDirection(value: unknown): MenuBlockDirection {
  return value === "horizontal" ? "horizontal" : "vertical";
}
