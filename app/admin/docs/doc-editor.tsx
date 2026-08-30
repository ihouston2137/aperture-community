"use client";

import Link from "next/link";
import { useState } from "react";

import { MediaField } from "@/app/admin/media/media-picker";
import { AdminHeader, Panel } from "@/components/admin-ui";
import { DocContent } from "@/components/doc-blocks";
import {
  DOC_BLOCK_LABELS,
  DOC_BLOCK_TYPES,
  createDocBlock,
  tableHasHeader,
  type DocBlock,
  type DocBlockType,
  type DocListItem,
} from "@/lib/doc-layout";
import { parseMarkdownBlocks, serializeMarkdown } from "@/lib/doc-markdown";
import type { DocSetSummary, DocSummary } from "@/lib/doc-tree";

import { saveDocAction } from "./actions";
import { MarkdownHelpButton } from "./markdown-help";

/**
 * The documentation editor: a list of markdown-shaped blocks.
 *
 * Two ways in, one representation. The block list is the authored form; the
 * Markdown tab is the same document as text, so pasting a `.md` in or copying
 * one out never needs a separate import step. Switching tabs converts, which is
 * exactly the round trip the parser is tested for.
 */

export type DocDraft = {
  _id?: string;
  /** The set this page belongs to; a page outside one is unreachable. */
  documentationId: string;
  title: string;
  slug: string;
  status: "draft" | "published";
  description: string;
  category: string;
  tags: string[];
  parentId: string;
  order: number;
  content: DocBlock[];
  frontMatter: Record<string, string>;
};

