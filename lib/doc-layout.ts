import { makeId } from "./page-layout";

/**
 * Documentation content: a list of blocks, one per markdown construct.
 *
 * The vocabulary is chosen so that every CommonMark + GFM block has somewhere
 * to land, because a document has to survive a round trip through a `.md` file
 * unchanged. `html` is the escape hatch that guarantees it: anything the parser
 * does not recognise is kept verbatim rather than dropped.
 *
 * Block structure is explicit; *inline* formatting stays as markdown text
 * inside each block. That split is deliberate — the editor, the outline and the
 * table of contents all need to see structure, while `**bold**` is a short
 * string that round-trips perfectly without a node tree to maintain.
 */

export const DOC_BLOCK_TYPES = [
  "heading",
  "paragraph",
  "list",
  "codeBlock",
  "blockquote",
  "table",
  "thematicBreak",
  "image",
  "html",
] as const;

export type DocBlockType = (typeof DOC_BLOCK_TYPES)[number];

export const DOC_BLOCK_LABELS: Record<DocBlockType, string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  codeBlock: "Code",
  blockquote: "Quote",
  table: "Table",
  thematicBreak: "Divider",
  image: "Image",
  html: "HTML",
};

export const DOC_BLOCK_ICONS: Record<DocBlockType, string> = {
  heading: "Heading",
  paragraph: "Pilcrow",
  list: "ListChecks",
  codeBlock: "Hash",
  blockquote: "Quote",
  table: "Grid3x3",
  thematicBreak: "Menu",
  image: "FileImage",
  html: "Component",
};

/** A column's alignment in a GFM table; `null` is the unset default. */
export type DocTableAlign = "left" | "center" | "right" | null;

export type DocListItem = {
  /** Inline markdown for the item's own line. */
  text: string;
  /**
   * `null` for an ordinary bullet, a boolean for a GFM task item. Kept apart
   * from `false` so an unchecked box and no box at all stay distinguishable.
   */
  checked: boolean | null;
  /** Nested blocks, which is how sub-lists and indented paragraphs are held. */
  children: DocBlock[];
};

export type DocBlock = {
  id: string;
  type: DocBlockType;

  /** `heading`, `paragraph` — inline markdown. */
  text?: string;
  /** `heading` */
  level?: 1 | 2 | 3 | 4 | 5 | 6;

  /** `list` */
  ordered?: boolean;
  /** Where an ordered list starts counting. */
  start?: number;
  items?: DocListItem[];

  /** `codeBlock` */
  language?: string;
  code?: string;

  /** `blockquote` */
  blocks?: DocBlock[];

  /** `table` — the first row is the header. */
  align?: DocTableAlign[];
  rows?: string[][];

  /** `image` — a media library asset, chosen through the media picker. */
  mediaId?: string;
  url?: string;
  alt?: string;
  title?: string;

  /** `html` — kept verbatim so nothing the parser missed is ever lost. */
  html?: string;
};

/* -------------------------------------------------------- Construction */

export function createDocBlock(type: DocBlockType): DocBlock {
  const block: DocBlock = { id: makeId("doc"), type };

  switch (type) {
    case "heading":
      block.level = 2;
      block.text = "";
      break;
    case "paragraph":
      block.text = "";
      break;
    case "list":
      block.ordered = false;
      block.start = 1;
      block.items = [{ text: "", checked: null, children: [] }];
      break;
    case "codeBlock":
      block.language = "";
      block.code = "";
      break;
    case "blockquote":
      block.blocks = [createDocBlock("paragraph")];
      break;
    case "table":
      block.align = [null, null];
      block.rows = [
        ["", ""],
        ["", ""],
      ];
      break;
    case "image":
      block.mediaId = "";
      block.url = "";
      block.alt = "";
      block.title = "";
      break;
    case "html":
      block.html = "";
      break;
  }

  return block;
}

/* --------------------------------------------------------- Normalizing */

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function level(value: unknown): 1 | 2 | 3 | 4 | 5 | 6 {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 6) {
    return parsed as 1 | 2 | 3 | 4 | 5 | 6;
  }
  return 2;
}

function alignValue(value: unknown): DocTableAlign {
  return value === "left" || value === "center" || value === "right" ? value : null;
}

/** Guards against a hand-edited document nesting itself into a stack overflow. */
const MAX_DEPTH = 8;
const MAX_BLOCKS = 2000;

