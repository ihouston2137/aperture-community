"use client";

import { useState } from "react";

import { protectedMediaUrl } from "@/lib/protected-media-url";
import { mediaTypeForPath } from "@/lib/upload-kinds";

export type SubmissionRecord = {
  _id: string;
  formId: string;
  formTitle: string;
  status: string;
  createdAt: string;
  fields: { id: string; name?: string; label?: string; type?: string; value: unknown }[];
  /** Field ids, in the order configured on the submission-layout page. */
  layoutOrder: string[];
};

function renderValue(value: unknown) {
  // An array is a file field: the URLs of whatever was attached.
  if (Array.isArray(value)) {
    return (
      <ul className="submission-files">
        {value.map((item) => {
          const url = String(item);
          const src = protectedMediaUrl(url);
          const type = mediaTypeForPath(url);

          return (
            <li key={url}>
              <a href={src} target="_blank" rel="noreferrer" title={url.split("/").pop()}>
                {type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" loading="lazy" />
                ) : type === "video" ? (
                  // Enough for a first frame without fetching the whole file.
                  <video src={src} preload="metadata" muted />
                ) : null}
                <span>{url.split("/").pop()}</span>
              </a>
            </li>
          );
        })}
      </ul>
    );
  }
  return <span>{String(value ?? "")}</span>;
}

export function SubmissionsList({
  submissions,
  forms,
}: {
  submissions: SubmissionRecord[];
  forms: { _id: string; title: string }[];
}) {
  const [formFilter, setFormFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [items, setItems] = useState(submissions);
  const [error, setError] = useState("");

  const visible = items.filter((submission) => {
    if (formFilter !== "all" && submission.formId !== formFilter) return false;
    if (statusFilter !== "all" && submission.status !== statusFilter) return false;
    return true;
  });

  async function remove(id: string) {
    setError("");
    const response = await fetch(`/api/admin/forms/submissions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? "Delete failed.");
      return;
    }
    setItems((current) => current.filter((submission) => submission._id !== id));
  }

  return (
    <>
      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div style={{ display: "flex", gap: "0.625rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <select
          className="input"
          style={{ maxWidth: "16rem" }}
          value={formFilter}
          onChange={(event) => setFormFilter(event.target.value)}
        >
          <option value="all">All forms</option>
          {forms.map((form) => (
            <option key={form._id} value={form._id}>
              {form.title}
            </option>
          ))}
        </select>
        <select
          className="input"
          style={{ maxWidth: "10rem" }}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="read">Read</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="admin-subtitle">No submissions match these filters.</p>
      ) : null}

      {visible.map((submission) => {
        // Respect the configured display order, then anything not listed.
        const ordered = [
          ...submission.layoutOrder
            .map((id) => submission.fields.find((field) => field.id === id))
            .filter(Boolean),
          ...submission.fields.filter((field) => !submission.layoutOrder.includes(field.id)),
        ] as SubmissionRecord["fields"];

        return (
          <section key={submission._id} className="panel">
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <h2 className="panel-title" style={{ margin: 0 }}>
                {submission.formTitle}
              </h2>
              <span className="badge">{submission.status}</span>
              <span className="admin-list-meta">
                {new Date(submission.createdAt).toLocaleString()}
              </span>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                style={{ marginLeft: "auto" }}
                onClick={() => remove(submission._id)}
              >
                Delete
              </button>
            </div>

            <table className="admin-table" style={{ marginTop: "0.75rem" }}>
              <tbody>
                {ordered.map((field) => (
                  <tr key={field.id}>
                    <th style={{ width: "14rem" }}>{field.label || field.name}</th>
                    <td>{renderValue(field.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </>
  );
}
