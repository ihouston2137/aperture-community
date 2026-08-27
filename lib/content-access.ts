import type { MenuContentType } from "./menu-types";

/**
 * Who may open the content dashboard, and which of the site they find on it.
 *
 * Three questions, asked in this order.
 *
 * 1. `content.dashboard` — is there a dashboard for you at all.
 * 2. Which content you are trusted with, on two axes that are asked
 *    independently: who it is **for** (public or restricted) and whether it is
 *    **live** (published or draft). A node has one answer on each axis, and
 *    both have to allow you before it is drawn.
 * 3. Whether you may only look or also change it — a separate grant on each
 *    facet, so somebody can be given every draft to read without being given
 *    any of them to rewrite.
 *
 * The two axes are asked separately because they answer different worries. The
 * audience axis is about confidentiality: a members-only section is not for
 * whoever happens to write the news. The state axis is about readiness: a draft
 * is somebody's unfinished thinking, and a live page is the site as the world
 * sees it — being trusted with one is no reason to be trusted with the other.
 *
 * None of this replaces the per-type `*.manage` permissions. Those still say
 * which *kinds* of thing you may edit; these say which *instances*. Editing
 * needs both, and the editors themselves go on enforcing the type permission,
 * so hiding something here is never the only lock on it.
 */

/** Who a piece of content is for. */
export const CONTENT_AUDIENCES = ["public", "protected"] as const;
export type ContentAudience = (typeof CONTENT_AUDIENCES)[number];

/** Whether it is live. */
export const CONTENT_STATES = ["published", "draft"] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

/** One facet of one node, as the permissions name them. */
export type ContentFacet = ContentAudience | ContentState;

export const CONTENT_AUDIENCE_LABELS: Record<ContentAudience, string> = {
  public: "public",
  protected: "restricted",
};

export const CONTENT_STATE_LABELS: Record<ContentState, string> = {
  published: "live",
  draft: "draft",
};

/* ---------------------------------------------------------- Content types */

/**
 * The kinds of content the dashboard knows about, and what each needs.
 *
 * `manage` is the existing per-type permission — unchanged, and still the
 * thing the editors check. The dashboard only ever asks it as well, never
 * instead.
 */
export type ContentTypeMeta = {
  type: MenuContentType;
  label: string;
  /** Lower case, for running text. */
  noun: string;
  manage: string;
  /** The full list in the admin, for everything the canvas leaves out. */
  listHref: string;
};

export const CONTENT_TYPES: ContentTypeMeta[] = [
  {
    type: "page",
    label: "Page",
    noun: "page",
    manage: "pages.manage",
    listHref: "/admin/pages",
  },
  {
    type: "story",
    label: "Story",
    noun: "story",
    manage: "stories.manage",
    listHref: "/admin/stories",
  },
  {
    type: "collection",
    label: "Collection",
    noun: "collection",
    manage: "collections.manage",
    listHref: "/admin/collections",
  },
  {
    type: "documentation",
    label: "Documentation",
    noun: "documentation set",
    manage: "docs.manage",
    listHref: "/admin/docs",
  },
  {
    type: "publication",
    label: "Publication",
    noun: "publication",
    manage: "publications.manage",
    listHref: "/admin/publications",
  },
  {
    type: "form",
    label: "Form",
    noun: "form",
    manage: "forms.manage",
    listHref: "/admin/forms",
  },
];

export function contentTypeMeta(type: MenuContentType): ContentTypeMeta | null {
  return CONTENT_TYPES.find((meta) => meta.type === type) ?? null;
}

/* ------------------------------------------------------------- Resolving */

/** The facets of one thing on the canvas, as the rules need them. */
export type FacetedNode = {
  audience: ContentAudience;
  state: ContentState;
  /** Absent for a group or an external address — neither is a record. */
  targetType?: MenuContentType | null;
};

export type ContentPermissions = {
  /** Reaches the dashboard at all. */
  canView: boolean;
  /** May restructure the navigation by dragging, adding and detaching. */
  canArrange: boolean;
  /** Whether this node is drawn. */
  canSee: (node: FacetedNode) => boolean;
  /** Whether its editor may be opened from here. */
  canEdit: (node: FacetedNode) => boolean;
  /** The kinds of content this person may edit at all. */
  editableTypes: MenuContentType[];
  /** Per facet, for explaining what somebody is missing. */
  sees: Record<ContentFacet, boolean>;
  edits: Record<ContentFacet, boolean>;
};

export function contentPermissions(permissions: string[]): ContentPermissions {
  const held = new Set(permissions);

  /**
   * Being trusted to change something implies being allowed to look at it.
   * The other way round would be a role that can edit what it cannot see,
   * which is not a state anybody means to configure.
   */
  const edits = facetMap((facet) => held.has(`content.${facet}.edit`));
  const sees = facetMap(
    (facet) => held.has(`content.${facet}.view`) || edits[facet]
  );

  const editableTypes = CONTENT_TYPES.filter((meta) => held.has(meta.manage)).map(
    (meta) => meta.type
  );

  const canSee = (node: FacetedNode) => sees[node.audience] && sees[node.state];

  return {
    canView: held.has("content.dashboard"),
    canArrange: held.has("content.navigation"),
    canSee,
    canEdit: (node) => {
      // Both axes have to allow the change, not just the one that happens to
      // be the more permissive.
      if (!canSee(node) || !edits[node.audience] || !edits[node.state]) {
        return false;
      }
      // A group or an external link is navigation, not content; arranging the
      // navigation is what governs those.
      if (!node.targetType) return true;
      return editableTypes.includes(node.targetType);
    },
    editableTypes,
    sees,
    edits,
  };
}

function facetMap(value: (facet: ContentFacet) => boolean): Record<ContentFacet, boolean> {
  return {
    public: value("public"),
    protected: value("protected"),
    published: value("published"),
    draft: value("draft"),
  };
}

/**
 * What somebody is missing, in the words of the permission that would fix it.
 *
 * The dashboard says this rather than showing an empty canvas, because "you
 * have not been given drafts" is actionable and a blank screen is not.
 */
export function missingFacets(access: ContentPermissions): string[] {
  const missing: string[] = [];
  if (!access.sees.public && !access.sees.protected) {
    missing.push("neither public nor restricted content");
  } else if (!access.sees.public) {
    missing.push("public content");
  } else if (!access.sees.protected) {
    missing.push("restricted content");
  }

  if (!access.sees.published && !access.sees.draft) {
    missing.push("neither live content nor drafts");
  } else if (!access.sees.published) {
    missing.push("live content");
  } else if (!access.sees.draft) {
    missing.push("drafts");
  }

  return missing;
}
