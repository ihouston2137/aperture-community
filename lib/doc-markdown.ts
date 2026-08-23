import {
  normalizeDocBlocks,
  type DocBlock,
  type DocListItem,
  type DocTableAlign,
} from "./doc-layout";
import { makeId } from "./page-layout";

/**
 * Markdown in, markdown out.
 *
 * Hand-written rather than built on remark, so the app takes no new
 * dependencies. The trade is explicit: this covers CommonMark's block
 * constructs plus GFM tables and task items, and anything it does not
 * recognise is kept verbatim as an `html` block rather than guessed at. That is
 * what keeps a round trip lossless even where it is not *understood* — an
 * unparsed line comes back out exactly as it went in.
 *
 * Inline markup is never parsed. It travels as text, so emphasis, links, code
 * spans and anything else inside a line survive untouched by construction.
 */

/* ------------------------------------------------------------ Front matter */

export type FrontMatter = Record<string, string>;

export type ParsedDocument = {
  frontMatter: FrontMatter;
  blocks: DocBlock[];
};

/**
 * A deliberately small YAML reader: `key: value` pairs only.
 *
 * Documentation front matter is a flat block of scalars in practice, and a
 * partial YAML implementation that silently mangles nested structures would be
 * worse than one that plainly does not accept them. Anything that is not a
 * scalar pair is left in `frontMatter` untouched under its raw key, so export
 * can put the file back the way it was found.
 */
function parseFrontMatter(source: string): { frontMatter: FrontMatter; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { frontMatter: {}, body: source };

  const frontMatter: FrontMatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;

    let value = pair[2].trim();
    // Quotes are the file's, not the value's.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    frontMatter[pair[1]] = value;
  }

  return { frontMatter, body: source.slice(match[0].length) };
}

