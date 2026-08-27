import {
  contentTypeMeta,
  type ContentAudience,
  type ContentPermissions,
  type ContentState,
} from "./content-access";
import { connectDB } from "./db";
import {
  ensureSiteMenu,
  narrowVisibility,
  normalizeMenuItems,
  normalizeVisibility,
  publicVisibility,
  type MenuContentType,
  type MenuItem,
  type MenuVisibility,
} from "./menus";
import {
  Collection,
  DocPage,
  Documentation,
  FormDefinition,
  Menu,
  SitePage,
  Story,
  Zine,
} from "./models";
import { publicationHref, type PublicationKind } from "./publication-layout";
import type { SiteNode } from "./site-tree";

/**
 * The site drawn as a tree, from the home page down.
 *
 * The hierarchy is not invented here — it is the site header menu, which is
 * already what decides both the navigation and, through `loadContentAccess`,
 * who may reach what. Reading the diagram off the menu rather than off a
 * structure of its own is the whole point: there is one hierarchy, and moving a
 * node on the canvas moves the site.
 */

/**
 * What every editor opened from here is told to put on its way-back link.
 *
 * A fixed token rather than the address itself: a `from` carrying a URL would
 * be an open redirect, and an editor only ever needs to know which of a handful
 * of places somebody set off from. `lib/admin-exit.ts` turns it back into one.
 */
const FROM_DASHBOARD = "?from=content";

/** One record of any of the five kinds, as both the canvas and the pickers want it. */
export type CatalogueEntry = {
  _id: string;
  type: MenuContentType;
  label: string;
  href: string;
  state: ContentState;
  editHref: string;
  meta: string;
  /**
   * The record's own rule about who may see it, independent of any menu.
   *
   * This is what the tray's popup edits. For something in the navigation the
   * menu item carries a rule too, and `loadContentAccess` applies both.
   */
  visibility: MenuVisibility;
};

function key(type: MenuContentType, id: string): string {
  return `${type}:${id}`;
}

/**
 * Every record of every kind, drafts included.
 *
 * Deliberately not `loadMenuTargets`, which returns only published records
 * because a menu should not offer a link to something with no address. Here the
 * drafts are the point: a dashboard that hid them would hide the work.
 */
export async function loadContentCatalogue(): Promise<Map<string, CatalogueEntry>> {
  await connectDB();

  const [pages, stories, collections, docSets, publications, forms, docCounts] =
    await Promise.all([
      SitePage.find().select("title slug status isHome visibility").sort({ title: 1 }).lean<any[]>(),
      Story.find().select("headline slug status visibility").sort({ headline: 1 }).lean<any[]>(),
      Collection.find().select("name slug isPublic imageIds visibility").sort({ name: 1 }).lean<any[]>(),
      Documentation.find().select("title slug status visibility").sort({ title: 1 }).lean<any[]>(),
      Zine.find({ isTemplate: { $ne: true } })
        .select("title slug status kind visibility")
        .sort({ title: 1 })
        .lean<any[]>(),
      FormDefinition.find()
        .select("title slug status visibility")
        .sort({ title: 1 })
        .lean<any[]>(),
      DocPage.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$documentationId", count: { $sum: 1 } } },
      ]),
    ]);

  const documentCount = new Map(docCounts.map((row) => [String(row._id), row.count]));
  const catalogue = new Map<string, CatalogueEntry>();
  const add = (entry: CatalogueEntry) => catalogue.set(key(entry.type, entry._id), entry);

  for (const row of pages) {
    add({
      _id: String(row._id),
      type: "page",
      label: row.title || row.slug || "Untitled page",
      href: `/${row.slug}`,
      state: row.status === "published" ? "published" : "draft",
      editHref: `/admin/pages/${row._id}/edit${FROM_DASHBOARD}`,
      meta: `/${row.slug}${row.isHome ? " · home page" : ""}`,
      visibility: normalizeVisibility(row.visibility),
    });
  }

  for (const row of stories) {
    add({
      _id: String(row._id),
      type: "story",
      label: row.headline || row.slug || "Untitled story",
      href: `/stories/${row.slug}`,
      state: row.status === "published" ? "published" : "draft",
      editHref: `/admin/stories/${row._id}/edit${FROM_DASHBOARD}`,
      meta: `/stories/${row.slug}`,
      visibility: normalizeVisibility(row.visibility),
    });
  }

  for (const row of collections) {
    // A collection has no status field: it is live by being public. That is the
    // same question the other kinds ask, in this kind's own vocabulary.
    const images = (row.imageIds ?? []).length;
    add({
      _id: String(row._id),
      type: "collection",
      label: row.name || row.slug || "Untitled collection",
      href: `/collections/${row.slug}`,
      state: row.isPublic ? "published" : "draft",
      editHref: `/admin/collections/${row._id}/edit${FROM_DASHBOARD}`,
      meta: `/collections/${row.slug} · ${images} image${images === 1 ? "" : "s"}`,
      visibility: normalizeVisibility(row.visibility),
    });
  }

  for (const row of docSets) {
    const documents = documentCount.get(String(row._id)) ?? 0;
    add({
      _id: String(row._id),
      type: "documentation",
      label: row.title || row.slug || "Untitled set",
      href: `/docs/${row.slug}`,
      state: row.status === "published" ? "published" : "draft",
      // A set is opened rather than edited: its documents are the work.
      editHref: `/admin/docs/${row._id}${FROM_DASHBOARD}`,
      meta: `/docs/${row.slug} · ${documents} document${documents === 1 ? "" : "s"}`,
      visibility: normalizeVisibility(row.visibility),
    });
  }

  for (const row of publications) {
    const kind = (row.kind ?? "zine") as PublicationKind;
    add({
      _id: String(row._id),
      type: "publication",
      label: row.title || row.slug || "Untitled publication",
      href: publicationHref(kind, row.slug),
      state: row.status === "published" ? "published" : "draft",
      editHref: `/admin/publications/${row._id}/edit${FROM_DASHBOARD}`,
      meta: `${kind} · ${publicationHref(kind, row.slug)}`,
      visibility: normalizeVisibility(row.visibility),
    });
  }

  for (const row of forms) {
    add({
      _id: String(row._id),
      type: "form",
      label: row.title || row.slug || "Untitled form",
      href: `/forms/${row.slug}`,
      state: row.status === "published" ? "published" : "draft",
      editHref: `/admin/forms/${row._id}/edit${FROM_DASHBOARD}`,
      meta: `/forms/${row.slug}`,
      visibility: normalizeVisibility(row.visibility),
    });
  }

  return catalogue;
}

