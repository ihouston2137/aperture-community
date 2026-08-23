import Link from "next/link";

import { AdminHeader, EmptyState } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { DocTemplate } from "@/lib/models";

import { deleteDocTemplateAction } from "./actions";

export const metadata = { title: "Doc templates" };

export default async function DocTemplatesPage() {
  await requirePermission("docs.manage");
  await connectDB();

  const templates = await DocTemplate.find().sort({ name: 1 }).lean<any[]>();

  return (
    <>
      <AdminHeader
        title="Doc templates"
        subtitle="Layouts that decide how a document is arranged on the public site."
        actions={
          <>
            <Link href="/admin/docs" className="btn">
              Back to documentation
            </Link>
            <Link href="/admin/docs/templates/new" className="btn btn-primary">
              New template
            </Link>
          </>
        }
      />

      {templates.length === 0 ? (
        <EmptyState
          message="No templates yet — documents fall back to the built-in layout."
          actionHref="/admin/docs/templates/new"
          actionLabel="Create a template"
        />
      ) : (
        <ul className="admin-list">
          {templates.map((template) => (
            <li key={String(template._id)} className="admin-list-item">
              <div>
                <h3>{template.name}</h3>
                <div className="admin-list-meta">/{template.slug}</div>
              </div>
              {template.isDefault ? (
                <span className="badge badge-published">default</span>
              ) : null}
              <div className="admin-list-actions">
                <Link
                  className="btn btn-sm"
                  href={`/admin/docs/templates/${template._id}/edit`}
                >
                  Edit
                </Link>
                <form action={deleteDocTemplateAction}>
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
