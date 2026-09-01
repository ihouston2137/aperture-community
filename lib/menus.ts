import type { Model } from "mongoose";

import { getUserAccess } from "./access";
import { connectDB } from "./db";
import {
  MENU_CONTENT_TYPES,
  anonymousViewer,
  narrowVisibility,
  normalizeMenuItems,
  normalizeVisibility,
  publicVisibility,
  visibleMenuItems,
  widestVisibility,
  type MenuContentType,
  type MenuItem,
  type MenuRecord,
  type MenuViewer,
  type MenuVisibility,
} from "./menu-types";
import {
  Collection,
  Documentation,
  FormDefinition,
  Menu,
  SitePage,
  Story,
  User,
  Zine,
} from "./models";
import { publicationHref } from "./publication-layout";
import { getSession } from "./session";
import { getSiteContent } from "./site-settings";

export * from "./menu-types";

/** The slug the header menu always has, so it can be found without an id. */
export const SITE_MENU_SLUG = "site-header";

/* ------------------------------------------------------- Resolving targets */

/** One publishable record, as the link picker and the resolver both need it. */
export type MenuTargetOption = {
  _id: string;
  label: string;
  href: string;
};

/**
 * Every published thing a menu can point at.
 *
 * Only published records: a draft has no address, and offering one would make a
 * menu item that leads nowhere until somebody remembers to publish.
 */
export async function loadMenuTargets(): Promise<
  Record<MenuContentType, MenuTargetOption[]>
> {
  await connectDB();

  const [pages, stories, collections, publications, docSets, forms] = await Promise.all([
    SitePage.find({ status: "published" }).select("title slug").sort({ title: 1 }).lean<any[]>(),
    Story.find({ status: "published" }).select("headline slug").sort({ headline: 1 }).lean<any[]>(),
    // A collection is published by being public rather than by a status field.
    Collection.find({ isPublic: true }).select("name slug").sort({ name: 1 }).lean<any[]>(),
    Zine.find({ status: "published" }).select("title slug kind").sort({ title: 1 }).lean<any[]>(),
    Documentation.find({ status: "published" })
      .select("title slug")
      .sort({ title: 1 })
      .lean<any[]>(),
    FormDefinition.find({ status: "published" })
      .select("title slug")
      .sort({ title: 1 })
      .lean<any[]>(),
  ]);

  return {
    page: pages.map((doc) => ({
      _id: String(doc._id),
      label: doc.title || doc.slug,
      href: `/${doc.slug}`,
    })),
    story: stories.map((doc) => ({
      _id: String(doc._id),
      label: doc.headline || doc.slug,
      href: `/stories/${doc.slug}`,
    })),
    collection: collections.map((doc) => ({
      _id: String(doc._id),
      label: doc.name || doc.slug,
      href: `/collections/${doc.slug}`,
    })),
    publication: publications.map((doc) => ({
      _id: String(doc._id),
      label: doc.title || doc.slug,
      href: publicationHref(doc.kind, doc.slug),
    })),
    documentation: docSets.map((doc) => ({
      _id: String(doc._id),
      label: doc.title || doc.slug,
      href: `/docs/${doc.slug}`,
    })),
    form: forms.map((doc) => ({
      _id: String(doc._id),
      label: doc.title || doc.slug,
      href: `/forms/${doc.slug}`,
    })),
  };
}

/**
 * Fills in each item's address from the record it points at.
 *
 * Resolved on read rather than stored on save, so renaming a page moves every
 * menu that links to it instead of leaving a stale address behind. An internal
 * target whose record has gone — deleted, or unpublished — resolves to nothing
 * and the item is dropped, which is better than a link to a 404.
 */
function resolveItems(
  items: MenuItem[],
  targets: Record<MenuContentType, MenuTargetOption[]>
): MenuItem[] {
  const resolve = (item: MenuItem): MenuItem | null => {
    if (item.kind === "label") {
      return {
        ...item,
        href: "",
        children: item.children
          .map(resolve)
          .filter((child): child is MenuItem => child !== null),
      };
    }

    if (item.targetType === "url") {
      return item.href ? item : null;
    }

    const found = targets[item.targetType as MenuContentType]?.find(
      (option) => option._id === item.targetId
    );
    if (!found) return null;

    return { ...item, href: found.href, label: item.label || found.label };
  };

  return items.map(resolve).filter((item): item is MenuItem => item !== null);
}

