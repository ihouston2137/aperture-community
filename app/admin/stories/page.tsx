import Link from "next/link";

import { AdminHeader, EmptyState, StatusBadge } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Story } from "@/lib/models";

export const metadata = { title: "Stories" };

export default async function StoriesPage() {
  // Story templates moved under Stories, so this page decides whether to offer
  // the link rather than the nav gating it.
  const { can } = await requirePermission("stories.manage");
  await connectDB();

  const stories = await Story.find().sort({ publishDate: -1 }).lean<any[]>();

  return (
    <>
      <AdminHeader
        title="Stories"
        subtitle="Long-form pieces rendered through story templates."
        actions={
          <>
            {can("storyTemplates.manage") ? (
              <Link href="/admin/story-templates" className="btn">
                Story templates
              </Link>
            ) : null}
            <Link href="/admin/stories/new" className="btn btn-primary">
              New story
            </Link>
          </>
        }
      />

      {stories.length === 0 ? (
        <EmptyState
          message="No stories yet."
          actionHref="/admin/stories/new"
          actionLabel="Write the first story"
        />
      ) : (
        <ul className="admin-list">
          {stories.map((story) => (
            <li key={String(story._id)} className="admin-list-item">
              <div>
                <h3>{story.headline}</h3>
                <div className="admin-list-meta">
                  /{story.slug}
                  {story.category ? ` · ${story.category}` : ""}
                  {story.publishDate
                    ? ` · ${new Date(story.publishDate).toLocaleDateString()}`
                    : ""}
                </div>
              </div>
              <StatusBadge status={story.status} />
              <div className="admin-list-actions">
                <Link className="btn btn-sm" href={`/admin/stories/${story._id}/edit`}>
                  Edit
                </Link>
                <Link
                  className="btn btn-sm"
                  href={`/stories/${story.slug}${story.status === "published" ? "" : `?previewId=${story._id}`}`}
                  target="_blank"
                >
                  View
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