export function DocEditor({
  doc,
  set,
  parents,
  saved,
  imported,
}: {
  doc: DocDraft;
  /** The set it belongs to, which owns the template and the address. */
  set: DocSetSummary;
  /** Documents in the same set that can be this one's parent. */
  parents: DocSummary[];
  saved: boolean;
  imported: boolean;
}) {
  const [title, setTitle] = useState(doc.title);
  const [slug, setSlug] = useState(doc.slug);
  const [status, setStatus] = useState(doc.status);
  const [description, setDescription] = useState(doc.description);
  const [tags, setTags] = useState(doc.tags.join(", "));
  const [parentId, setParentId] = useState(doc.parentId);
  const [blocks, setBlocks] = useState<DocBlock[]>(doc.content);
  const [tab, setTab] = useState<"blocks" | "markdown" | "preview">("blocks");

  // Regenerated from the blocks each time the tab is opened, so the text and
  // the structure can never drift apart.
  const [markdown, setMarkdown] = useState("");

  const update = (id: string, patch: Partial<DocBlock>) =>
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, ...patch } : block))
    );

  const add = (type: DocBlockType, after?: number) =>
    setBlocks((current) => {
      const block = createDocBlock(type);
      if (after === undefined) return [...current, block];
      const next = [...current];
      next.splice(after + 1, 0, block);
      return next;
    });

  const move = (index: number, delta: number) =>
    setBlocks((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (id: string) =>
    setBlocks((current) => current.filter((block) => block.id !== id));

  const openMarkdown = () => {
    setMarkdown(serializeMarkdown(blocks));
    setTab("markdown");
  };

  const applyMarkdown = () => {
    setBlocks(parseMarkdownBlocks(markdown));
    setTab("blocks");
  };

  return (
    <form action={saveDocAction}>
      {doc._id ? <input type="hidden" name="id" value={doc._id} /> : null}
      <input type="hidden" name="documentationId" value={doc.documentationId} />
      <input type="hidden" name="content" value={JSON.stringify(blocks)} />
      <input type="hidden" name="frontMatter" value={JSON.stringify(doc.frontMatter)} />
      <input type="hidden" name="order" value={doc.order} />

      <AdminHeader
        title={doc._id ? "Edit document" : "New document"}
        actions={
          <>
            {saved ? <span className="save-status">Document saved.</span> : null}
            {imported ? <span className="save-status">Markdown imported.</span> : null}
            {doc._id ? (
              <a className="btn" href={`/api/admin/docs/${doc._id}/export`} download>
                Export
              </a>
            ) : null}
            <Link href={`/admin/docs/${set._id}`} className="btn">
              Back to {set.title}
            </Link>
            <button type="submit" className="btn btn-primary">
              Save document
            </button>
          </>
        }
      />

      <Panel title="Details">
        <div className="field-grid">
          <div className="field">
            <label htmlFor="doc-title">Title</label>
            <input
              id="doc-title"
              name="title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="doc-slug">Slug</label>
            <input
              id="doc-slug"
              name="slug"
              type="text"
              value={slug}
              placeholder="from the title"
              onChange={(event) => setSlug(event.target.value)}
            />
            <span className="help-text">
              The address is /docs/{set.slug}/{slug || "…"} and does not change
              when the document is moved within the set.
            </span>
          </div>
          <div className="field">
            <label htmlFor="doc-status">Status</label>
            <select
              id="doc-status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as "draft" | "published")}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="doc-parent">Parent</label>
            <select
              id="doc-parent"
              name="parentId"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Top level</option>
              {parents.map((parent) => (
                <option key={parent._id} value={parent._id}>
                  {parent.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="doc-tags">Tags</label>
            <input
              id="doc-tags"
              name="tags"
              type="text"
              value={tags}
              placeholder="comma separated"
              onChange={(event) => setTags(event.target.value)}
            />
          </div>
        </div>

        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="doc-description">Description</label>
          <textarea
            id="doc-description"
            name="description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </Panel>

      <div className="builder-tabs">
        <button
          type="button"
          className={`builder-tab${tab === "blocks" ? " is-active" : ""}`}
          onClick={() => setTab("blocks")}
        >
          Blocks
        </button>
        <button
          type="button"
          className={`builder-tab${tab === "markdown" ? " is-active" : ""}`}
          onClick={openMarkdown}
        >
          Markdown
        </button>
        <button
          type="button"
          className={`builder-tab${tab === "preview" ? " is-active" : ""}`}
          onClick={() => setTab("preview")}
        >
          Preview
        </button>
      </div>

      {tab === "blocks" ? (
        <Panel>
          {blocks.length === 0 ? (
            <p className="help-text">Nothing yet. Add a block below.</p>
          ) : null}

          {blocks.map((block, index) => (
            <DocBlockEditor
              key={block.id}
              block={block}
              first={index === 0}
              last={index === blocks.length - 1}
              onChange={(patch) => update(block.id, patch)}
              onMove={(delta) => move(index, delta)}
              onRemove={() => remove(block.id)}
              onAddAfter={(type) => add(type, index)}
            />
          ))}

          <div className="doc-add-row">
            {DOC_BLOCK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="btn btn-sm"
                onClick={() => add(type)}
              >
                + {DOC_BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
        </Panel>
      ) : null}

      {tab === "markdown" ? (
        <Panel title="Markdown">
          <textarea
            className="doc-markdown"
            rows={24}
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
          />
          <div className="panel-actions" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={applyMarkdown}>
              Apply to blocks
            </button>
            {/* Beside the box it is about: what the grammar allows is the
                question somebody has while typing into it. */}
            <MarkdownHelpButton />
          </div>
          <span className="help-text">
            Editing here replaces the block list when applied. Paste a whole
            markdown file in, or copy this out — it is the same document either way.
          </span>
        </Panel>
      ) : null}

      {tab === "preview" ? (
        <Panel title="Preview">
          <div className="doc-preview">
            <DocContent blocks={blocks} />
          </div>
        </Panel>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------ One block */

function DocBlockEditor({
  block,
  first,
  last,
  onChange,
  onMove,
  onRemove,
  onAddAfter,
}: {
  block: DocBlock;
  first: boolean;
  last: boolean;
  onChange: (patch: Partial<DocBlock>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onAddAfter: (type: DocBlockType) => void;
}) {
  return (
    <div className="doc-block">
      <div className="doc-block-head">
        <strong>{DOC_BLOCK_LABELS[block.type]}</strong>
        <div className="admin-list-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label="Move down"
          >
            ↓
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <DocBlockFields block={block} onChange={onChange} />

      <div className="doc-add-row is-inline">
        {DOC_BLOCK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className="btn btn-sm"
            onClick={() => onAddAfter(type)}
          >
            + {DOC_BLOCK_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

function DocBlockFields({
  block,
  onChange,
}: {
  block: DocBlock;
  onChange: (patch: Partial<DocBlock>) => void;
}) {
  switch (block.type) {
    case "heading":
      return (
        <div className="field-grid">
          <div className="field">
            <label>Level</label>
            <select
              value={block.level ?? 2}
              onChange={(event) =>
                onChange({ level: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6 })
              }
            >
              {[1, 2, 3, 4, 5, 6].map((level) => (
                <option key={level} value={level}>
                  H{level}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Text</label>
            <input
              type="text"
              value={block.text ?? ""}
              onChange={(event) => onChange({ text: event.target.value })}
            />
          </div>
        </div>
      );

    case "paragraph":
      return (
        <div className="field">
          <textarea
            rows={3}
            value={block.text ?? ""}
            onChange={(event) => onChange({ text: event.target.value })}
          />
          <span className="help-text">
            Markdown inline formatting works here: **bold**, _italic_, `code`,
            [links](/path).
          </span>
        </div>
      );

    case "codeBlock":
      return (
        <>
          <div className="field">
            <label>Language</label>
            <input
              type="text"
              value={block.language ?? ""}
              placeholder="ts, bash, json…"
              onChange={(event) => onChange({ language: event.target.value })}
            />
          </div>
          <div className="field">
            <textarea
              className="doc-markdown"
              rows={6}
              value={block.code ?? ""}
              onChange={(event) => onChange({ code: event.target.value })}
            />
          </div>
        </>
      );

    case "image":
      return (
        <>
          <MediaField
            label="Image"
            value={block.url ?? ""}
            mediaType="image"
            onChange={(url, asset) => onChange({ url, mediaId: asset?._id ?? "" })}
          />
          <div className="field-grid">
            <div className="field">
              <label>Alt text</label>
              <input
                type="text"
                value={block.alt ?? ""}
                onChange={(event) => onChange({ alt: event.target.value })}
              />
            </div>
            <div className="field">
              <label>Caption</label>
              <input
                type="text"
                value={block.title ?? ""}
                onChange={(event) => onChange({ title: event.target.value })}
              />
            </div>
          </div>
        </>
      );

    case "list":
      return <ListFields block={block} onChange={onChange} />;

    case "table":
      return <TableFields block={block} onChange={onChange} />;

    case "blockquote":
      return (
        <div className="field">
          <label>Quoted text</label>
          <textarea
            rows={3}
            value={(block.blocks ?? [])
              .map((child) => child.text ?? "")
              .join("\n\n")}
            onChange={(event) =>
              onChange({ blocks: parseMarkdownBlocks(event.target.value) })
            }
          />
        </div>
      );

    case "html":
      return (
        <div className="field">
          <textarea
            className="doc-markdown"
            rows={4}
            value={block.html ?? ""}
            onChange={(event) => onChange({ html: event.target.value })}
          />
          <span className="help-text">Written into the page as-is.</span>
        </div>
      );

    default:
      return null;
  }
}

function ListFields({
  block,
  onChange,
}: {
  block: DocBlock;
  onChange: (patch: Partial<DocBlock>) => void;
}) {
  const items = block.items ?? [];

  const setItem = (index: number, patch: Partial<DocListItem>) =>
    onChange({
      items: items.map((item, position) =>
        position === index ? { ...item, ...patch } : item
      ),
    });

  return (
    <>
      <div className="field-grid">
        <div className="field">
          <label>Kind</label>
          <select
            value={block.ordered ? "ordered" : "bullet"}
            onChange={(event) => onChange({ ordered: event.target.value === "ordered" })}
          >
            <option value="bullet">Bulleted</option>
            <option value="ordered">Numbered</option>
          </select>
        </div>
        {block.ordered ? (
          <div className="field">
            <label>Starts at</label>
            <input
              type="number"
              min={1}
              value={block.start ?? 1}
              onChange={(event) => onChange({ start: Number(event.target.value) })}
            />
          </div>
        ) : null}
      </div>

      {items.map((item, index) => (
        <div key={index} className="doc-list-row">
          <select
            value={item.checked === null ? "none" : item.checked ? "checked" : "unchecked"}
            onChange={(event) =>
              setItem(index, {
                checked:
                  event.target.value === "none"
                    ? null
                    : event.target.value === "checked",
              })
            }
            title="Task state"
          >
            <option value="none">•</option>
            <option value="unchecked">☐</option>
            <option value="checked">☑</option>
          </select>
          <input
            type="text"
            className="input"
            value={item.text}
            onChange={(event) => setItem(index, { text: event.target.value })}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              onChange({ items: items.filter((_, position) => position !== index) })
            }
            aria-label="Remove item"
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-sm"
        onClick={() =>
          onChange({ items: [...items, { text: "", checked: null, children: [] }] })
        }
      >
        Add item
      </button>
      {items.some((item) => item.children.length > 0) ? (
        <span className="help-text">
          Some items have nested content, which is preserved but edited in the
          Markdown tab.
        </span>
      ) : null}
    </>
  );
}

function TableFields({
  block,
  onChange,
}: {
  block: DocBlock;
  onChange: (patch: Partial<DocBlock>) => void;
}) {
  const rows = block.rows ?? [];
  const align = block.align ?? [];
  const hasHeader = tableHasHeader(block);

  const setCell = (row: number, column: number, value: string) =>
    onChange({
      rows: rows.map((entry, rowIndex) =>
        rowIndex === row
          ? entry.map((cell, cellIndex) => (cellIndex === column ? value : cell))
          : entry
      ),
    });

  const width = rows[0]?.length ?? 0;

  /**
   * Markdown keeps a row above the delimiter whether or not it is shown, so
   * turning the heading off pushes the current first row down into the body
   * instead of discarding it, and turning it back on promotes the row under the
   * blank one. Nothing typed is lost either way.
   */
  const toggleHeader = (show: boolean) => {
    if (!show) {
      onChange({ rows: [new Array(width).fill(""), ...rows] });
      return;
    }

    // Promoting the row under the marker, unless the marker is all there is —
    // slicing that away would leave no rows and the table would vanish.
    onChange({ rows: rows.length > 1 ? rows.slice(1) : [new Array(width).fill("")] });
  };

  // The blank marker row is not data, so the grid does not offer it for editing.
  const editable = hasHeader ? rows : rows.slice(1);
  const offset = hasHeader ? 0 : 1;

  return (
    <>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={hasHeader}
          onChange={(event) => toggleHeader(event.target.checked)}
        />
        First row is a heading row
      </label>
      <span className="help-text">
        Turn this off for a table whose columns need no headings. The headings
        disappear from the table and from the labels on a stacked row.
      </span>

      <div className="doc-table-edit">
        <table>
          <tbody>
            {editable.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, column) => (
                  <td key={column}>
                    <input
                      type="text"
                      className="input"
                      value={cell}
                      placeholder={hasHeader && rowIndex === 0 ? "Heading" : ""}
                      onChange={(event) =>
                        setCell(rowIndex + offset, column, event.target.value)
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="doc-add-row is-inline">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange({ rows: [...rows, new Array(width).fill("")] })}
        >
          Add row
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() =>
            onChange({
              rows: rows.map((row) => [...row, ""]),
              align: [...align, null],
            })
          }
        >
          Add column
        </button>
      </div>

      <div className="field-grid">
        {align.map((value, column) => (
          <div key={column} className="field">
            <label>Column {column + 1} alignment</label>
            <select
              value={value ?? "default"}
              onChange={(event) =>
                onChange({
                  align: align.map((entry, index) =>
                    index === column
                      ? event.target.value === "default"
                        ? null
                        : (event.target.value as "left" | "center" | "right")
                      : entry
                  ),
                })
              }
            >
              <option value="default">Default</option>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
        ))}
      </div>
    </>
  );
}
