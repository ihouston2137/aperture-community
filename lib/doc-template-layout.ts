import {
  DOC_NAV_MODES,
  DOC_TABLE_MODES,
  docElementCss,
  normalizeDocElementStyles,
  type DocElementStyles,
  type DocNavMode,
  type DocTableMode,
} from "./doc-style";
import { normalizeBlock, normalizePageLayout, makeId, type PageRow } from "./page-layout";
import { normalizeResponsiveStyle, type ResponsiveStyleFields } from "./responsive-style";
import { normalizeStyleValues, type StyleValues } from "./style-values";

/**
 * Documentation templates are page layouts with extra blocks.
 *
 * The doc blocks are *slots* rather than content: each names a part of the
 * document being rendered. Everything the page builder offers can sit alongside
 * them, so a template can carry its own header, sidebar and containers.
 *
 * Slot types are prefixed with `doc` because a template holds page blocks too,
 * and both vocabularies would otherwise claim `heading`.
 */

export const DOC_TEMPLATE_BLOCK_TYPES = [
  /** The set's own name — what a documentation sidebar is headed with. */
  "docSetTitle",
  "docTitle",
  "docDescription",
  "docUpdated",
  "docTags",
  "docBreadcrumbs",
  /** The documentation tree — the hierarchy, as a table of contents. */
  "docToc",
  /** This document's own headings, for an "on this page" rail. */
  "docOnThisPage",
  "docContent",
  /** Previous and next in the tree's reading order. */
  "docPrevNext",
] as const;

export type DocTemplateBlockType = (typeof DOC_TEMPLATE_BLOCK_TYPES)[number];

export const DOC_SLOT_LABELS: Record<DocTemplateBlockType, string> = {
  docSetTitle: "Documentation title",
  docTitle: "Title",
  docDescription: "Description",
  docUpdated: "Last updated",
  docTags: "Tags",
  docBreadcrumbs: "Breadcrumbs",
  docToc: "Contents (hierarchy)",
  docOnThisPage: "On this page",
  docContent: "Document body",
  docPrevNext: "Previous / next",
};

export const DOC_SLOT_ICONS: Record<DocTemplateBlockType, string> = {
  docSetTitle: "BookOpen",
  docTitle: "Heading",
  docDescription: "Pilcrow",
  docUpdated: "Clock",
  docTags: "Tag",
  docBreadcrumbs: "ChevronRight",
  docToc: "Layers",
  docOnThisPage: "ListChecks",
  docContent: "FileText",
  docPrevNext: "ArrowRight",
};

export type DocTemplateBlock = ResponsiveStyleFields & {
  id: string;
  type: DocTemplateBlockType;
  styleSlug?: string;
  textStyle?: StyleValues;

  /** `docToc` — each link in the contents. */
  linkStyleSlug?: string;
  linkStyle?: StyleValues;
  /** `docToc` — the control the contents fold into on a narrow screen. */
  dropdownStyleSlug?: string;
  dropdownStyle?: StyleValues;
  /** `docToc` — the panel that control opens. */
  panelStyleSlug?: string;
  panelStyle?: StyleValues;
  /** `docPrevNext` — both pagination buttons. */
  buttonStyleSlug?: string;
  buttonStyle?: StyleValues;

  /** `docToc` — how much of the tree to show. 0 means all of it. */
  depth?: number;
  /** `docToc` — only this document's branch, rather than the whole tree. */
  branchOnly?: boolean;
  /** `docOnThisPage` — the deepest heading level to list. */
  maxLevel?: number;
  /** `docUpdated` */
  dateFormat?: "long" | "short" | "year";
  /** Printed before the value, e.g. "Updated". */
  label?: string;

  /** `docContent`: rem of space after each block. 0 uses the default. */
  blockSpacing?: number;
  /**
   * `docContent` — one style per element kind of the document body. The body is
   * generated from markdown, so its parts have no blocks of their own to select.
   */
  elementStyles?: DocElementStyles;
  /** `docContent` — what a table does when it no longer fits. */
  tableMode?: DocTableMode;
  /** `docToc` — what the contents do on a narrow screen. */
  navMode?: DocNavMode;
};

/** Style slots a doc slot can carry for the parts inside it. */
export const DOC_PART_SLOTS = [
  "linkStyle",
  "dropdownStyle",
  "panelStyle",
  "buttonStyle",
] as const;

export type DocPartSlot = (typeof DOC_PART_SLOTS)[number];

export function isDocTemplateBlock(block: { type: string }): block is DocTemplateBlock {
  return (DOC_TEMPLATE_BLOCK_TYPES as readonly string[]).includes(block.type);
}

