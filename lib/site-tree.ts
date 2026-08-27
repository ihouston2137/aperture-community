import type { ContentAudience, ContentState } from "./content-access";
import type { MenuContentType, MenuVisibility } from "./menu-types";

/**
 * The site as a tree, and where each node sits on the canvas.
 *
 * Free of database imports: the canvas is a client component and re-runs the
 * layout every time a node is dragged, so the arithmetic has to be reachable
 * from the browser. The server uses the same functions to draw the first frame,
 * which is what keeps the picture from moving on hydration.
 */

/**
 * What a node is.
 *
 * `home` is the root and there is exactly one. `group` is a menu label — it
 * holds other items and points at nothing itself. `content` points at a record.
 * `url` points off the site, so it has no state to report and no editor.
 */
export type SiteNodeKind = "home" | "group" | "content" | "url";

export type SiteNode = {
  /**
   * The menu item's own id, or `home` for the root. Stable across a save, which
   * is what lets the canvas keep its selection and its scroll through one.
   */
  id: string;
  kind: SiteNodeKind;
  label: string;
  targetType: MenuContentType | null;
  targetId: string;
  /** Where a visitor lands. "" for a group. */
  href: string;
  /**
   * How restricted this node is *once the group above it is taken into account*
   * — which is the question the permission facets ask.
   */
  audience: ContentAudience;
  /**
   * This item's own rule, unnarrowed.
   *
   * Kept apart from `audience` because they answer different questions and the
   * inspector needs both. `audience` is the effective answer, so it collapses
   * "anyone signed in" and "these roles" into one word and inherits from the
   * group above; this is the rule the control actually edits, so it has to come
   * back exactly as it was stored or reopening a node would offer to overwrite
   * its roles with nothing.
   */
  visibility: MenuVisibility;
  /**
   * The rule the *record* carries, as opposed to the one the menu item carries.
   *
   * Two different sentences: "this link is for members" and "this page is for
   * members". `loadContentAccess` applies both, so the inspector offers both
   * rather than making somebody guess which one made a node restricted.
   * `publicVisibility` for a group or an external link, which are not records.
   */
  contentVisibility: MenuVisibility;
  state: ContentState;
  /** The admin editor for this node's content, or "" when there is none. */
  editHref: string;
  /** The quiet second line: the address, the kind, whatever identifies it. */
  meta: string;
  /**
   * A menu item pointing at a record that is no longer published.
   *
   * The live header drops these, so the node is on the canvas but not on the
   * site — which is exactly the thing somebody opens this dashboard to catch.
   */
  danglingLink: boolean;
  /**
   * Whether this viewer may change this node.
   *
   * Resolved on the server and carried, rather than re-derived in the browser:
   * `canEdit` is a closure over a permission set, which cannot cross to a
   * client component, and a second implementation of the rules there would be a
   * second thing to keep true.
   */
  editable: boolean;
  /**
   * How many children were dropped because this viewer may not see them.
   *
   * Reported rather than silently omitted: a tree that quietly loses branches
   * tells you the site is smaller than it is.
   */
  hiddenChildren: number;
  children: SiteNode[];
};

/* ------------------------------------------------------------- Geometry */

/**
 * Node size and spacing, in canvas units. The canvas scales these; nothing
 * downstream should assume pixels.
 */
export const NODE_W = 216;
export const NODE_H = 84;
export const H_GAP = 28;
export const V_GAP = 68;
/** Breathing room around the drawn tree, so a fitted view is not flush. */
export const CANVAS_PAD = 64;

export type PlacedNode = {
  node: SiteNode;
  parentId: string;
  depth: number;
  /** Top-left, in canvas units. */
  x: number;
  y: number;
};