function serializeFrontMatter(frontMatter: FrontMatter): string {
  const keys = Object.keys(frontMatter).filter((key) => frontMatter[key] !== "");
  if (keys.length === 0) return "";

  const lines = keys.map((key) => {
    const value = frontMatter[key];
    // Quote anything that would otherwise change meaning as bare YAML.
    const needsQuotes = /^[\s]|[\s]$|[:#]|^$/.test(value);
    return `${key}: ${needsQuotes ? JSON.stringify(value) : value}`;
  });

  return `---\n${lines.join("\n")}\n---\n\n`;
}

/* ---------------------------------------------------------------- Parsing */

const THEMATIC_BREAK = /^ {0,3}((\*[ \t]*){3,}|(-[ \t]*){3,}|(_[ \t]*){3,})$/;
const ATX_HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE = /^ {0,3}(```+|~~~+)[ \t]*(\S*)[ \t]*$/;
const BLOCKQUOTE = /^ {0,3}> ?(.*)$/;
const LIST_ITEM = /^([ \t]*)([-*+]|(\d{1,9})[.)])[ \t]+(.*)$/;
const TASK_MARK = /^\[([ xX])\][ \t]+(.*)$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-{1,}:?[ \t]*(\|[ \t]*:?-{1,}:?[ \t]*)*\|?[ \t]*$/;
const STANDALONE_IMAGE = /^!\[([^\]]*)\]\(([^\s)]+)(?:[ \t]+"([^"]*)")?\)$/;
const HTML_START = /^ {0,3}</;

function block(type: DocBlock["type"], rest: Partial<DocBlock> = {}): DocBlock {
  return { id: makeId("doc"), type, ...rest };
}

/** How far a line is indented, counting a tab as four columns. */
function indentOf(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === " ") width += 1;
    else if (char === "\t") width += 4;
    else break;
  }
  return width;
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function parseAlignments(line: string): DocTableAlign[] {
  return splitTableRow(line).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return null;
  });
}

export function parseMarkdownBlocks(source: string): DocBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: DocBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    // --- Fenced code. Taken first: anything inside a fence is literal.
    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1][0].repeat(3);
      const code: string[] = [];
      index += 1;

      while (index < lines.length && !lines[index].trim().startsWith(marker)) {
        code.push(lines[index]);
        index += 1;
      }
      // Step past the closing fence; an unclosed one simply ends at the file.
      if (index < lines.length) index += 1;

      blocks.push(block("codeBlock", { language: fence[2], code: code.join("\n") }));
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push(block("thematicBreak"));
      index += 1;
      continue;
    }

    const heading = ATX_HEADING.exec(line);
    if (heading) {
      blocks.push(
        block("heading", {
          level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
          text: heading[2].trim(),
        })
      );
      index += 1;
      continue;
    }

    // --- Blockquote: gather the run, strip one level, parse what is left.
    if (BLOCKQUOTE.test(line)) {
      const inner: string[] = [];
      while (index < lines.length && lines[index].trim() !== "") {
        const quoted = BLOCKQUOTE.exec(lines[index]);
        // A lazy continuation line belongs to the quote's last paragraph.
        inner.push(quoted ? quoted[1] : lines[index]);
        index += 1;
      }
      blocks.push(block("blockquote", { blocks: parseMarkdownBlocks(inner.join("\n")) }));
      continue;
    }

    // --- Table: a header row only counts if a delimiter row follows it.
    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      TABLE_DELIMITER.test(lines[index + 1]) &&
      lines[index + 1].includes("-")
    ) {
      const align = parseAlignments(lines[index + 1]);
      const rows: string[][] = [splitTableRow(line)];
      index += 2;

      while (index < lines.length && lines[index].trim() !== "" && lines[index].includes("|")) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }

      blocks.push(block("table", { align, rows }));
      continue;
    }

    // --- List: consumed whole, so nesting is resolved in one place.
    if (LIST_ITEM.test(line)) {
      const [list, next] = parseList(lines, index);
      blocks.push(list);
      index = next;
      continue;
    }

    // --- A picture on its own line is a block, not a paragraph of one image.
    const image = STANDALONE_IMAGE.exec(line.trim());
    if (image) {
      blocks.push(
        block("image", {
          mediaId: "",
          url: image[2],
          alt: image[1],
          title: image[3] ?? "",
        })
      );
      index += 1;
      continue;
    }

    // --- Raw HTML, kept verbatim rather than guessed at.
    if (HTML_START.test(line)) {
      const html: string[] = [];
      while (index < lines.length && lines[index].trim() !== "") {
        html.push(lines[index]);
        index += 1;
      }
      blocks.push(block("html", { html: html.join("\n") }));
      continue;
    }

    // --- Paragraph: everything up to the next blank line or block opener.
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() !== "") {
      const current = lines[index];
      if (
        paragraph.length > 0 &&
        (ATX_HEADING.test(current) ||
          FENCE.test(current) ||
          THEMATIC_BREAK.test(current) ||
          BLOCKQUOTE.test(current) ||
          LIST_ITEM.test(current))
      ) {
        break;
      }
      paragraph.push(current.trim());
      index += 1;
    }

    blocks.push(block("paragraph", { text: paragraph.join("\n") }));
  }

  return blocks;
}

/**
 * One list, including everything nested under it.
 *
 * Items are grouped by indentation: a line indented past the first item's
 * content column belongs to that item, and is parsed as its own document so a
 * sub-list, a paragraph or a code block can all sit inside a bullet.
 */
function parseList(lines: string[], start: number): [DocBlock, number] {
  const first = LIST_ITEM.exec(lines[start]);
  if (!first) return [block("paragraph", { text: lines[start] }), start + 1];

  const baseIndent = indentOf(lines[start]);
  const ordered = Boolean(first[3]);
  const items: DocListItem[] = [];

  let index = start;
  let current: { text: string; checked: boolean | null; nested: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    items.push({
      text: current.text,
      checked: current.checked,
      children: current.nested.length > 0 ? parseMarkdownBlocks(current.nested.join("\n")) : [],
    });
    current = null;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim() === "") {
      // A blank line inside a list is only a break if the list does not resume.
      const following = lines[index + 1];
      if (following === undefined || (following.trim() !== "" && indentOf(following) <= baseIndent && !LIST_ITEM.test(following))) {
        break;
      }
      if (current) current.nested.push("");
      index += 1;
      continue;
    }

    const item = LIST_ITEM.exec(line);
    const indent = indentOf(line);

    if (item && indent <= baseIndent) {
      // A different marker kind starts a different list.
      if (Boolean(item[3]) !== ordered) break;

      flush();
      const task = TASK_MARK.exec(item[4]);
      current = {
        text: task ? task[2] : item[4],
        checked: task ? task[1].toLowerCase() === "x" : null,
        nested: [],
      };
      index += 1;
      continue;
    }

    if (indent > baseIndent && current) {
      // Strip one level of indentation so the nested content parses as its own
      // document rather than as an indented code block.
      current.nested.push(line.slice(Math.min(indent, baseIndent + 2)));
      index += 1;
      continue;
    }

    break;
  }

  flush();

  const startNumber = ordered ? Number(first[3]) : 1;
  return [
    block("list", {
      ordered,
      start: Number.isInteger(startNumber) && startNumber > 0 ? startNumber : 1,
      items,
    }),
    index,
  ];
}

export function parseMarkdown(source: string): ParsedDocument {
  const { frontMatter, body } = parseFrontMatter(source);
  return { frontMatter, blocks: normalizeDocBlocks(parseMarkdownBlocks(body)) };
}

/* ------------------------------------------------------------ Serializing */

function serializeBlocks(blocks: DocBlock[]): string {
  return blocks
    .map((entry) => serializeBlock(entry))
    .filter((entry) => entry !== null)
    .join("\n\n");
}

function serializeBlock(entry: DocBlock): string | null {
  switch (entry.type) {
    case "heading":
      return `${"#".repeat(entry.level ?? 2)} ${entry.text ?? ""}`.trimEnd();

    case "paragraph":
      return entry.text ?? "";

    case "thematicBreak":
      return "---";

    case "codeBlock": {
      // A fence has to be longer than any run of backticks inside it, or the
      // code would close its own block.
      const longest = Math.max(
        3,
        ...[...(entry.code ?? "").matchAll(/`+/g)].map((match) => match[0].length + 1)
      );
      const fence = "`".repeat(longest);
      return `${fence}${entry.language ?? ""}\n${entry.code ?? ""}\n${fence}`;
    }

    case "blockquote":
      return serializeBlocks(entry.blocks ?? [])
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");

    case "image": {
      const title = entry.title ? ` "${entry.title}"` : "";
      return `![${entry.alt ?? ""}](${entry.url ?? ""}${title})`;
    }

    case "html":
      return entry.html ?? "";

    case "list":
      return serializeList(entry);

    case "table": {
      const rows = entry.rows ?? [];
      if (rows.length === 0) return null;

      const align = entry.align ?? [];
      const divider = rows[0].map((_, column) => {
        switch (align[column]) {
          case "left":
            return ":---";
          case "center":
            return ":---:";
          case "right":
            return "---:";
          default:
            return "---";
        }
      });

      const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
      return [line(rows[0]), line(divider), ...rows.slice(1).map(line)].join("\n");
    }

    default:
      return null;
  }
}

function serializeList(entry: DocBlock, depth = 0): string {
  const items = entry.items ?? [];
  const ordered = Boolean(entry.ordered);
  const startAt = entry.start ?? 1;
  const pad = "  ".repeat(depth);

  return items
    .map((item, position) => {
      const marker = ordered ? `${startAt + position}.` : "-";
      const box = item.checked === null ? "" : item.checked ? "[x] " : "[ ] ";
      const head = `${pad}${marker} ${box}${item.text}`;

      if (item.children.length === 0) return head;

      // Children are indented under the item so they parse back as its content.
      const nested = serializeBlocks(item.children)
        .split("\n")
        .map((line) => (line ? `${pad}  ${line}` : ""))
        .join("\n");

      return `${head}\n${nested}`;
    })
    .join("\n");
}

export function serializeMarkdown(
  blocks: DocBlock[],
  frontMatter: FrontMatter = {}
): string {
  const body = serializeBlocks(blocks);
  // One trailing newline, which is what a text file is expected to end with.
  return `${serializeFrontMatter(frontMatter)}${body}\n`;
}
