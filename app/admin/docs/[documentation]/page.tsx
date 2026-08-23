import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminHeader, EmptyState, Panel, StatusBadge } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { buildDocTree, getDocSetById, listDocs, type DocNode } from "@/lib/docs";
import { DocTemplate } from "@/lib/models";

import {
  deleteDocAction,
  importDocsAction,
  moveDocAction,
  splitDocIntoPagesAction,
} from "../actions";
import { DocSetForm } from "../doc-set-form";

export const metadata = { title: "Documentation" };

export default async function DocSetPage({
  params,
}: {
  params: Promise<{ documentation: string }>;
}) {
  await requirePermission("docs.manage");

  const { documentation } = await params;
  const set = await getDocSetById(documentation);
  if (!set) notFound();

  await connectDB();
  const [pages, templateDocs] = await Promise.all([
    listDocs(set._id),
    DocTemplate.find().select("name").sort({ name: 1 }).lean<any[]>(),
  ]);

  const tree = buildDocTree(pages);

  return (
    <>
      <AdminHeader
        title={set.title}
        subtitle={`${pages.length} document${pages.length === 1 ? "" : "s"}, in the order a reader moves through them.`}
        actions={
          <>
            <Link href="/admin/docs" className="btn">
              All documentation
            </Link>
            <Link
              href={`/admin/docs/${set._id}/pages/new`}
              className="btn btn-primary"
            >
              New document
            </Link>
          </>
        }
      />

      <DocSetForm
        set={set}
        templates={templateDocs.map((doc) => ({
          _id: String(doc._id),
          name: doc.name ?? "",
        }))}
      />

      <Panel title="Import">
        <form action={importDocsAction} className="doc-import">
          <input type="hidden" name="documentationId" value={set._id} />
          <input
            type="file"
            name="files"
            accept=".md,.markdown,text/markdown"
            multiple
            required
          />
          <button type="submit" className="btn btn-sm">
            Import markdown
          </button>
        </form>
        <span className="help-text">
          One file becomes one document in this set. Select several at once, or a
          whole folder — sub-folders become parent pages. Front matter supplies
          the title, slug, status, description and tags; anything else in it is
          kept and written back on export.
        </span>
      </Panel>

      {tree.length === 0 ? (
        <EmptyState
          message="No documents in this set yet."
          actionHref={`/admin/docs/${set._id}/pages/new`}
          actionLabel="Write the first document"
        />
      ) : (
        <Panel title="Documents">
          <DocTreeView nodes={tree} depth={0} setId={set._id} setSlug={set.slug} />
        </Panel>
      )}
    </>
  );
}

function DocTreeView({
  nodes,
  depth,
  setId,
  setSlug,
}: {
  nodes: DocNode[];
  depth: number;
  setId: string;
  setSlug: string;
}) {
  return (
    <ul className="admin-list doc-tree" data-depth={depth}>
      {nodes.map((node) => (
        <li key={node._id}>
          <div className="admin-list-item" style={{ marginLeft: `${depth * 1.25}rem` }}>
            <div>
              <h3>{node.title}</h3>
              <div className="admin-list-meta">
                /docs/{setSlug}/{node.slug}
              </div>
            </div>

            <StatusBadge status={node.status} />

            <div className="admin-list-actions">
              {/* Outlining moves: order among siblings, and depth in the tree. */}
              {(["up", "down", "in", "out"] as const).map((direction) => (
                <form key={direction} action={moveDocAction}>
                  <input type="hidden" name="id" value={node._id} />
                  <input type="hidden" name="direction" value={direction} />
                  <button
                    type="submit"
                    className="btn btn-sm"
                    title={MOVE_TITLES[direction]}
                    aria-label={MOVE_TITLES[direction]}
                  >
                    {MOVE_GLYPHS[direction]}
                  </button>
                </form>
              ))}

              <Link
                className="btn btn-sm"
                href={`/admin/docs/${setId}/pages/${node._id}/edit`}
              >
                Edit
              </Link>
              {/* Turning a long document into a section of real, separately
                  editable pages is an editorial act, not a display setting. */}
              <form action={splitDocIntoPagesAction}>
                <input type="hidden" name="id" value={node._id} />
                <button
                  type="submit"
                  className="btn btn-sm"
                  title="Turn each top-level heading into its own document"
                >
                  Split
                </button>
              </form>
              <a
                className="btn btn-sm"
                href={`/api/admin/docs/${node._id}/export`}
                download
              >
                Export
              </a>
              <Link
                className="btn btn-sm"
                href={`/docs/${setSlug}/${node.slug}${
                  node.status === "published" ? "" : `?previewId=${node._id}`
                }`}
                target="_blank"
              >
                View
              </Link>
              <form action={deleteDocAction}>
                <input type="hidden" name="id" value={node._id} />
                <input type="hidden" name="documentationId" value={setId} />
                <button type="submit" className="btn btn-danger btn-sm">
                  Delete
                </button>
              </form>
            </div>
          </div>

          {node.children.length > 0 ? (
            <DocTreeView
              nodes={node.children}
              depth={depth + 1}
              setId={setId}
              setSlug={setSlug}
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const MOVE_GLYPHS = { up: "↑", down: "↓", in: "→", out: "←" } as const;
const MOVE_TITLES = {
  up: "Move up",
  down: "Move down",
  in: "Make a child of the document above",
  out: "Move out one level",
} as const;
