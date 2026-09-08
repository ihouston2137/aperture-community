import Link from "next/link";

import { AdminHeader, EmptyState, Panel, StatusBadge } from "@/components/admin-ui";
import { checkPermission, requirePermission } from "@/lib/access";
import { listDocSets } from "@/lib/docs";
import { connectDB } from "@/lib/db";
import { DocPage, Documentation } from "@/lib/models";
import { getSession } from "@/lib/session";
import { IN_BIN, NOT_DELETED } from "@/lib/soft-delete";

import {
  deleteDocSetAction,
  purgeDocSetAction,
  restoreDocSetAction,
} from "./actions";

export const metadata = { title: "Documentation" };

export default async function DocsPage({
  searchParams,
}: {
  searchParams: Promise<{ purge?: string; id?: string }>;
}) {
  await requirePermission("docs.manage");
  const { purge, id: purgeId } = await searchParams;
  const canPurge = await checkPermission(await getSession(), "docs.purge");
  await connectDB();

  const sets = await listDocSets();
  // The bin, newest first: what went in last is what somebody is most likely
  // to have deleted by mistake.
  const binned = await Documentation.find(IN_BIN).sort({ deletedAt: -1 }).lean<any[]>();
  // A binned set keeps its pages, so the bin can say how much is waiting.
  const binnedCounts = await DocPage.aggregate<{ _id: string; count: number }>([
    { $match: { ...NOT_DELETED } },
    { $group: { _id: "$documentationId", count: { $sum: 1 } } },
  ]);
  const binnedPages = new Map(binnedCounts.map((row) => [String(row._id), row.count]));

  // How many pages each set holds, so a set is not an opaque row.
  const counts = await DocPage.aggregate<{ _id: string; count: number }>([
    // Pages in the bin are not pages the set has.
    { $match: NOT_DELETED },
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

      {/*
        The bin.
        Deleting a set used to take every document in it. Now the set is put
        here and its documents stay with it, so putting it back brings all of
        them. Removing it for good is separate and destroys the lot.
      */}
      {binned.length > 0 ? (
        <Panel title={`Deleted documentation (${binned.length})`}>
          <p className="help-text" style={{ marginTop: 0 }}>
            A deleted set keeps its documents. Putting it back brings all of
            them with it.
            {canPurge
              ? " Removing one for good destroys the set and every document in it."
              : " Removing one for good needs a further permission."}
          </p>
          <ul className="admin-list">
            {binned.map((set) => {
              const held = binnedPages.get(String(set._id)) ?? 0;
              return (
                <li key={String(set._id)} className="admin-list-row">
                  <div>
                    <strong>{set.title}</strong>
                    <div className="admin-subtitle">
                      {set.slug} · {held} document{held === 1 ? "" : "s"} held
                      {set.deletedAt
                        ? ` · deleted ${new Date(set.deletedAt).toLocaleDateString()}`
                        : ""}
                      {set.deletedBy ? ` by ${set.deletedBy}` : ""}
                    </div>
                    {purge === "mismatch" && purgeId === String(set._id) ? (
                      <div className="admin-subtitle" role="alert">
                        That was not the right slug, so nothing was removed.
                      </div>
                    ) : null}
                  </div>
                  <div className="admin-list-actions">
                    <form action={restoreDocSetAction}>
                      <input type="hidden" name="id" value={String(set._id)} />
                      <button type="submit" className="btn btn-sm">
                        Put back
                      </button>
                    </form>
                    {canPurge ? (
                      <form action={purgeDocSetAction} className="admin-list-actions">
                        <input type="hidden" name="id" value={String(set._id)} />
                        <input
                          type="text"
                          name="confirm"
                          className="input"
                          style={{ maxWidth: "11rem" }}
                          placeholder={`Type ${set.slug}`}
                          aria-label={`Type ${set.slug} to remove it and its documents for good`}
                          autoComplete="off"
                        />
                        <button type="submit" className="btn btn-danger btn-sm">
                          Remove for good
                        </button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}
