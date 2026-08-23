import Link from "next/link";

import { AdminHeader, EmptyState } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { StoryTemplate } from "@/lib/models";

import { deleteStoryTemplateAction, setDefaultTemplateAction } from "./actions";

export const metadata = { title: "Story templates" };

export default async function StoryTemplatesPage() {
  await requirePermission("storyTemplates.manage");
  await connectDB();

  const templates = await StoryTemplate.find().sort({ name: 1 }).lean<any[]>();

  return (
    <>
      <AdminHeader
        title="Story templates"
        subtitle="Layouts that decide how story fields are arranged on the public site."
        actions={
          <>
            {/* This page is no longer in the left nav; it is reached from
                Stories, so it offers the way back. */}
            <Link href="/admin/stories" className="btn">
              Back to stories
            </Link>
            <Link href="/admin/story-templates/new" className="btn btn-primary">
              New template
            </Link>
          </>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          message="No templates yet — stories fall back to the built-in layout."
          actionHref="/admin/story-templates/new"
          actionLabel="Create a template"
        />
      ) : (
        <ul className="admin-list">
          {templates.map((template) => (
            <li key={String(template._id)} className="admin-list-item">
              <div>
                <h3>{template.name}</h3>
                <div className="admin-list-meta">{template.slug}</div>
              </div>
              {template.isDefault ? <span className="badge">Default</span> : null}
              <div className="admin-list-actions">
                <Link className="btn btn-sm" href={`/admin/story-templates/${template._id}/edit`}>
                  Edit
                </Link>
                {!template.isDefault ? (
                  <form action={setDefaultTemplateAction}>
                    <input type="hidden" name="id" value={String(template._id)} />
                    <button type="submit" className="btn btn-sm">
                      Set as default
                    </button>
                  </form>
                ) : null}
                <form action={deleteStoryTemplateAction}>
                  <input type="hidden" name="id" value={String(template._id)} />
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