/* --------------------------------------------------------------- The map */

export type SiteMap = {
  root: SiteNode;
  /** The site header menu, which is what a rearrangement writes to. */
  menuId: string;
  /** Content the site navigation does not mention. */
  orphans: CatalogueEntry[];
  /** Top-level items dropped because this viewer may not see them. */
  hiddenTop: number;
  /** No page is marked as the home page, so the root is a placeholder. */
  homeMissing: boolean;
  /** Everything on the canvas, before the viewer's permissions were applied. */
  totalNodes: number;
};

/** Public means public; everything narrower is restricted, whoever it admits. */
function audienceOf(visibility: MenuVisibility): ContentAudience {
  return visibility.mode === "public" ? "public" : "protected";
}

export async function loadSiteMap(access: ContentPermissions): Promise<SiteMap> {
  await connectDB();

  const [menu, catalogue, home] = await Promise.all([
    ensureSiteMenu(),
    loadContentCatalogue(),
    SitePage.findOne({ isHome: true }).select("title slug status").lean<any>(),
  ]);

  const items = normalizeMenuItems(menu.items);
  let totalNodes = 1;
  let hiddenTop = 0;

  /**
   * One menu item as a node, or null when this viewer may not see it.
   *
   * `inherited` is the visibility of the group above, because a link inside a
   * restricted group is reached through that group and is therefore at least as
   * restricted as it — the same rule the live menu applies.
   */
  const toNode = (item: MenuItem, inherited: MenuVisibility): SiteNode | null => {
    totalNodes += 1;
    const visibility = narrowVisibility(inherited, item.visibility);
    const audience = audienceOf(visibility);

    if (item.kind === "label") {
      const children: SiteNode[] = [];
      let hidden = 0;
      for (const child of item.children) {
        const node = toNode(child, visibility);
        if (node) children.push(node);
        else hidden += 1;
      }

      // A group is navigation rather than content, so it has no state of its
      // own; it is live because the header renders it.
      const node: SiteNode = {
        id: item.id,
        kind: "group",
        label: item.label || "Untitled group",
        targetType: null,
        targetId: "",
        href: "",
        audience,
        visibility: item.visibility,
        contentVisibility: publicVisibility,
        state: "published",
        editHref: "",
        meta: `group · ${children.length + hidden} item${
          children.length + hidden === 1 ? "" : "s"
        }`,
        danglingLink: false,
        editable: false,
        hiddenChildren: hidden,
        children,
      };
      node.editable = access.canEdit(node);

      // A group is judged on its own facets like anything else. Hiding it takes
      // its children with it: the group is how they are reached.
      return access.canSee(node) ? node : null;
    }

    if (item.targetType === "url") {
      const node: SiteNode = {
        id: item.id,
        kind: "url",
        label: item.label || item.href || "Link",
        targetType: null,
        targetId: "",
        href: item.href,
        audience,
        visibility: item.visibility,
        contentVisibility: publicVisibility,
        state: "published",
        editHref: "",
        meta: item.href || "no address",
        danglingLink: !item.href,
        editable: false,
        hiddenChildren: 0,
        children: [],
      };
      node.editable = access.canEdit(node);
      return access.canSee(node) ? node : null;
    }

    const type = item.targetType as MenuContentType;
    const entry = catalogue.get(key(type, item.targetId));

    // The record has been deleted out from under the menu item. The live header
    // drops the item; the canvas shows it, because somebody has to know.
    if (!entry) {
      const node: SiteNode = {
        id: item.id,
        kind: "content",
        label: item.label || "Missing",
        targetType: type,
        targetId: item.targetId,
        href: "",
        audience,
        visibility: item.visibility,
        contentVisibility: publicVisibility,
        state: "draft",
        editHref: "",
        meta: `${contentTypeMeta(type)?.noun ?? type} · no longer exists`,
        danglingLink: true,
        editable: false,
        hiddenChildren: 0,
        children: [],
      };
      node.editable = access.canEdit(node);
      return access.canSee(node) ? node : null;
    }

    const node: SiteNode = {
      id: item.id,
      kind: "content",
      label: item.label || entry.label,
      targetType: type,
      targetId: entry._id,
      href: entry.href,
      // Both rules, the way `loadContentAccess` combines them: the dot on the
      // node has to mean what the site actually enforces, not just what the
      // menu says.
      audience: audienceOf(narrowVisibility(visibility, entry.visibility)),
      visibility: item.visibility,
      contentVisibility: entry.visibility,
      state: entry.state,
      editHref: entry.editHref,
      meta: entry.meta,
      // Published content is what the live menu resolves; a draft target makes
      // the item vanish from the header without vanishing from the menu record.
      danglingLink: entry.state !== "published",
      editable: false,
      hiddenChildren: 0,
      children: [],
    };
    node.editable = access.canEdit(node);

    return access.canSee(node) ? node : null;
  };

  const children: SiteNode[] = [];
  for (const item of items) {
    const node = toNode(item, publicVisibility);
    if (node) children.push(node);
    else hiddenTop += 1;
  }

  const homeState: ContentState =
    home?.status === "published" ? "published" : "draft";

  const root: SiteNode = {
    id: "home",
    kind: "home",
    label: home?.title || "Home",
    targetType: home ? "page" : null,
    targetId: home ? String(home._id) : "",
    href: "/",
    // The front door of the site. A restriction on it would be a restriction on
    // everything, and it is not something a menu item can express.
    audience: "public",
    visibility: publicVisibility,
    contentVisibility: publicVisibility,
    state: home ? homeState : "draft",
    editHref: home ? `/admin/pages/${home._id}/edit${FROM_DASHBOARD}` : "/admin/pages",
    meta: home ? `/ · ${home.slug}` : "no page is set as the home page",
    danglingLink: !home,
    // The root is the site itself. Its content is the home page, so editing it
    // is editing that page and asks exactly what that page would.
    editable: Boolean(home) && access.canEdit({
      audience: "public",
      state: homeState,
      targetType: "page",
    }),
    hiddenChildren: hiddenTop,
    children,
  };

  // Everything the site navigation does not mention. Filtered to what this
  // viewer may see, and to the kinds they could actually do something with.
  const linked = new Set<string>();
  const collect = (list: MenuItem[]) => {
    for (const item of list) {
      if (item.kind === "link" && item.targetType !== "url" && item.targetId) {
        linked.add(key(item.targetType as MenuContentType, item.targetId));
      }
      if (item.children.length > 0) collect(item.children);
    }
  };
  collect(items);
  if (home) linked.add(key("page", String(home._id)));

  const orphans = [...catalogue.values()]
    .filter((entry) => !linked.has(key(entry.type, entry._id)))
    // No menu points at it, so its own rule is the whole of what restricts it —
    // which since this field exists is no longer always "public".
    .filter((entry) =>
      access.canSee({
        audience: audienceOf(entry.visibility),
        state: entry.state,
        targetType: entry.type,
      })
    )
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    root,
    menuId: menu._id,
    orphans,
    hiddenTop,
    homeMissing: !home,
    totalNodes,
  };
}

/**
 * The site menu as a live document, for the actions that write to it.
 *
 * `ensureSiteMenu` first, so a site that has never had one gets it built from
 * its old header links rather than the action failing on nothing to edit.
 */
export async function getSiteMenuDoc() {
  await connectDB();
  await ensureSiteMenu();
  return Menu.findOne({ isSite: true });
}