/* ------------------------------------------------------------ Reading menus */

function toRecord(doc: any): MenuRecord {
  return {
    _id: String(doc._id),
    name: doc.name ?? "",
    slug: doc.slug ?? "",
    isSite: Boolean(doc.isSite),
    items: normalizeMenuItems(doc.items),
  };
}

/**
 * The header menu, created from the old header links the first time it is
 * asked for.
 *
 * Menus used to live on the site content record as a plain list. Rather than
 * migrate on deploy, the first read builds the menu from whatever is there, so
 * a site upgrading keeps the header it had.
 */
export async function ensureSiteMenu(): Promise<MenuRecord> {
  await connectDB();

  const existing = await Menu.findOne({ isSite: true }).lean<any>();
  if (existing) return toRecord(existing);

  const content = await getSiteContent();
  const items = normalizeMenuItems(
    (content.menuLinks ?? []).map((link: any) => ({
      kind: link.kind === "label" ? "label" : "link",
      label: link.label,
      targetType: "url",
      href: link.href,
      newTab: link.newTab,
      showCaret: link.showCaret,
      children: (link.children ?? []).map((child: any) => ({
        kind: "link",
        label: child.label,
        targetType: "url",
        href: child.href,
        newTab: child.newTab,
      })),
    }))
  );

  const created = await Menu.create({
    name: "Site header",
    slug: SITE_MENU_SLUG,
    isSite: true,
    items,
  });
  return toRecord(created);
}

export async function listMenus(): Promise<MenuRecord[]> {
  await connectDB();
  await ensureSiteMenu();
  const docs = await Menu.find().sort({ isSite: -1, name: 1 }).lean<any[]>();
  return docs.map(toRecord);
}

export async function getMenuById(id: string): Promise<MenuRecord | null> {
  await connectDB();
  const doc = await Menu.findById(id).lean<any>();
  return doc ? toRecord(doc) : null;
}

/* ------------------------------------------------------------- The viewer */

/** Who is looking, for the visibility rules. One session read, one access read. */
export async function getMenuViewer(): Promise<MenuViewer> {
  const session = await getSession();
  if (!session) return { ...anonymousViewer };

  await connectDB();
  const [user, access] = await Promise.all([
    User.findById(session.userId).select("roleIds").lean<any>(),
    getUserAccess(session.userId),
  ]);

  // An account that cannot sign in holds nothing, so it sees what a stranger
  // sees rather than what it used to.
  if (access.permissions.length === 0 && !access.isAdministrator) {
    return { ...anonymousViewer };
  }

  return {
    signedIn: true,
    roleIds: (user?.roleIds ?? []).map(String),
    isAdministrator: access.isAdministrator,
  };
}

/**
 * One menu, resolved and filtered to what this viewer may see.
 *
 * The filtering happens here rather than in the component, so a link somebody
 * is not allowed to follow is never sent to their browser at all.
 */
export async function loadMenuFor(
  menu: MenuRecord | null,
  viewer: MenuViewer
): Promise<MenuItem[]> {
  if (!menu || menu.items.length === 0) return [];
  const targets = await loadMenuTargets();
  return visibleMenuItems(resolveItems(menu.items, targets), viewer);
}

/* ------------------------------------------------------- Content access */

export type ContentAccess = Map<string, MenuVisibility>;

function contentKey(type: MenuContentType, id: string): string {
  return `${type}:${id}`;
}

/**
 * What every piece of linked content requires, gathered from every menu.
 *
 * A menu is how people find things, so restricting the way in restricts what it
 * leads to — otherwise a members-only link would be a suggestion rather than a
 * rule, defeated by anyone who guessed the address. Content no menu mentions is
 * unrestricted: this grants nothing, it only enforces what a menu already says.
 */
