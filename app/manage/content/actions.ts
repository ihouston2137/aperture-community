"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserAccess } from "@/lib/access";
import {
  contentPermissions,
  type ContentAudience,
  type ContentPermissions,
} from "@/lib/content-access";
import { connectDB } from "@/lib/db";
import {
  MENU_CONTENT_TYPES,
  MAX_MENU_DEPTH,
  blankMenuItem,
  normalizeMenuItems,
  normalizeVisibility,
  type MenuContentType,
  type MenuItem,
  type MenuVisibilityMode,
} from "@/lib/menus";
import {
  Collection,
  Documentation,
  FormDefinition,
  SitePage,
  Story,
  Zine,
} from "@/lib/models";
import { requireSession } from "@/lib/session";
import { loadContentCatalogue, getSiteMenuDoc, loadSiteMap } from "@/lib/site-map";
import { canDropUnder, depthOf, findNode, type SiteNode } from "@/lib/site-tree";
import { PUBLICATION_KINDS, type PublicationKind } from "@/lib/publication-layout";
import { slugify, uniqueSlug } from "@/lib/slug";

export type CanvasResult = { ok: boolean; error?: string };

/**
 * Every change the canvas can make, applied to the site header menu.
 *
 * Two things hold throughout.
 *
 * The client never sends a tree. It sends one instruction — move this item
 * under that one, detach this item — and the server applies it to the stored
 * menu. That matters because the canvas is filtered: a viewer who may not see a
 * members-only branch is still holding a menu that contains it, and letting
 * them post back "here is the new tree" would delete everything their
 * permissions hid from them.
 *
 * Nothing is trusted from the browser. The same `canDropUnder` the canvas uses
 * to grey out an impossible target is re-run here, because a refusal that lives
 * only in the browser is a suggestion.
 */

async function guard(): Promise<ContentPermissions> {
  const session = await requireSession();
  const { permissions } = await getUserAccess(session.userId);
  const access = contentPermissions(permissions);
  if (!access.canView) redirect("/dashboard");
  await connectDB();
  return access;
}

function revalidate() {
  revalidatePath("/manage/content");
  revalidatePath("/admin/menus");
  // The header carries the site menu, and any page may carry a menu block.
  revalidatePath("/", "layout");
}

/* ------------------------------------------------------- Menu arithmetic */

type Located = { list: MenuItem[]; item: MenuItem; parentId: string; index: number };

/**
 * Where an item sits, at any depth.
 *
 * Hands back the list it lives in as well as its index, so a caller does not
 * have to find the parent a second time to change it. Written recursively
 * because the menu is now two levels deep and a hand-unrolled two-level search
 * is a third level waiting to be forgotten.
 */
function locate(items: MenuItem[], id: string, parentId = "home"): Located | null {
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].id === id) return { list: items, item: items[i], parentId, index: i };
    const found = locate(items[i].children, id, items[i].id);
    if (found) return found;
  }
  return null;
}

/** Removes an item wherever it sits, and hands it back. */
function detach(items: MenuItem[], id: string): MenuItem | null {
  const found = locate(items, id);
  if (!found) return null;
  found.list.splice(found.index, 1);
  return found.item;
}

/** Puts an item under a parent, at an index or at the end. */
function insertUnder(
  items: MenuItem[],
  parentId: string,
  item: MenuItem,
  index?: number
): boolean {
  if (parentId === "home") {
    const at = clamp(index, items.length);
    items.splice(at, 0, item);
    return true;
  }

  // At any depth: the parent may itself be inside a group now.
  const parent = locate(items, parentId)?.item;
  if (!parent) return false;
  const at = clamp(index, parent.children.length);
  parent.children.splice(at, 0, item);
  return true;
}

/** How far down an item sits: 0 at the top level, 1 inside a group. */
function depthOfList(items: MenuItem[], id: string, depth = 0): number {
  for (const item of items) {
    if (item.id === id) return depth;
    const found = depthOfList(item.children, id, depth + 1);
    if (found >= 0) return found;
  }
  return -1;
}

