"use client";

import { useEffect, useState } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { mediaTypeForPath } from "@/lib/upload-kinds";

export type SubmittedField = {
  id: string;
  name?: string;
  label?: string;
  type?: string;
  value: unknown;
};

export type SubmissionRecord = {
  _id: string;
  formId: string;
  formTitle: string;
  status: string;
  createdAt: string;
  fields: SubmittedField[];
};

export type FormSummary = {
  _id: string;
  title: string;
  /** The fields this form's rows show, in order, resolved on the server. */
  columns: { id: string; label: string }[];
  /** Field ids the opened entry shows, in order. Empty means all of them. */
  layoutOrder: string[];
};

const STATUSES = ["new", "read", "archived"] as const;

/** A submitted value in full: files as links, choices as a list. */
function renderValue(value: unknown, type?: string) {
  // A checkbox group also answers with a list, so which kind of list this is
  // comes from the field's type rather than from the value's shape.
  if (Array.isArray(value) && type === "checkboxGroup") {
    return value.length === 0 ? (
      <span className="help-text">nothing ticked</span>
    ) : (
      <ul className="submission-choices">
        {value.map((item) => (
          <li key={String(item)}>{String(item)}</li>
        ))}
      </ul>
    );
  }

  // Otherwise an array is a file field: the URLs of whatever was attached.
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

/**
 * The same value as one line of a row.
 *
 * A cell is a glance, not a reading: three files become "3 files" and a long
 * answer is cut off by the column rather than setting the row three lines
 * tall. Whatever is lost here is a click away in the entry itself.
 */
function cellText(value: unknown, type?: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (type === "checkboxGroup") return value.map(String).join(", ");
    return `${value.length} file${value.length === 1 ? "" : "s"}`;
  }
  return String(value ?? "");
}

/** One form's submissions, as rows. The whole entry is a click away. */
export function SubmissionsList({
  form,
  submissions,
}: {
  form: FormSummary;
  submissions: SubmissionRecord[];
}) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [items, setItems] = useState(submissions);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const visible = items.filter(
    (submission) => statusFilter === "all" || submission.status === statusFilter
  );

  const open = items.find((submission) => submission._id === openId) ?? null;

  // Escape closes the entry, as it does in every other dialog here.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function setStatus(id: string, status: string) {
    // Shown as done straight away: the figure it feeds is a rough count of
    // what is left to read, and a row that flickers back on a slow round trip
    // is worse than one that is briefly optimistic.
    setItems((current) =>
      current.map((entry) => (entry._id === id ? { ...entry, status } : entry))
    );

    const response = await fetch(`/api/admin/forms/submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) setError("The status could not be saved.");
  }

  /** Opening an entry is reading it, so a new one stops being new. */
  function openEntry(submission: SubmissionRecord) {
    setOpenId(submission._id);
    if (submission.status === "new") setStatus(submission._id, "read");
  }

  async function remove(id: string) {
    setError("");
    const response = await fetch(`/api/admin/forms/submissions/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error ?? "Delete failed.");
      return;
    }
    setItems((current) => current.filter((submission) => submission._id !== id));
    setOpenId((current) => (current === id ? null : current));
  }

  return (
    <>
      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div style={{ display: "flex", gap: "0.625rem", marginBottom: "1rem", flexWrap: "wrap" }}>
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
        <p className="admin-subtitle">
          {items.length === 0
            ? "No submissions yet."
            : "No submissions match this filter."}
        </p>
      ) : (
        <div className="submission-rows">
          <table className="admin-table">
            <thead>
              <tr>
                {form.columns.map((column) => (
                  <th key={column.id}>{column.label}</th>
                ))}
                {form.columns.length === 0 ? <th>Submission</th> : null}
                <th>Received</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((submission) => (
                <tr
                  key={submission._id}
                  className={`is-openable${submission.status === "new" ? " is-unread" : ""}`}
                  onClick={() => openEntry(submission)}
                >
                  {form.columns.map((column, index) => {
                    const field = submission.fields.find((entry) => entry.id === column.id);
                    const text = cellText(field?.value, field?.type);

                    // The first cell holds the control, so the row is
                    // reachable by keyboard and not only by pointer.
                    return (
                      <td key={column.id}>
                        {index === 0 ? (
                          <button
                            type="button"
                            className="link-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEntry(submission);
                            }}
                          >
                            {text || "Open"}
                          </button>
                        ) : (
                          text
                        )}
                      </td>
                    );
                  })}

                  {form.columns.length === 0 ? (
                    <td>
                      <button
                        type="button"
                        className="link-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEntry(submission);
                        }}
                      >
                        Open
                      </button>
                    </td>
                  ) : null}

                  <td>{new Date(submission.createdAt).toLocaleString()}</td>
                  <td>
                    <span className="badge">{submission.status}</span>
                  </td>
                  <td className="is-narrow">
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        remove(submission._id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <SubmissionDialog
          submission={open}
          layoutOrder={form.layoutOrder}
          onClose={() => setOpenId(null)}
          onStatus={(status) => setStatus(open._id, status)}
          onDelete={() => remove(open._id)}
        />
      ) : null}
    </>
  );
}

/** The whole entry, as sent. */
function SubmissionDialog({
  submission,
  layoutOrder,
  onClose,
  onStatus,
  onDelete,
}: {
  submission: SubmissionRecord;
  layoutOrder: string[];
  onClose: () => void;
  onStatus: (status: string) => void;
  onDelete: () => void;
}) {
  // The configured order first, then anything added to the form since — a
  // field nobody has placed is still an answer somebody gave.
  const ordered = [
    ...layoutOrder
      .map((id) => submission.fields.find((field) => field.id === id))
      .filter(Boolean),
    ...submission.fields.filter((field) => !layoutOrder.includes(field.id)),
  ] as SubmittedField[];

  return (
    <ModalPortal>
      <div className="style-modal-backdrop" onClick={onClose}>
        <div
          className="style-modal is-wide"
          role="dialog"
          aria-modal="true"
          aria-label={`Submission to ${submission.formTitle}`}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="style-modal-header">
            <div style={{ minWidth: 0 }}>
              <h2 className="panel-title" style={{ margin: 0 }}>
                {submission.formTitle}
              </h2>
              <span className="admin-list-meta">
                {new Date(submission.createdAt).toLocaleString()}
              </span>
            </div>

            <select
              className="input"
              aria-label="Status"
              style={{ marginLeft: "auto", maxWidth: "9rem" }}
              value={submission.status}
              onChange={(event) => onStatus(event.target.value)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <div className="style-modal-body">
            <table className="admin-table">
              <tbody>
                {ordered.map((field) => (
                  <tr key={field.id}>
                    <th style={{ width: "14rem" }}>{field.label || field.name}</th>
                    <td>{renderValue(field.value, field.type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {ordered.length === 0 ? (
              <p className="admin-subtitle">This submission carried no fields.</p>
            ) : null}
          </div>

          <div className="style-modal-footer">
            <button type="button" className="btn btn-danger" onClick={onDelete}>
              Delete
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: "auto" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
