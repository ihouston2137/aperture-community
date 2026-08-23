import { VIEW_MEDIA } from "./responsive-style";
import {
  normalizeStyleValues,
  styleValuesToDeclarations,
  type StyleValues,
} from "./style-values";

/**
 * Styling the elements a document is made of.
 *
 * A document's body is generated from markdown, so its parts have no blocks of
 * their own to select — a heading is a heading because the source said so. The
 * content slot therefore carries one style per element kind, and the styles are
 * emitted as CSS scoped to that slot rather than applied inline.
 */

export const DOC_ELEMENTS = [
  "body",
  "h1",
  "h2",
  "h3",
  "h4",
  "paragraph",
  "link",
  "list",
  "codeInline",
  "codeBlock",
  "quote",
  "table",
  "tableHeader",
  "tableCell",
  "divider",
  "image",
  "caption",
] as const;

export type DocElement = (typeof DOC_ELEMENTS)[number];

export const DOC_ELEMENT_LABELS: Record<DocElement, string> = {
  body: "Body container",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4–6",
  paragraph: "Paragraph",
  link: "Link",
  list: "List",
  codeInline: "Inline code",
  codeBlock: "Code block",
  quote: "Quote",
  table: "Table",
  tableHeader: "Table header",
  tableCell: "Table cell",
  divider: "Divider",
  image: "Image",
  caption: "Image caption",
};

/** How the elements group in the inspector, so seventeen do not arrive at once. */
export const DOC_ELEMENT_GROUPS: { label: string; elements: DocElement[] }[] = [
  { label: "Text", elements: ["body", "paragraph", "link", "list", "quote"] },
  { label: "Headings", elements: ["h1", "h2", "h3", "h4"] },
  { label: "Code", elements: ["codeInline", "codeBlock"] },
  { label: "Tables", elements: ["table", "tableHeader", "tableCell"] },
  { label: "Media", elements: ["image", "caption", "divider"] },
];

/** Elements that hold no text of their own, so typography would do nothing. */
export const DOC_BOX_ELEMENTS: readonly DocElement[] = [
  "body",
  "table",
  "divider",
  "image",
];

export type DocElementStyles = Partial<Record<DocElement, StyleValues>>;

export function normalizeDocElementStyles(value: unknown): DocElementStyles {
  const source = (value ?? {}) as Record<string, unknown>;
  const styles: DocElementStyles = {};
  for (const element of DOC_ELEMENTS) {
    if (source[element]) styles[element] = normalizeStyleValues(source[element]);
  }
  return styles;
}

/** Ids come from `makeId`, but old records may hold anything. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function docContentClass(id: string): string {
  return `pb-doc-${safeId(id)}`;
}

/**
 * What each element selects, relative to the content root.
 *
 * An empty selector is the root itself. Headings are matched by `data-level`
 * rather than by tag, so a document that starts at H2 is still styled by the
 * level the author wrote.
 */
const ELEMENT_SELECTORS: Record<DocElement, string[]> = {
  body: [""],
  h1: ['.doc-heading[data-level="1"]'],
  h2: ['.doc-heading[data-level="2"]'],
  h3: ['.doc-heading[data-level="3"]'],
  h4: [
    '.doc-heading[data-level="4"]',
    '.doc-heading[data-level="5"]',
    '.doc-heading[data-level="6"]',
  ],
  paragraph: [".doc-paragraph"],
  link: [".doc-paragraph a", ".doc-list a", ".doc-table a"],
  list: [".doc-list"],
  codeInline: [".doc-paragraph code", ".doc-list code", ".doc-table code"],
  codeBlock: [".doc-code"],
  quote: [".doc-quote"],
  table: [".doc-table"],
  tableHeader: [".doc-table th"],
  tableCell: [".doc-table td"],
  divider: [".doc-divider"],
  // A picture on a line of its own becomes a figure; one written inside a
  // sentence, a list item or a table cell stays a bare `img`. Both are the same
  // element to an author, so the style has to reach both — listed the way
  // `link` and `codeInline` list their inline hosts.
  image: [
    ".doc-figure img",
    ".doc-paragraph img",
    ".doc-list img",
    ".doc-table img",
  ],
  caption: [".doc-figure figcaption"],
};

/**
 * One content slot's element styles, as CSS.
 *
 * Scoped to the slot's own class, so two documents on a page — or a template
 * with more than one body — never dress each other.
 */
export function docElementCss(id: string, styles: DocElementStyles): string {
  const root = `.${docContentClass(id)}`;
  const rules: string[] = [];

  for (const element of DOC_ELEMENTS) {
    const declarations = styleValuesToDeclarations(styles[element]);
    if (!declarations) continue;

    const selector = ELEMENT_SELECTORS[element]
      .map((part) => (part ? `${root} ${part}` : root))
      .join(",\n");
    rules.push(`${selector} {\n${declarations}\n}`);
  }

  return rules.join("\n");
}

/** How a table reflows when it no longer fits. */
export const DOC_TABLE_MODES = ["scroll", "stack"] as const;
export type DocTableMode = (typeof DOC_TABLE_MODES)[number];

export const DOC_TABLE_MODE_LABELS: Record<DocTableMode, string> = {
  scroll: "Scroll sideways",
  stack: "Stack each row as a card",
};

/** How the contents behave on a narrow screen. */
export const DOC_NAV_MODES = ["list", "dropdown"] as const;
export type DocNavMode = (typeof DOC_NAV_MODES)[number];

export const DOC_NAV_MODE_LABELS: Record<DocNavMode, string> = {
  list: "Stay a list",
  dropdown: "Collapse into a dropdown",
};

/**
 * The mobile band, borrowed from the shared breakpoints so a document folds at
 * the same width as everything else on the site.
 */
export const DOC_MOBILE_MEDIA = VIEW_MEDIA.mobile;
