import type { DocBlock, DocHeading } from "./doc-layout";

/**
 * The shapes and tree arithmetic of documentation, with no database behind it.
 *
 * Split out from `lib/docs.ts` so that a client component can link to a page or
 * walk a contents tree without dragging Mongoose into the browser bundle.
 *
 * Documentation is a grouping of documents in an order. A *set* is what a reader
 * arrives at — a user guide, an API reference — and it owns the ordering, the
 * navigation and the template. A *document* is one page of one set, and one
 * markdown file. Slugs are unique within a set rather than across the site, so
 * two sets can each have an "Overview", and a page's address never changes when
 * it is moved within its set.
 */

export type DocSetSummary = {
  _id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  description: string;
  order: number;
  templateId: string;
};

export type DocSummary = {
  _id: string;
  documentationId: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  description: string;
  parentId: string;
  order: number;
};

export type DocNode = DocSummary & { children: DocNode[] };

/** One document as the renderers consume it. */
export type DocView = {
  _id: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  description: string;
  category: string;
  tags: string[];
  updatedAt: string;
  content: DocBlock[];
  /** This document's own headings, for an "on this page" rail. */
  headings: DocHeading[];

  /** The set it belongs to — what the navigation is scoped to. */
  set: DocSetSummary;
  /** Root to self within the set, for breadcrumbs. */
  trail: DocSummary[];
  /** Reading-order neighbours, within the set. */
  previous: DocSummary | null;
  next: DocSummary | null;
};

/** A document's address: set, then page. */
export function docHref(setSlug: string, docSlug: string): string {
  return `/docs/${setSlug}/${docSlug}`;
}

/**
 * The tree, from a flat list of one set's pages.
 *
 * A page whose parent is missing — deleted, or unpublished — is lifted to the
 * root rather than dropped, so reorganising can never make one unreachable from
 * the contents.
 */
export function buildDocTree(summaries: DocSummary[]): DocNode[] {
  const nodes = new Map<string, DocNode>();
  for (const summary of summaries) nodes.set(summary._id, { ...summary, children: [] });

  const roots: DocNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && parent._id !== node._id) parent.children.push(node);
    else roots.push(node);
  }

  // A parent cycle would leave every page in it off the tree entirely — each
  // one is somebody's child, so none of them is a root. Anything the walk from
  // the roots cannot reach is lifted, on the same principle as a missing parent.
  const reached = new Set<string>();
  const reach = (list: DocNode[]) => {
    for (const node of list) {
      if (reached.has(node._id)) continue;
      reached.add(node._id);
      reach(node.children);
    }
  };
  reach(roots);

  if (reached.size < nodes.size) {
    for (const node of nodes.values()) {
      if (reached.has(node._id)) continue;
      // Cut it out of the cycle, then lift it and whatever hangs below it.
      const parent = nodes.get(node.parentId);
      if (parent) parent.children = parent.children.filter((child) => child !== node);
      roots.push(node);
      reach([node]);
    }
  }

  const sort = (list: DocNode[]) => {
    list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    for (const node of list) sort(node.children);
  };
  sort(roots);

  return roots;
}

/** The tree in reading order — depth first, which is how a reader moves. */
export function flattenDocTree(tree: DocNode[]): DocSummary[] {
  const flat: DocSummary[] = [];

  const walk = (nodes: DocNode[]) => {
    for (const node of nodes) {
      const { children, ...summary } = node;
      flat.push(summary);
      walk(children);
    }
  };
  walk(tree);

  return flat;
}

/** Root to the given page, inclusive. */
export function docTrail(summaries: DocSummary[], id: string): DocSummary[] {
  const byId = new Map(summaries.map((summary) => [summary._id, summary]));
  const trail: DocSummary[] = [];

  let current = byId.get(id);
  // Bounded by the map size, so a parent cycle cannot spin here.
  const guard = new Set<string>();

  while (current && !guard.has(current._id)) {
    guard.add(current._id);
    trail.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return trail;
}