export type Edge = {
  id: string;
  parentId: string;
  childId: string;
  /** Where the line leaves the parent and meets the child, in canvas units. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type Placement = {
  nodes: PlacedNode[];
  edges: Edge[];
  width: number;
  height: number;
};

/**
 * A tidy top-down tree: every parent sits centred over its children, and no two
 * subtrees overlap.
 *
 * Two passes. The first measures how wide each subtree needs to be, bottom-up;
 * the second hands out that width left to right. Done in one pass a parent
 * would have to be placed before its children were measured, which is what
 * produces the crossed edges that make a generated diagram unreadable.
 */
export function layoutTree(root: SiteNode): Placement {
  const widths = new Map<string, number>();

  const measure = (node: SiteNode): number => {
    if (node.children.length === 0) {
      widths.set(node.id, NODE_W);
      return NODE_W;
    }
    const span =
      node.children.reduce((total, child) => total + measure(child), 0) +
      H_GAP * (node.children.length - 1);
    // A parent is never narrower than itself, however few children it has.
    const width = Math.max(NODE_W, span);
    widths.set(node.id, width);
    return width;
  };

  measure(root);

  const nodes: PlacedNode[] = [];
  const edges: Edge[] = [];

  const place = (node: SiteNode, left: number, depth: number, parentId: string) => {
    const width = widths.get(node.id) ?? NODE_W;
    const y = depth * (NODE_H + V_GAP);

    // Children first, so the parent can be centred on where they actually
    // landed rather than on the space they were allotted.
    let cursor = left;
    const childCentres: number[] = [];
    for (const child of node.children) {
      const childWidth = widths.get(child.id) ?? NODE_W;
      place(child, cursor, depth + 1, node.id);
      childCentres.push(cursor + childWidth / 2);
      cursor += childWidth + H_GAP;
    }

    const centre =
      childCentres.length > 0
        ? (childCentres[0] + childCentres[childCentres.length - 1]) / 2
        : left + width / 2;

    const x = centre - NODE_W / 2;
    nodes.push({ node, parentId, depth, x, y });

    for (let i = 0; i < node.children.length; i += 1) {
      const child = node.children[i];
      edges.push({
        id: `${node.id}->${child.id}`,
        parentId: node.id,
        childId: child.id,
        x1: centre,
        y1: y + NODE_H,
        x2: childCentres[i],
        y2: y + NODE_H + V_GAP,
      });
    }
  };

  place(root, 0, 0, "");

  const width = (widths.get(root.id) ?? NODE_W) + CANVAS_PAD * 2;
  const depth = nodes.reduce((deepest, entry) => Math.max(deepest, entry.depth), 0);
  const height = (depth + 1) * NODE_H + depth * V_GAP + CANVAS_PAD * 2;

  // Shifted into the padding in one place, so nothing downstream has to know
  // the padding exists.
  return {
    nodes: nodes.map((entry) => ({
      ...entry,
      x: entry.x + CANVAS_PAD,
      y: entry.y + CANVAS_PAD,
    })),
    edges: edges.map((edge) => ({
      ...edge,
      x1: edge.x1 + CANVAS_PAD,
      y1: edge.y1 + CANVAS_PAD,
      x2: edge.x2 + CANVAS_PAD,
      y2: edge.y2 + CANVAS_PAD,
    })),
    width,
    height,
  };
}

/* ---------------------------------------------------------- Walking it */

export function findNode(root: SiteNode, id: string): SiteNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export function isDescendant(ancestor: SiteNode, id: string): boolean {
  return ancestor.children.some(
    (child) => child.id === id || isDescendant(child, id)
  );
}

export function countNodes(root: SiteNode): number {
  return 1 + root.children.reduce((total, child) => total + countNodes(child), 0);
}

/* ------------------------------------------------------------ Dropping */

export type DropVerdict = { allowed: boolean; reason: string };

/**
 * Whether one node may be dragged under another.
 *
 * The hard limit is the site header itself: it renders **one** level of
 * dropdowns, and `normalizeMenuItems` drops anything deeper on save. Rather
 * than let somebody build a third level that silently disappears, the canvas
 * refuses the drop and says why.
 *
 * Shared by the canvas and the server action on purpose. The canvas uses it to
 * grey out an impossible target; the action uses it because a refusal that
 * lives only in the browser is a suggestion.
 */
export function canDropUnder(
  dragged: SiteNode,
  target: SiteNode
): DropVerdict {
  if (dragged.id === target.id) {
    return { allowed: false, reason: "That is where it already is." };
  }
  if (dragged.kind === "home") {
    return { allowed: false, reason: "The home page is the top of the site." };
  }
  if (isDescendant(dragged, target.id)) {
    return { allowed: false, reason: "That would put a branch inside itself." };
  }

  // The top level takes anything, including a whole group with its items.
  if (target.kind === "home") return { allowed: true, reason: "" };

  if (target.kind !== "group") {
    return {
      allowed: false,
      reason: "Only a group holds other items. Add a group here first.",
    };
  }

  if (dragged.kind === "group") {
    return {
      allowed: false,
      reason: "The site header shows one level of dropdowns, so a group cannot go inside a group.",
    };
  }

  if (dragged.children.length > 0) {
    return {
      allowed: false,
      reason: "This holds items of its own, and they would end up a level too deep.",
    };
  }

  return { allowed: true, reason: "" };
}

/* ------------------------------------------------------------- Rearranging */

/**
 * The tree with one node moved, without touching the original.
 *
 * The canvas applies this the instant a drag lands, so the diagram settles into
 * its new shape while the save is still in flight. The server does the same
 * move against the stored menu and is the one that decides; if it refuses, the
 * canvas puts the old tree back.
 */
export function moveInTree(
  root: SiteNode,
  id: string,
  parentId: string,
  index: number
): SiteNode {
  const moving = findNode(root, id);
  if (!moving || moving.id === root.id) return root;

  const without = (node: SiteNode): SiteNode => ({
    ...node,
    children: node.children
      .filter((child) => child.id !== id)
      .map(without),
  });

  const insert = (node: SiteNode): SiteNode => {
    if (node.id !== parentId) {
      return { ...node, children: node.children.map(insert) };
    }
    const children = [...node.children];
    const at = Math.max(0, Math.min(index, children.length));
    children.splice(at, 0, moving);
    return { ...node, children };
  };

  return insert(without(root));
}

/**
 * Where a node would land among a parent's children, given a point on the
 * canvas.
 *
 * Dropping onto a group is dropping into an ordered list, and the order is the
 * order of the menu — so which side of each sibling the pointer is on has to
 * decide the position, or every drop would append.
 */
export function dropIndexAt(
  parent: SiteNode,
  placed: Map<string, { x: number }>,
  pointerX: number,
  draggedId: string
): number {
  const siblings = parent.children.filter((child) => child.id !== draggedId);
  let index = 0;
  for (const sibling of siblings) {
    const spot = placed.get(sibling.id);
    if (!spot) continue;
    if (pointerX > spot.x + NODE_W / 2) index += 1;
  }
  return index;
}