function clamp(index: number | undefined, length: number): number {
  if (index === undefined || !Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}

/**
 * Loads the menu, hands its items to a change, and saves the result.
 *
 * `normalizeMenuItems` on the way back in as well as on the way out, so nothing
 * this file builds can store a shape the renderers do not expect.
 */
async function editMenu(
  change: (items: MenuItem[]) => CanvasResult
): Promise<CanvasResult> {
  const menu = await getSiteMenuDoc();
  if (!menu) return { ok: false, error: "The site menu could not be opened." };

  const items = normalizeMenuItems(menu.items);
  const outcome = change(items);
  if (!outcome.ok) return outcome;

  menu.items = normalizeMenuItems(items);
  await menu.save();
  revalidate();
  return { ok: true };
}

/* ------------------------------------------------------------- The checks */

/** Arranging the navigation is its own grant, asked before any structural change. */
function mayArrange(access: ContentPermissions): CanvasResult | null {
  return access.canArrange
    ? null
    : { ok: false, error: "You have not been given the site navigation to change." };
}

/**
 * Whether this person may take responsibility for a node.
 *
 * Moving something is changing it, so it asks the same question the editor
 * would: both facets have to allow the change, and for a record so must that
 * kind's own permission.
 */
function mayChange(access: ContentPermissions, node: SiteNode | null): CanvasResult | null {
  if (!node) return { ok: false, error: "That is no longer on the canvas." };
  if (!access.canEdit(node)) {
    return { ok: false, error: `You may look at “${node.label}” but not change it.` };
  }
  return null;
}

/* ----------------------------------------------------------- The actions */

/** Drag one node under another. The instruction, not the resulting tree. */
export async function moveNodeAction(
  itemId: string,
  parentId: string,
  index: number
): Promise<CanvasResult> {
  const access = await guard();
  const blocked = mayArrange(access);
  if (blocked) return blocked;

  const map = await loadSiteMap(access);
  const dragged = findNode(map.root, itemId);
  const target = findNode(map.root, parentId);

  const cannotMove = mayChange(access, dragged);
  if (cannotMove) return cannotMove;
  if (!target) return { ok: false, error: "That is no longer on the canvas." };

  // The home node is the top level rather than a menu item, so it is the one
  // parent nobody needs permission over — dropping there is dropping onto the
  // site itself.
  if (target.kind !== "home") {
    const cannotAccept = mayChange(access, target);
    if (cannotAccept) return cannotAccept;
  }

  const verdict = canDropUnder(dragged!, target, depthOf(map.root, target.id));
  if (!verdict.allowed) return { ok: false, error: verdict.reason };

  return editMenu((items) => {
    const item = detach(items, itemId);
    if (!item) return { ok: false, error: "That item has already gone." };
    if (!insertUnder(items, parentId, item, index)) {
      // Put it back rather than lose it to a parent that vanished mid-flight.
      items.push(item);
      return { ok: false, error: "That group has already gone." };
    }
    return { ok: true };
  });
}

/** A new dropdown, ready to have items dragged into it. */
export async function addGroupAction(
  parentId: string,
  label: string
): Promise<CanvasResult> {
  const access = await guard();
  const blocked = mayArrange(access);
  if (blocked) return blocked;

  const name = label.trim();
  if (!name) return { ok: false, error: "Give the group a name." };

  return editMenu((items) => {
    if (parentId !== "home") {
      const parent = locate(items, parentId);
      if (!parent) return { ok: false, error: "That group has already gone." };
      if (parent.item.kind !== "label") {
        return { ok: false, error: "Only a group holds other items." };
      }
      // Depth is counted from the top: a group at depth 1 may hold links, but
      // a group inside it would be depth 2, which is past what a menu shows.
      if (depthOfList(items, parentId) + 1 >= MAX_MENU_DEPTH) {
        return {
          ok: false,
          error: `A menu goes ${MAX_MENU_DEPTH} groups deep, and this is already the last one.`,
        };
      }
    }

    const item = blankMenuItem("label");
    item.label = name.slice(0, 120);
    if (!insertUnder(items, parentId, item)) {
      return { ok: false, error: "That group has already gone." };
    }
    return { ok: true };
  });
}

/** Put a record that already exists into the navigation. */
export async function linkContentAction(
  parentId: string,
  targetType: string,
  targetId: string,
  label: string
): Promise<CanvasResult> {
  const access = await guard();
  const blocked = mayArrange(access);
  if (blocked) return blocked;

  if (!MENU_CONTENT_TYPES.includes(targetType as MenuContentType)) {
    return { ok: false, error: "That is not a kind of content that can be linked." };
  }
  const type = targetType as MenuContentType;
  if (!access.editableTypes.includes(type)) {
    return { ok: false, error: "You have not been given that kind of content." };
  }

  const map = await loadSiteMap(access);
  if (parentId !== "home") {
    const target = findNode(map.root, parentId);
    const cannotAccept = mayChange(access, target);
    if (cannotAccept) return cannotAccept;
    if (target!.kind !== "group") {
      return { ok: false, error: "Only a group holds other items." };
    }
  }

  const entry = map.orphans.find(
    (candidate) => candidate.type === type && candidate._id === targetId
  );
  // Only content the map already showed them: it has been through the same
  // facet checks, and anything else they were not meant to know exists.
  if (!entry) {
    return { ok: false, error: "That is not something you can add from here." };
  }

  // Adding a record is taking responsibility for it in its own state, so the
  // state facet is asked as well as the type.
  const mayChangeIt = access.canEdit({
    audience: "public",
    state: entry.state,
    targetType: type,
  });
  if (!mayChangeIt) {
    return { ok: false, error: `You may look at ${entry.label} but not change it.` };
  }

  return editMenu((items) => {
    const item = blankMenuItem("link");
    item.label = (label.trim() || entry.label).slice(0, 120);
    item.targetType = type;
    item.targetId = entry._id;
    // Resolved from the record on every read, so this is only a starting value.
    item.href = entry.href;
    if (!insertUnder(items, parentId, item)) {
      return { ok: false, error: "That group has already gone." };
    }
    return { ok: true };
  });
}

/** Start a new page and put it in the navigation in one move. */
export async function createPageAction(
  parentId: string,
  title: string
): Promise<CanvasResult> {
  const access = await guard();
  const blocked = mayArrange(access);
  if (blocked) return blocked;

  const name = title.trim();
  if (!name) return { ok: false, error: "Give the page a title." };
  if (!access.editableTypes.includes("page")) {
    return { ok: false, error: "You have not been given pages to manage." };
  }
  // It is created as a draft, so drafts are what this needs.
  if (!access.edits.draft) {
    return { ok: false, error: "You have not been given drafts to change." };
  }

  const map = await loadSiteMap(access);
  if (parentId !== "home") {
    const target = findNode(map.root, parentId);
    const cannotAccept = mayChange(access, target);
    if (cannotAccept) return cannotAccept;
    if (target!.kind !== "group") {
      return { ok: false, error: "Only a group holds other items." };
    }
  }

  const slug = await uniqueSlug(SitePage, slugify(name), name);
  const created = await SitePage.create({
    title: name.slice(0, 200),
    slug,
    // Never live on creation: a page put into the navigation from a diagram has
    // nothing on it yet, and the live header drops a draft target anyway.
    status: "draft",
    isHome: false,
    layout: [],
  });

  const outcome = await editMenu((items) => {
    const item = blankMenuItem("link");
    item.label = name.slice(0, 120);
    item.targetType = "page";
    item.targetId = String(created._id);
    item.href = `/${slug}`;
    if (!insertUnder(items, parentId, item)) {
      return { ok: false, error: "That group has already gone." };
    }
    return { ok: true };
  });

  // The page was made but could not be placed; it is still a real page, so it
  // is left alone and turns up under "not in the site navigation".
  return outcome;
}

/** Take a node out of the navigation. The content itself is untouched. */
export async function detachNodeAction(itemId: string): Promise<CanvasResult> {
  const access = await guard();
  const blocked = mayArrange(access);
  if (blocked) return blocked;

  const map = await loadSiteMap(access);
  const node = findNode(map.root, itemId);
  const cannotChange = mayChange(access, node);
  if (cannotChange) return cannotChange;

  if (node!.children.length > 0) {
    return {
      ok: false,
      error: "Move what is inside this group out first, so nothing is taken with it.",
    };
  }

  return editMenu((items) => {
    const item = detach(items, itemId);
    return item
      ? { ok: true }
      : { ok: false, error: "That item has already gone." };
  });
}

/**
 * Who a branch is for.
 *
 * This is the public/protected line itself, so it asks for the facet on both
 * sides: opening something up needs the public grant, and closing it needs the
 * restricted one. Otherwise somebody trusted only with public content could
 * quietly take a members-only section public.
 */
export async function setVisibilityAction(
  itemId: string,
  mode: string,
  roleIds: string[]
): Promise<CanvasResult> {
  const access = await guard();
  const blocked = mayArrange(access);
  if (blocked) return blocked;

  const map = await loadSiteMap(access);
  const node = findNode(map.root, itemId);
  const cannotChange = mayChange(access, node);
  if (cannotChange) return cannotChange;

  const visibility = normalizeVisibility({
    mode: mode as MenuVisibilityMode,
    roleIds,
  });
  const becomes = visibility.mode === "public" ? "public" : "protected";

  if (!access.edits[becomes]) {
    return {
      ok: false,
      error:
        becomes === "public"
          ? "You have not been given public content to change."
          : "You have not been given restricted content to change.",
    };
  }

  return editMenu((items) => {
    const found = locate(items, itemId);
    if (!found) return { ok: false, error: "That item has already gone." };
    found.item.visibility = visibility;
    return { ok: true };
  });
}

/* -------------------------------------------------- Content in its own right */

/**
 * The five kinds, and what it takes to make a blank one.
 *
 * Each is created in whatever that kind calls "not live yet", so making
 * something from this dashboard never puts it on the site by accident. A
 * collection has no status field — being private *is* its draft state.
 */
const BLANKS: Record<
  MenuContentType,
  { model: any; blank: (title: string, slug: string, kind: string) => Record<string, unknown> }
> = {
  page: {
    model: SitePage,
    blank: (title, slug) => ({ title, slug, status: "draft", isHome: false, layout: [] }),
  },
  story: {
    model: Story,
    blank: (title, slug) => ({ headline: title, slug, status: "draft" }),
  },
  collection: {
    model: Collection,
    blank: (title, slug) => ({ name: title, slug, isPublic: false }),
  },
  documentation: {
    model: Documentation,
    blank: (title, slug) => ({ title, slug, status: "draft" }),
  },
  form: {
    model: FormDefinition,
    blank: (title, slug) => ({ title, slug, status: "draft", layout: [] }),
  },
  publication: {
    model: Zine,
    blank: (title, slug, kind) => ({
      title,
      slug,
      // A publication's shape is chosen up front and cannot be changed later
      // without redoing its pages, so the kind comes from the form.
      kind: PUBLICATION_KINDS.includes(kind as PublicationKind) ? kind : "zine",
      status: "draft",
      isTemplate: false,
    }),
  },
};

/**
 * Start something new without putting it in the navigation.
 *
 * The counterpart to `createPageAction`, which makes a page *and* a menu item.
 * Plenty of content is never in the header — a story, a collection linked from
 * inside a page — and having to add it to the navigation just to create it
 * would be the dashboard dictating the site's shape.
 */
export async function createContentAction(
  targetType: string,
  title: string,
  kind: string
): Promise<CanvasResult> {
  const access = await guard();

  if (!MENU_CONTENT_TYPES.includes(targetType as MenuContentType)) {
    return { ok: false, error: "That is not a kind of content that can be made here." };
  }
  const type = targetType as MenuContentType;

  const name = title.trim();
  if (!name) return { ok: false, error: "Give it a title." };
  if (!access.editableTypes.includes(type)) {
    return { ok: false, error: "You have not been given that kind of content." };
  }
  // It arrives not-live, so that is the facet it asks for.
  if (!access.edits.draft) {
    return { ok: false, error: "You have not been given drafts to change." };
  }

  const recipe = BLANKS[type];
  const slug = await uniqueSlug(recipe.model, slugify(name), name);
  await recipe.model.create(recipe.blank(name.slice(0, 200), slug, kind));

  revalidate();
  return { ok: true };
}

/**
 * Who may see one record, as opposed to who may see a link to it.
 *
 * Asked of the record rather than of a menu, so it works for the great majority
 * of content that no menu mentions — which before this had no way to be
 * anything but public.
 */
export async function setContentVisibilityAction(
  targetType: string,
  targetId: string,
  mode: string,
  roleIds: string[]
): Promise<CanvasResult> {
  const access = await guard();

  if (!MENU_CONTENT_TYPES.includes(targetType as MenuContentType)) {
    return { ok: false, error: "That is not a kind of content that can be restricted." };
  }
  const type = targetType as MenuContentType;
  if (!access.editableTypes.includes(type)) {
    return { ok: false, error: "You have not been given that kind of content." };
  }

  const catalogue = await loadContentCatalogue();
  const entry = catalogue.get(`${type}:${targetId}`);
  if (!entry) return { ok: false, error: "That no longer exists." };

  const visibility = normalizeVisibility({ mode: mode as MenuVisibilityMode, roleIds });
  const was: ContentAudience = entry.visibility.mode === "public" ? "public" : "protected";
  const becomes: ContentAudience = visibility.mode === "public" ? "public" : "protected";

  // Both ends of the change are asked for: opening something up needs the
  // public grant and closing it needs the restricted one, so somebody trusted
  // with only one side cannot walk content across the line.
  for (const facet of new Set([was, becomes])) {
    if (!access.edits[facet]) {
      return {
        ok: false,
        error:
          facet === "public"
            ? "You have not been given public content to change."
            : "You have not been given restricted content to change.",
      };
    }
  }
  if (!access.canEdit({ audience: was, state: entry.state, targetType: type })) {
    return { ok: false, error: `You may look at ${entry.label} but not change it.` };
  }

  await BLANKS[type].model.findByIdAndUpdate(targetId, { visibility });

  revalidate();
  return { ok: true };
}
