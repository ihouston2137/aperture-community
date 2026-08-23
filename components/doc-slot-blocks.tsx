"use client";

import Link from "next/link";

import type { DocTemplateBlock } from "@/lib/doc-template-layout";
import { docContentClass } from "@/lib/doc-style";
import { docHref, type DocNode, type DocView } from "@/lib/doc-tree";

import { blockTextProps, styleSlotProps } from "./block-primitives";
import { DocContent } from "./doc-blocks";

/**
 * One documentation slot, filled from the document being rendered.
 *
 * The same component draws the template builder's canvas and the published
 * page, so a change in the template is exactly what a reader gets.
 */
export function DocSlotView({
  block,
  doc,
  tree,
  showPlaceholders = false,
}: {
  block: DocTemplateBlock;
  doc: DocView | null;
  /** The published documentation tree, for the contents slot. */
  tree: DocNode[];
  /** In the builder, an empty slot names itself rather than vanishing. */
  showPlaceholders?: boolean;
}) {
  const { className, style } = blockTextProps(block);
  const wrap = (content: React.ReactNode, extra = "") => (
    <div className={`doc-slot ${extra} ${className}`.trim()} style={style}>
      {content}
    </div>
  );

  const placeholder = (label: string) =>
    showPlaceholders ? wrap(<span className="doc-slot-placeholder">{label}</span>) : null;

  // The parts inside a slot carry their own style, resolved the same way the
  // slot's own is — a named style becomes a class, local values an inline
  // style, and a per-view override a generated rule.
  const part = (key: string) => styleSlotProps(block, key);

  switch (block.type) {
    case "docSetTitle":
      if (!doc?.set.title) return placeholder("Documentation title");
      return wrap(
        <p className="doc-set-title">
          <Link href={`/docs/${doc.set.slug}`}>{doc.set.title}</Link>
        </p>
      );

    case "docTitle":
      if (!doc?.title) return placeholder("Title");
      return wrap(<h1 className="doc-title">{doc.title}</h1>);

    case "docDescription":
      if (!doc?.description) return placeholder("Description");
      return wrap(<p className="doc-description">{doc.description}</p>);

    case "docUpdated": {
      if (!doc?.updatedAt) return placeholder("Last updated");
      const date = new Date(doc.updatedAt);
      const formatted =
        block.dateFormat === "year"
          ? String(date.getFullYear())
          : date.toLocaleDateString(undefined, {
              year: "numeric",
              month: block.dateFormat === "short" ? "short" : "long",
              day: "numeric",
            });
      return wrap(
        <p className="doc-updated">
          {block.label ? <span className="doc-slot-label">{block.label}</span> : null}
          {formatted}
        </p>
      );
    }

    case "docTags":
      if (!doc || doc.tags.length === 0) return placeholder("Tags");
      return wrap(
        <ul className="doc-tags">
          {doc.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      );

    case "docBreadcrumbs": {
      if (!doc || doc.trail.length === 0) return placeholder("Breadcrumbs");
      return wrap(
        <nav className="doc-breadcrumbs" aria-label="Breadcrumb">
          {doc.trail.map((entry, index) => (
            <span key={entry._id}>
              {index > 0 ? <span aria-hidden="true"> / </span> : null}
              {entry._id === doc._id ? (
                <span aria-current="page">{entry.title}</span>
              ) : (
                <Link href={docHref(doc.set.slug, entry.slug)}>{entry.title}</Link>
              )}
            </span>
          ))}
        </nav>
      );
    }

    case "docToc": {
      // The hierarchy, as the contents. `branchOnly` narrows to the section the
      // reader is in, which is what a large documentation set usually wants.
      const roots =
        block.branchOnly && doc && doc.trail.length > 0
          ? findBranch(tree, doc.trail[0]._id)
          : tree;

      if (roots.length === 0) return placeholder("Contents");

      const link = part("linkStyle");
      const dropdown = part("dropdownStyle");
      const panel = part("panelStyle");

      const list = (
        <TocList
          nodes={roots}
          depth={1}
          maxDepth={block.depth ?? 0}
          current={doc}
          setSlug={doc?.set.slug ?? ""}
          link={link}
        />
      );

      // On a narrow screen a sidebar is most of the width, so it folds into a
      // disclosure. `details` rather than a menu built from script: it opens
      // without JavaScript, is keyboard operable already, and a screen reader
      // announces it as expandable without any wiring.
      if ((block.navMode ?? "dropdown") === "dropdown") {
        return wrap(
          <nav className="doc-toc" aria-label="Documentation">
            <details className="doc-toc-drop">
              {/* The closed control is what the reader sees on a phone, so it
                  takes its own style rather than borrowing the links'. */}
              <summary className={dropdown.className} style={dropdown.style}>
                {doc ? doc.title : "Contents"}
                <span className="doc-toc-drop-hint">Contents</span>
              </summary>
              <div
                className={`doc-toc-panel ${panel.className}`.trim()}
                style={panel.style}
              >
                {list}
              </div>
            </details>
            <div className="doc-toc-wide">{list}</div>
          </nav>,
          "is-toc"
        );
      }

      return wrap(
        <nav className="doc-toc" aria-label="Documentation">
          {list}
        </nav>,
        "is-toc"
      );
    }

    case "docOnThisPage": {
      const max = block.maxLevel ?? 3;
      const headings = (doc?.headings ?? []).filter((entry) => entry.level <= max);
      if (headings.length === 0) return placeholder("On this page");

      return wrap(
        <nav className="doc-on-this-page" aria-label="On this page">
          {block.label ? <p className="doc-slot-label">{block.label}</p> : null}
          <ul>
            {headings.map((heading) => (
              <li key={heading.id} data-level={heading.level}>
                <a href={`#${heading.anchor}`}>{heading.text}</a>
              </li>
            ))}
          </ul>
        </nav>,
        "is-on-this-page"
      );
    }

    case "docContent":
      if (!doc || doc.content.length === 0) return placeholder("Document body");
      return wrap(
        <DocContent
          blocks={doc.content}
          spacing={block.blockSpacing ?? 0}
          // Scoped so this slot's element styles dress this body and no other.
          className={docContentClass(block.id)}
          tableMode={block.tableMode ?? "stack"}
        />
      );

    case "docPrevNext": {
      if (!doc || (!doc.previous && !doc.next)) return placeholder("Previous / next");
      // One style for the pair: they are two halves of the same control, and
      // styling them apart would make the foot of every page look lopsided.
      const button = part("buttonStyle");

      return wrap(
        <nav className="doc-prev-next" aria-label="Pagination">
          {doc.previous ? (
            <Link
              className={`doc-prev ${button.className}`.trim()}
              style={button.style}
              href={docHref(doc.set.slug, doc.previous.slug)}
            >
              <span>Previous</span>
              {doc.previous.title}
            </Link>
          ) : (
            <span />
          )}
          {doc.next ? (
            <Link
              className={`doc-next ${button.className}`.trim()}
              style={button.style}
              href={docHref(doc.set.slug, doc.next.slug)}
            >
              <span>Next</span>
              {doc.next.title}
            </Link>
          ) : null}
        </nav>
      );
    }

    default:
      return null;
  }
}

function TocList({
  nodes,
  depth,
  maxDepth,
  current,
  setSlug,
  link,
}: {
  nodes: DocNode[];
  depth: number;
  /** 0 means the whole tree. */
  maxDepth: number;
  current: DocView | null;
  /** Every link is inside one set, so its slug is carried down. */
  setSlug: string;
  /** The slot's link style, applied to every link at every depth. */
  link: { className: string; style: React.CSSProperties | undefined };
}) {
  return (
    <ul className="doc-toc-list" data-depth={depth}>
      {nodes.map((node) => {
        const isCurrentDoc = node._id === current?._id;

        return (
          <li key={node._id}>
            <Link
              href={docHref(setSlug, node.slug)}
              aria-current={isCurrentDoc ? "page" : undefined}
              className={`${isCurrentDoc ? "is-current" : ""} ${link.className}`.trim()}
              style={link.style}
            >
              {node.title}
            </Link>

            {node.children.length > 0 && (maxDepth === 0 || depth < maxDepth) ? (
              <TocList
                nodes={node.children}
                depth={depth + 1}
                maxDepth={maxDepth}
                current={current}
                setSlug={setSlug}
                link={link}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** The subtree rooted at `id`, or the whole tree when it is not found. */
function findBranch(tree: DocNode[], id: string): DocNode[] {
  const match = tree.find((node) => node._id === id);
  return match ? [match] : tree;
}
