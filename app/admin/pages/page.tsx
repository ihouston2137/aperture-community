import Link from "next/link";

import { AdminHeader, EmptyState, StatusBadge } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { SitePage } from "@/lib/models";

import { deletePageAction, setHomePageAction } from "./actions";

export const metadata = { title: "Pages" };

export default async function PagesPage() {
  await requirePermission("pages.manage");
  await connectDB();

  const pages = await SitePage.find().sort({ updatedAt: -1 }).lean<any[]>();

  return (
    <>
      <AdminHeader
        title="Pages"
        subtitle="Custom site pages built with the page builder."
        actions={
          <Link href="/admin/pages/new" className="btn btn-primary">
            New page
          </Link>
        }
      />

      {pages.length === 0 ? (
        <EmptyState
          message="No pages yet."
          actionHref="/admin/pages/new"
          actionLabel="Build the first page"
        />
      ) : (
        <ul className="admin-list">
          {pages.map((page) => (
            <li key={String(page._id)} className="admin-list-item">
              <div>
                <h3>{page.title}</h3>
                <div className="admin-list-meta">/{page.slug}</div>
              </div>
              <StatusBadge status={page.status} />
              {page.isHome ? <span className="badge">Home</span> : null}

              <div className="admin-list-actions">
                <Link className="btn btn-sm" href={`/admin/pages/${page._id}/edit`}>
                  Edit
                </Link>
                <Link className="btn btn-sm" href={`/${page.slug}`} target="_blank">
                  View
                </Link>
                {!page.isHome ? (
                  <form action={setHomePageAction}>
                    <input type="hidden" name="id" value={String(page._id)} />
                    <button type="submit" className="btn btn-sm">
                      Set as home
                    </button>
                  </form>
                ) : null}
                <form action={deletePageAction}>
                  <input type="hidden" name="id" value={String(page._id)} />
                  <button type="submit" className="btn btn-danger btn-sm">
                    Delete
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
