import Link from "next/link";

import { AdminHeader, EmptyState } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models";

import { deleteCollectionAction } from "./actions";

export const metadata = { title: "Collections" };

export default async function CollectionsPage() {
  await requirePermission("collections.manage");
  await connectDB();

  const collections = await Collection.find().sort({ name: 1 }).lean<any[]>();

  return (
    <>
      <AdminHeader
        title="Collections"
        subtitle="Galleries built from media library images."
        actions={
          <Link href="/admin/collections/new" className="btn btn-primary">
            New collection
          </Link>
        }
      />

      {collections.length === 0 ? (
        <EmptyState
          message="No collections yet."
          actionHref="/admin/collections/new"
          actionLabel="Create a collection"
        />
      ) : (
        <ul className="admin-list">
          {collections.map((collection) => (
            <li key={String(collection._id)} className="admin-list-item">
              <div>
                <h3>{collection.name}</h3>
                <div className="admin-list-meta">
                  /collections/{collection.slug} · {(collection.imageIds ?? []).length} images
                </div>
              </div>
              <span className={`badge${collection.isPublic ? " badge-published" : ""}`}>
                {collection.isPublic ? "public" : "private"}
              </span>
              <div className="admin-list-actions">
                <Link className="btn btn-sm" href={`/admin/collections/${collection._id}/edit`}>
                  Edit
                </Link>
                {collection.isPublic ? (
                  <Link
                    className="btn btn-sm"
                    href={`/collections/${collection.slug}`}
                    target="_blank"
                  >
                    View
                  </Link>
                ) : null}
                <form action={deleteCollectionAction}>
                  <input type="hidden" name="id" value={String(collection._id)} />
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
