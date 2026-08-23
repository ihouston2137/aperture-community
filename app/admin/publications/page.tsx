import Link from "next/link";

import { AdminHeader, Panel, StatusBadge } from "@/components/admin-ui";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Zine } from "@/lib/models";
import { publicationHref, PUBLICATION_KINDS } from "@/lib/publication-layout";

import {
  createFromTemplateAction,
  createPublicationAction,
  deletePublicationAction,
  publishPublicationAction,
  toggleTemplateAction,
} from "./actions";

export const metadata = { title: "Publications" };

export default async function PublicationsPage() {
  await requirePermission("publications.manage");
  await connectDB();

  const all = await Zine.find().sort({ updatedAt: -1 }).lean<any[]>();
  // Templates are starting points, not work in progress, so they list apart
  // from the publications themselves.
  const templates = all.filter((item) => item.isTemplate);
  const publications = all.filter((item) => !item.isTemplate);

  return (
    <>
      <AdminHeader
        title="Publications"
        subtitle="Zines, presentations and social posts built on a fixed canvas."
      />

      <Panel title="Create a publication">
        <form action={createPublicationAction}>
          <div className="field-grid">
            <div className="field">
              <label>Title</label>
              <input type="text" name="title" required />
            </div>
            <div className="field">
              <label>Kind</label>
              <select name="kind" defaultValue="zine">
                {PUBLICATION_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
            Create
          </button>
        </form>
      </Panel>

      {templates.length > 0 ? (
        <Panel title="Start from a template">
          <form action={createFromTemplateAction}>
            <div className="field-grid">
              <div className="field">
                <label>Title</label>
                <input type="text" name="title" required />
              </div>
              <div className="field">
                <label>Template</label>
                <select name="templateId" defaultValue={String(templates[0]._id)}>
                  {templates.map((template) => (
                    <option key={String(template._id)} value={String(template._id)}>
                      {template.title} ({template.kind})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ marginTop: "0.75rem" }}>
              Create from template
            </button>
          </form>
        </Panel>
      ) : null}

      {templates.length > 0 ? (
        <Panel title="Templates">
          <ul className="admin-list">
            {templates.map((template) => (
              <li key={String(template._id)} className="admin-list-item">
                <div>
                  <h3>{template.title}</h3>
                  <div className="admin-list-meta">{template.kind} · template</div>
                </div>
                <div className="admin-list-actions">
                  <Link
                    href={`/admin/publications/${template._id}/edit`}
                    className="btn btn-sm"
                  >
                    Edit
                  </Link>
                  <form action={toggleTemplateAction}>
                    <input type="hidden" name="id" value={String(template._id)} />
                    <button type="submit" className="btn btn-sm">
                      Stop being a template
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <ul className="admin-list">
        {publications.map((publication) => (
          <li key={String(publication._id)} className="admin-list-item">
            <div>
              <h3>{publication.title}</h3>
              <div className="admin-list-meta">
                {publication.kind} · {publicationHref(publication.kind, publication.slug)}
              </div>
            </div>
            <StatusBadge status={publication.status} />
            <div className="admin-list-actions">
              <Link className="btn btn-sm" href={`/admin/publications/${publication._id}/edit`}>
                Edit
              </Link>
              <Link
                className="btn btn-sm"
                href={`/admin/publications/${publication._id}/preview`}
                target="_blank"
              >
                Preview
              </Link>
              <form action={publishPublicationAction}>
                <input type="hidden" name="id" value={String(publication._id)} />
                <button type="submit" className="btn btn-sm">
                  {publication.status === "published" ? "Unpublish" : "Publish"}
                </button>
              </form>
              <form action={toggleTemplateAction}>
                <input type="hidden" name="id" value={String(publication._id)} />
                <button type="submit" className="btn btn-sm" title="Keep this as a starting point for new publications">
                  Save as template
                </button>
              </form>
              <form action={deletePublicationAction}>
                <input type="hidden" name="id" value={String(publication._id)} />
                <button type="submit" className="btn btn-danger btn-sm">
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
        {publications.length === 0 ? (
          <li className="admin-subtitle">No publications yet.</li>
        ) : null}
      </ul>
    </>
  );
}
