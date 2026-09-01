"use client";

import type { ReactNode } from "react";

import {
  headingAnchor,
  tableHasHeader,
  type DocBlock,
  type DocListItem,
} from "@/lib/doc-layout";
import type { DocTableMode } from "@/lib/doc-style";
import { protectedMediaUrl } from "@/lib/protected-media-url";

/**
 * Documentation content, rendered.
 *
 * Inline markdown is converted here rather than stored as HTML, so what is
 * saved stays the markdown that exports cleanly and only the display is
 * derived. The inline grammar is small on purpose — emphasis, code, links,
 * images, strikethrough and line breaks — matching what the parser promises to
 * round-trip.
 */

export function DocContent({
  blocks,
  /** Rem of space after each block; 0 uses the stylesheet's own rhythm. */
  spacing = 0,
  /** Scopes the slot's generated element styles to this body. */
  className = "",
  /** What a table does when it no longer fits. */
  tableMode = "stack",
}: {
  blocks: DocBlock[];
  spacing?: number;
  className?: string;
  tableMode?: DocTableMode;
}) {
  return (
    <div
      className={`doc-content is-tables-${tableMode} ${className}`.trim()}
      style={spacing > 0 ? { ["--doc-block-gap" as string]: `${spacing}rem` } : undefined}
    >
      {blocks.map((block) => (
        <DocBlockView key={block.id} block={block} />
      ))}
    </div>
  );
}

