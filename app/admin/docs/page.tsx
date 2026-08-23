import Link from "next/link";

import { AdminHeader, EmptyState, Panel, StatusBadge } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { listDocSets } from "@/lib/docs";
import { connectDB } from "@/lib/db";
import { DocPage } from "@/lib/models";

import { deleteDocSetAction } from "./actions";

export const metadata = { title: "Documentation" };

export default async function DocsPage() {
  await requirePermission("docs.manage");
  await connectDB();

  const sets = await listDocSets();

  // How many pages each set holds, so a set is not an opaque row.
  const counts = await DocPage.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$documentationId", count: { $sum: 1 } } },
  ]);
  const pageCount = new Map(counts.map((row) => [String(row._id), row.count]));

  return (
    <>
      <AdminHeader
        title="Documentation"
        subtitle="Each set is a grouping of documents in an order — a guide, a reference. A reader arrives at a set and moves through it."
        actions={
          <>
            <Link href="/admin/docs/templates" className="btn">
              Doc templates
            </Link>
            <a className="btn" href="/api/admin/docs/export" download>
              Export all
            </a>
            <Link href="/admin/docs/new" className="btn btn-primary">
              New documentation
            </Link>
          </>
        }
      />

      {sets.length === 0 ? (
        <EmptyState
          message="No documentation yet."
          actionHref="/admin/docs/new"
          actionLabel="Create the first set"
        />
      ) : (
        <Panel title="Sets">
          <ul className="admin-list">
            {sets.map((set) => {
              const pages = pageCount.get(set._id) ?? 0;

              return (
                <li key={set._id} className="admin-list-item">
                  <div>
                    <h3>{set.title}</h3>
                    <div className="admin-list-meta">
                      /docs/{set.slug} · {pages} document{pages === 1 ? "" : "s"}
                      {set.description ? ` · ${set.description}` : ""}
                    </div>
                  </div>

                  <StatusBadge status={set.status} />

                  <div className="admin-list-actions">
                    <Link className="btn btn-sm" href={`/admin/docs/${set._id}`}>
                      Open
                    </Link>
                    {pages > 0 ? (
                      <Link
                        className="btn btn-sm"
                        href={`/docs/${set.slug}`}
                        target="_blank"
                      >
                        View
                      </Link>
                    ) : null}
                    <form action={deleteDocSetAction}>
                      <input type="hidden" name="id" value={set._id} />
                      <button type="submit" className="btn btn-danger btn-sm">
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}