export async function loadContentAccess(): Promise<ContentAccess> {
  await connectDB();
  await ensureSiteMenu();
  const docs = await Menu.find().select("items").lean<any[]>();

  const collected = new Map<string, MenuVisibility[]>();

  /*
   * Down the whole menu, narrowing at every level.
   *
   * Recursive rather than a link and its children, because a menu now nests
   * twice: a link inside a group inside a group has *two* ways in above it,
   * and recording only the nearer one would leave the outer group's rule off
   * the way in — which is the one case this whole map exists to catch.
   */
  const record = (item: MenuItem, inherited: MenuVisibility) => {
    const rule = narrowVisibility(inherited, item.visibility);

    if (item.kind === "label") {
      for (const child of item.children) record(child, rule);
      return;
    }

    if (item.targetType !== "url" && item.targetId) {
      const key = contentKey(item.targetType as MenuContentType, item.targetId);
      const rules = collected.get(key) ?? [];
      rules.push(rule);
      collected.set(key, rules);
    }
  };

  for (const doc of docs) {
    for (const item of normalizeMenuItems(doc.items)) {
      record(item, publicVisibility);
    }
  }

  const access: ContentAccess = new Map();
  for (const [key, rules] of collected) access.set(key, widestVisibility(rules));

  // Then the records' own rules, which apply whether or not a menu mentions
  // them. Only the restricted ones are fetched: on a site where nothing carries
  // its own rule — every site, before this existed — these five queries match
  // nothing and this loop does not run.
  for (const [type, own] of await loadOwnVisibility()) {
    const key = contentKey(type, own.id);
    const viaMenu = access.get(key);
    // As restricted as its own rule *and* the way in put together. So adding a
    // public link to a members-only page does not quietly publish it, and
    // restricting the link does not need the record changed as well.
    access.set(key, viaMenu ? narrowVisibility(own.visibility, viaMenu) : own.visibility);
  }

  return access;
}

/** The models that carry a rule of their own, and what to read a title from. */
const OWNED: { type: MenuContentType; model: Model<any> }[] = [
  { type: "page", model: SitePage },
  { type: "story", model: Story },
  { type: "collection", model: Collection },
  { type: "publication", model: Zine },
  { type: "documentation", model: Documentation },
  { type: "form", model: FormDefinition },
];

type OwnRule = { id: string; visibility: MenuVisibility };

/**
 * Every record that restricts itself.
 *
 * Filtered in the query rather than in memory: a public rule is the default and
 * means nothing needs saying, so there is no reason to carry every record on
 * the site back across the wire to discover that.
 */
async function loadOwnVisibility(): Promise<[MenuContentType, OwnRule][]> {
  const restricted = { "visibility.mode": { $in: ["signedIn", "roles"] } };

  const results = await Promise.all(
    OWNED.map(async ({ type, model }) => {
      const rows = await model.find(restricted).select("_id visibility").lean<any[]>();
      return rows.map(
        (row): [MenuContentType, OwnRule] => [
          type,
          { id: String(row._id), visibility: normalizeVisibility(row.visibility) },
        ]
      );
    })
  );

  return results.flat();
}

export type ContentVerdict = "allowed" | "signInRequired" | "denied";

/**
 * Whether this viewer may read one piece of content.
 *
 * `signInRequired` is kept apart from `denied` so a route can send somebody to
 * the sign-in form rather than showing them a page that does not seem to exist.
 */
export async function checkContentAccess(
  type: MenuContentType,
  id: string
): Promise<ContentVerdict> {
  if (!MENU_CONTENT_TYPES.includes(type) || !id) return "allowed";

  const access = await loadContentAccess();
  const rule = access.get(contentKey(type, id));
  if (!rule || rule.mode === "public") return "allowed";

  const viewer = await getMenuViewer();
  if (viewer.isAdministrator) return "allowed";
  if (!viewer.signedIn) return "signInRequired";
  if (rule.mode === "signedIn") return "allowed";
  return rule.roleIds.some((roleId) => viewer.roleIds.includes(roleId))
    ? "allowed"
    : "denied";
}