export function DocBlockView({ block }: { block: DocBlock }) {
  switch (block.type) {
    case "heading": {
      const level = block.level ?? 2;
      const Tag = `h${level}` as "h1";
      // Anchored so a contents list can link into the page.
      return (
        <Tag
          className="doc-heading"
          data-level={level}
          id={headingAnchor(block.text ?? "")}
        >
          <Inline text={block.text ?? ""} />
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p className="doc-paragraph">
          <Inline text={block.text ?? ""} />
        </p>
      );

    case "list":
      return <DocList block={block} />;

    case "codeBlock":
      return (
        <pre className="doc-code" data-language={block.language || undefined}>
          <code>{block.code ?? ""}</code>
        </pre>
      );

    case "blockquote":
      return (
        <blockquote className="doc-quote">
          {(block.blocks ?? []).map((child) => (
            <DocBlockView key={child.id} block={child} />
          ))}
        </blockquote>
      );

    case "table": {
      const rows = block.rows ?? [];
      if (rows.length === 0) return null;
      const align = block.align ?? [];

      // A table with an empty first row is headerless by construction: the row
      // exists only because markdown needs something above the delimiter.
      const hasHeader = tableHasHeader(block);

      return (
        // Wide tables scroll in their own box rather than pushing the page out.
        <div className="doc-table-scroll">
          <table className="doc-table" data-headerless={hasHeader ? undefined : ""}>
            {hasHeader ? (
              <thead>
                <tr>
                  {rows[0].map((cell, column) => (
                    <th key={column} style={{ textAlign: align[column] ?? undefined }}>
                      <Inline text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {rows.slice(1).map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, column) => (
                    <td
                      key={column}
                      style={{ textAlign: align[column] ?? undefined }}
                      // Carried so a stacked row can label each value with the
                      // column it came from; a stacked table without its
                      // headings is a list of unattributed strings. A headerless
                      // table has nothing to label with, and says so with an
                      // absent attribute rather than an empty one.
                      data-label={hasHeader ? rows[0][column] ?? "" : undefined}
                    >
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "thematicBreak":
      return <hr className="doc-divider" />;

    case "image":
      if (!block.url) return null;
      return (
        <figure className="doc-figure">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={protectedMediaUrl(block.url)}
            alt={block.alt ?? ""}
            title={block.title || undefined}
          />
          {block.title ? <figcaption>{block.title}</figcaption> : null}
        </figure>
      );

    case "html":
      // Authored by an admin through the editor, and the same trust the rich
      // text blocks elsewhere in the app already extend to admin-written HTML.
      return (
        <div
          className="doc-html"
          dangerouslySetInnerHTML={{ __html: block.html ?? "" }}
        />
      );

    default:
      return null;
  }
}

function DocList({ block }: { block: DocBlock }) {
  const items = block.items ?? [];
  const ordered = Boolean(block.ordered);
  const Tag = ordered ? "ol" : "ul";

  // A task list is not a bullet list wearing checkboxes; it gets its own class
  // so the markers can be suppressed.
  const isTaskList = items.some((item) => item.checked !== null);

  return (
    <Tag
      className={`doc-list${isTaskList ? " is-tasks" : ""}`}
      start={ordered && block.start !== 1 ? block.start : undefined}
    >
      {items.map((item, index) => (
        <DocListItemView key={index} item={item} />
      ))}
    </Tag>
  );
}

function DocListItemView({ item }: { item: DocListItem }) {
  return (
    <li className="doc-list-item">
      {item.checked === null ? null : (
        <input
          type="checkbox"
          className="doc-task"
          checked={item.checked}
          // A rendered document is a record, not a form.
          readOnly
          disabled
        />
      )}
      <Inline text={item.text} />
      {item.children.map((child) => (
        <DocBlockView key={child.id} block={child} />
      ))}
    </li>
  );
}

/* --------------------------------------------------------------- Inline */

/**
 * The inline grammar, as React rather than HTML.
 *
 * Built by walking the string once with a single alternation, so a `` `code` ``
 * span containing what looks like emphasis is left alone — the code branch
 * consumes it first, which is what markdown specifies.
 */
const INLINE =
  /(`+)([\s\S]*?)\1|!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)|(\*\*\*|___)([\s\S]+?)\9|(\*\*|__)([\s\S]+?)\11|(\*|_)([\s\S]+?)\13|~~([\s\S]+?)~~|(\n)/g;

/** Whether a source is an SVG, which is the one kind with no natural size. */
function isVector(src: string): boolean {
  return /\.svg(\?|#|$)/i.test(src.trim());
}

export function Inline({ text }: { text: string }): ReactNode {
  if (!text) return null;

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) nodes.push(text.slice(cursor, at));

    if (match[1]) {
      nodes.push(<code key={key++}>{match[2]}</code>);
    } else if (match[3] !== undefined) {
      nodes.push(
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key++}
          src={protectedMediaUrl(match[4])}
          alt={match[3]}
          title={match[5] || undefined}
          /*
           * Marked as a vector, so the stylesheet can size it.
           *
           * An SVG written with only a `viewBox` has a ratio but no intrinsic
           * size, and nothing in CSS can ask an image whether it has one — the
           * file name is the only thing here that knows. See the table rule in
           * the stylesheet for what this is for.
           */
          className={isVector(match[4]) ? "is-vector" : undefined}
        />
      );
    } else if (match[6] !== undefined) {
      const href = match[7];
      const external = /^https?:\/\//i.test(href);
      nodes.push(
        <a
          key={key++}
          href={href}
          title={match[8] || undefined}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          <Inline text={match[6]} />
        </a>
      );
    } else if (match[9]) {
      // Both at once. Matched before the two-marker branch, which would
      // otherwise take `**` off the front and leave the third asterisk stranded
      // as literal text on either side of the emphasis.
      nodes.push(
        <strong key={key++}>
          <em>
            <Inline text={match[10]} />
          </em>
        </strong>
      );
    } else if (match[11]) {
      nodes.push(
        <strong key={key++}>
          <Inline text={match[12]} />
        </strong>
      );
    } else if (match[13]) {
      nodes.push(
        <em key={key++}>
          <Inline text={match[14]} />
        </em>
      );
    } else if (match[15] !== undefined) {
      nodes.push(
        <del key={key++}>
          <Inline text={match[15]} />
        </del>
      );
    } else if (match[16]) {
      nodes.push(<br key={key++} />);
    }

    cursor = at + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}