function normalizeItem(value: unknown, depth: number): DocListItem {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    text: str(raw.text),
    checked: typeof raw.checked === "boolean" ? raw.checked : null,
    children: normalizeDocBlocks(raw.children, depth + 1),
  };
}

export function normalizeDocBlock(input: unknown, depth = 0): DocBlock | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const type = raw.type as DocBlockType;
  if (!DOC_BLOCK_TYPES.includes(type)) return null;

  const block: DocBlock = { id: str(raw.id) || makeId("doc"), type };

  switch (type) {
    case "heading":
      block.level = level(raw.level);
      block.text = str(raw.text);
      break;

    case "paragraph":
      block.text = str(raw.text);
      break;

    case "list": {
      block.ordered = Boolean(raw.ordered);
      const start = Number(raw.start);
      block.start = Number.isInteger(start) && start > 0 ? start : 1;
      block.items = Array.isArray(raw.items)
        ? raw.items.slice(0, 500).map((item) => normalizeItem(item, depth))
        : [];
      break;
    }

    case "codeBlock":
      block.language = str(raw.language).trim();
      block.code = str(raw.code);
      break;

    case "blockquote":
      block.blocks = normalizeDocBlocks(raw.blocks, depth + 1);
      break;

    case "table": {
      const rows = Array.isArray(raw.rows)
        ? raw.rows
            .slice(0, 500)
            .map((row) => (Array.isArray(row) ? row.map((cell) => str(cell)) : []))
        : [];

      // Every row is padded to the widest, so a ragged table cannot render a
      // torn grid or serialize to something that will not parse back.
      const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
      block.rows = rows.map((row) => {
        const padded = [...row];
        while (padded.length < width) padded.push("");
        return padded;
      });

      const align = Array.isArray(raw.align) ? raw.align.map(alignValue) : [];
      while (align.length < width) align.push(null);
      block.align = align.slice(0, width);
      break;
    }

    case "thematicBreak":
      break;

    case "image":
      block.mediaId = str(raw.mediaId);
      block.url = str(raw.url);
      block.alt = str(raw.alt);
      block.title = str(raw.title);
      break;

    case "html":
      block.html = str(raw.html);
      break;
  }

  return block;
}

export function normalizeDocBlocks(input: unknown, depth = 0): DocBlock[] {
  if (!Array.isArray(input) || depth > MAX_DEPTH) return [];
  return input
    .slice(0, MAX_BLOCKS)
    .map((block) => normalizeDocBlock(block, depth))
    .filter((block): block is DocBlock => block !== null);
}

/* ------------------------------------------------------------- Outline */

export type DocHeading = {
  id: string;
  level: number;
  text: string;
  /** A url-safe anchor, so a table of contents can link into the page. */
  anchor: string;
};

/** Inline markdown reduced to its words, for headings and anchors. */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .trim();
}

/**
 * Whether a table's first row is a heading row.
 *
 * Markdown has no headerless table — the delimiter row always has something
 * above it — so a table that should not show headings is written with an empty
 * header row, which is the established way of saying so in a `.md` file and
 * survives an export and re-import untouched. Everything that renders a table
 * asks here rather than testing the rows itself, so the reader, the editor and
 * the stacked-card labels cannot disagree about what is a heading.
 */
export function tableHasHeader(block: DocBlock): boolean {
  const header = block.rows?.[0] ?? [];
  return header.some((cell) => cell.trim() !== "");
}

export function headingAnchor(text: string): string {
  return stripInlineMarkdown(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * The headings in a document, in order.
 *
 * Only top-level blocks are walked: a heading inside a quote is part of the
 * quotation rather than part of the document's structure, and listing it would
 * put something in the contents that the page does not present as a section.
 */
export function docHeadings(blocks: DocBlock[]): DocHeading[] {
  const seen = new Map<string, number>();

  return blocks
    .filter((block) => block.type === "heading")
    .map((block) => {
      const text = stripInlineMarkdown(block.text ?? "");
      const base = headingAnchor(block.text ?? "") || "section";

      // Two headings can share wording; the anchor has to stay unique or the
      // contents would send both to the same place.
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);

      return {
        id: block.id,
        level: block.level ?? 2,
        text,
        anchor: count === 0 ? base : `${base}-${count + 1}`,
      };
    });
}
