import Link from "next/link";

import { AdminHeader, Panel, StatusBadge } from "@/components/admin-ui";
import { checkPermission, requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Zine } from "@/lib/models";
import { getSession } from "@/lib/session";
import {
  NOT_DELETED,
  publicationHref,
  PUBLICATION_KINDS,
} from "@/lib/publication-layout";

import {
  createFromTemplateAction,
  createPublicationAction,
  deletePublicationAction,
  publishPublicationAction,
  purgePublicationAction,
  restorePublicationAction,
  toggleTemplateAction,
} from "./actions";

export const metadata = { title: "Publications" };

export default async function PublicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ purge?: string; id?: string }>;
}) {
  await requirePermission("publications.manage");
  const { purge, id: purgeId } = await searchParams;
  await connectDB();

  // Removing for good is its own permission, so the controls for it only
  // appear for somebody who has it.
  const canPurge = await checkPermission(await getSession(), "publications.purge");

  const all = await Zine.find(NOT_DELETED).sort({ updatedAt: -1 }).lean<any[]>();
  // The bin, newest first: what was deleted last is what somebody is most
  // likely to have deleted by mistake.
  const binned = await Zine.find({ deletedAt: { $ne: null } })
    .sort({ deletedAt: -1 })
    .lean<any[]>();
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
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                  title="Move to the bin — it can be put back"
                >
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

      {/*
        The bin.
        Deleting is reversible and this is where it is reversed. Nothing here
        is served, listed or editable, but all of it is whole. Removing one for
        good is a separate act, needs its own permission, and asks for the
        publication to be named — see `purgePublicationAction`.
      */}
      {binned.length > 0 ? (
        <div id="bin">
        <Panel title={`Deleted (${binned.length})`}>
          <p className="help-text" style={{ marginTop: 0 }}>
            Deleted publications are kept whole and can be put back. They are
            not listed anywhere else and are not served to readers.
            {canPurge
              ? " Removing one for good cannot be undone."
              : " Removing one for good needs a further permission."}
          </p>

          <ul className="admin-list">
            {binned.map((publication) => (
              <li key={String(publication._id)} className="admin-list-row">
                <div>
                  <strong>{publication.title}</strong>
                  <div className="admin-subtitle">
                    {publication.kind} · {publication.slug}
                    {publication.deletedAt
                      ? ` · deleted ${new Date(publication.deletedAt).toLocaleDateString()}`
                      : ""}
                    {publication.deletedBy ? ` by ${publication.deletedBy}` : ""}
                  </div>
                  {purge === "mismatch" && purgeId === String(publication._id) ? (
                    <div className="admin-subtitle" role="alert">
                      That was not the right slug, so nothing was removed.
                    </div>
                  ) : null}
                </div>

                <div className="admin-list-actions">
                  <form action={restorePublicationAction}>
                    <input type="hidden" name="id" value={String(publication._id)} />
                    <button type="submit" className="btn btn-sm">
                      Put back
                    </button>
                  </form>

                  {canPurge ? (
                    /* The slug has to be typed: naming the thing being
                       destroyed is a different act from confirming a prompt. */
                    <form action={purgePublicationAction} className="admin-list-actions">
                      <input type="hidden" name="id" value={String(publication._id)} />
                      <input
                        type="text"
                        name="confirm"
                        className="input"
                        style={{ maxWidth: "11rem" }}
                        placeholder={`Type ${publication.slug}`}
                        aria-label={`Type ${publication.slug} to remove it for good`}
                        autoComplete="off"
                      />
                      <button type="submit" className="btn btn-danger btn-sm">
                        Remove for good
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        </div>
      ) : null}
    </>
  );
}