export function createDocTemplateBlock(type: DocTemplateBlockType): DocTemplateBlock {
  const block: DocTemplateBlock = { id: makeId("docslot"), type };

  if (type === "docToc") {
    block.depth = 0;
    block.branchOnly = false;
    // A sidebar is most of a phone's width, so it folds away by default.
    block.navMode = "dropdown";
  }
  if (type === "docContent") {
    block.elementStyles = {};
    block.tableMode = "stack";
  }
  if (type === "docOnThisPage") {
    block.maxLevel = 3;
    block.label = "On this page";
  }
  if (type === "docUpdated") {
    block.dateFormat = "long";
    block.label = "Updated";
  }
  return block;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function intOr(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

export function normalizeDocTemplateBlock(input: unknown): DocTemplateBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as DocTemplateBlockType;
  if (!DOC_TEMPLATE_BLOCK_TYPES.includes(type)) return null;

  const block: DocTemplateBlock = { id: str(raw.id) || makeId("docslot"), type };

  if (raw.styleSlug) block.styleSlug = str(raw.styleSlug);
  if (raw.textStyle) block.textStyle = normalizeStyleValues(raw.textStyle);
  normalizeResponsiveStyle(raw, block, "textStyle");

  // The slots a doc block dresses inside itself. Read here, beside the fields
  // they fill, so a part cannot be styled in the inspector and then lost on the
  // save — the failure that looks fine until the page reloads.
  for (const slot of DOC_PART_SLOTS) {
    const slugKey = `${slot}Slug` as const;
    if (raw[slugKey]) block[slugKey] = str(raw[slugKey]);
    if (raw[slot]) block[slot] = normalizeStyleValues(raw[slot]);
    normalizeResponsiveStyle(raw, block, slot);
  }

  block.label = str(raw.label);

  if (type === "docToc") {
    block.depth = intOr(raw.depth, 0, 0, 6);
    block.branchOnly = Boolean(raw.branchOnly);
  }
  if (type === "docOnThisPage") block.maxLevel = intOr(raw.maxLevel, 3, 1, 6);
  if (type === "docUpdated") {
    block.dateFormat = (["long", "short", "year"] as const).includes(
      raw.dateFormat as "long"
    )
      ? (raw.dateFormat as DocTemplateBlock["dateFormat"])
      : "long";
  }
  if (type === "docToc") {
    block.navMode = DOC_NAV_MODES.includes(raw.navMode as DocNavMode)
      ? (raw.navMode as DocNavMode)
      : "dropdown";
  }

  if (type === "docContent") {
    block.blockSpacing = intOr(raw.blockSpacing, 0, 0, 8);
    block.elementStyles = normalizeDocElementStyles(raw.elementStyles);
    block.tableMode = DOC_TABLE_MODES.includes(raw.tableMode as DocTableMode)
      ? (raw.tableMode as DocTableMode)
      : "stack";
  }

  return block;
}

/**
 * Doc slots keep their own normalizer; anything else falls through to the page
 * builder's, so both vocabularies survive a save unchanged.
 */
export function normalizeDocTemplateBlocks(input: unknown): unknown[] {
  if (!Array.isArray(input)) return [];

  return input
    .slice(0, 100)
    .map((raw) => {
      const type = str((raw as Record<string, unknown>)?.type);
      if ((DOC_TEMPLATE_BLOCK_TYPES as readonly string[]).includes(type)) {
        return normalizeDocTemplateBlock(raw);
      }
      // Threaded so a container nested here keeps accepting doc slots.
      return normalizeBlock(raw, normalizeDocTemplateBlocks as never);
    })
    .filter((block): block is NonNullable<typeof block> => block !== null);
}

export function normalizeDocTemplateLayout(input: unknown): PageRow[] {
  return normalizePageLayout(input, normalizeDocTemplateBlocks as never);
}

/**
 * The layout a document gets when it has no template and no default exists.
 *
 * Built here rather than in the renderer, so a templated and an untemplated
 * document travel exactly the same rendering path.
 */
export function defaultDocTemplateLayout(): PageRow[] {
  return normalizeDocTemplateLayout([
    {
      id: "row-doc",
      settings: {
        contentWidth: "contained",
        // Wide enough to carry two rails either side of a comfortable measure,
        // which is what keeps the prose at a readable width on a large screen
        // rather than letting it run the width of the window.
        maxWidth: 88,
        paddingTop: 2.5,
        paddingBottom: 4,
      },
      columns: [
        // Contents on the left, the page in the middle, its own headings on the
        // right — the arrangement reference documentation has settled on. Both
        // rails stick; both fold away on a phone, where the contents become a
        // dropdown rather than a wall of links above the reading.
        {
          id: "col-doc-nav",
          span: 3,
          settings: { paddingRight: 1.5 },
          blocks: [
            { id: "b-settitle", type: "docSetTitle" },
            { id: "b-toc", type: "docToc", navMode: "dropdown" },
          ],
        },
        {
          id: "col-doc-body",
          span: 6,
          settings: { paddingLeft: 0.5, paddingRight: 1.5 },
          blocks: [
            { id: "b-crumbs", type: "docBreadcrumbs" },
            { id: "b-title", type: "docTitle" },
            { id: "b-desc", type: "docDescription" },
            { id: "b-content", type: "docContent", tableMode: "stack" },
            // Pagination closes the page, which is where a reader looks once
            // they have finished reading it.
            { id: "b-prevnext", type: "docPrevNext" },
          ],
        },
        {
          id: "col-doc-rail",
          span: 3,
          blocks: [
            {
              id: "b-onpage",
              type: "docOnThisPage",
              label: "On this page",
              maxLevel: 3,
            },
          ],
        },
      ],
    },
  ]);
}

/**
 * Every content slot's element styles in a template, as one sheet.
 *
 * Element styles hang off a `docContent` slot rather than off the layout, so
 * `layoutResponsiveCss` cannot reach them and the sheet has to be gathered
 * separately. Gathered here rather than in the renderer because the builder
 * canvas needs exactly the same sheet: a template being edited that emitted no
 * element CSS would show none of the body styling until it was published,
 * which is the whole point of a live preview.
 */
export function collectDocElementCss(layout: PageRow[]): string {
  const parts: string[] = [];

  const visit = (blocks: unknown[]) => {
    for (const entry of blocks) {
      const block = entry as DocTemplateBlock & {
        container?: { cells?: { blocks?: unknown[] }[] };
      };

      if (block.type === "docContent" && block.elementStyles) {
        const css = docElementCss(block.id, block.elementStyles);
        if (css) parts.push(css);
      }

      // A content slot can sit inside a container, so the walk has to go down.
      for (const cell of block.container?.cells ?? []) visit(cell.blocks ?? []);
    }
  };

  for (const row of layout) {
    for (const column of row.columns) visit(column.blocks);
  }

  return parts.join("\n");
}
