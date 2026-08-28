"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { parseCsv, type CsvTable } from "@/lib/csv";
import {
  buildDraft,
  draftProblem,
  guessMapping,
  IMPORT_FIELDS,
  type ImportFieldKey,
  type ImportMapping,
  type ImportMode,
  type ImportReport,
} from "@/lib/user-import";

import { importUsersAction } from "./actions";

/** How many rows are shown before importing. Enough to recognise a mistake. */
const PREVIEW_ROWS = 5;

/**
 * Accounts in bulk, from somebody else's export.
 *
 * The mapping screen is the point of it. Every system names these columns
 * differently, and an import that guessed would write the wrong thing into
 * every record at once — so the guess is made, shown, and left to be corrected
 * before anything is written. The preview under it is the same code the server
 * will run, so what is read here is what will happen.
 *
 * Nothing is sent to anybody: no verification codes, no welcomes, no
 * new-registration notices. An import is a records exercise.
 */
export function ImportUsersButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        Import CSV
      </button>

      {open ? (
        <ImportDialog
          onClose={() => setOpen(false)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function ImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<ImportMapping>({});
  const [mode, setMode] = useState<ImportMode>("skip");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  async function choose(chosen: File | null) {
    setError("");
    setReport(null);
    setFile(chosen);

    if (!chosen) {
      setTable(null);
      return;
    }

    const parsed = parseCsv(await chosen.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) {
      setTable(null);
      setError("That file has no rows to read.");
      return;
    }

    setTable(parsed);
    setMapping(guessMapping(parsed.headers));
  }

  function submit() {
    if (!file) return;
    setError("");

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("mapping", JSON.stringify(mapping));
      formData.set("mode", mode);

      const result = await importUsersAction(formData);
      if (result.ok && result.report) {
        setReport(result.report);
        onDone();
      } else {
        setError(result.error ?? "Could not import that file.");
      }
    });
  }

  // The same reading the server will take, so nothing on screen is a guess at
  // what the import is about to do.
  const drafts = table
    ? table.rows
        .slice(0, PREVIEW_ROWS)
        .map((row) => buildDraft(row, table.headers, mapping))
    : [];
  const readable = table
    ? table.rows.filter(
        (row) => !draftProblem(buildDraft(row, table.headers, mapping))
      ).length
    : 0;

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal is-wide"
          role="dialog"
          aria-modal="true"
          aria-label="Import users"
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <div className="style-modal-form">
            <div className="style-modal-header">
              <strong>Import users</strong>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="style-modal-body">
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              {report ? (
                <ImportSummary report={report} />
              ) : (
                <>
                  <div className="field">
                    <label htmlFor="import-file">CSV file</label>
                    <input
                      id="import-file"
                      type="file"
                      accept=".csv,text/csv"
                      disabled={pending}
                      onChange={(event) =>
                        choose(event.target.files?.[0] ?? null)
                      }
                    />
                    <span className="help-text">
                      Nobody is emailed. No verification codes, no welcomes, no
                      new-registration notices — an import is a records
                      exercise.
                    </span>
                  </div>

                  {table ? (
                    <>
                      <p className="help-text">
                        {table.rows.length} row
                        {table.rows.length === 1 ? "" : "s"} and{" "}
                        {table.headers.length} column
                        {table.headers.length === 1 ? "" : "s"}.{" "}
                        {readable === table.rows.length
                          ? "All of them can be read."
                          : `${readable} can be read as an account with the mapping below.`}
                      </p>

                      <h4 className="inspector-title">Columns</h4>
                      <p className="help-text">
                        Guessed from the column names. Check them — this decides
                        what is written into every record.
                      </p>

                      <div className="import-map">
                        {IMPORT_FIELDS.map((field) => (
                          <div key={field.key} className="field">
                            <label htmlFor={`map-${field.key}`}>
                              {field.label}
                              {field.required ? " *" : ""}
                            </label>
                            <select
                              id={`map-${field.key}`}
                              value={mapping[field.key] ?? ""}
                              disabled={pending}
                              onChange={(event) =>
                                setMapping((current) => ({
                                  ...current,
                                  [field.key as ImportFieldKey]:
                                    event.target.value || undefined,
                                }))
                              }
                            >
                              <option value="">Not imported</option>
                              {table.headers.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </select>
                            {field.help ? (
                              <span className="help-text">{field.help}</span>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      <h4 className="inspector-title">
                        Somebody already on the site
                      </h4>
                      <label className="checkbox-row">
                        <input
                          type="radio"
                          name="import-mode"
                          checked={mode === "skip"}
                          disabled={pending}
                          onChange={() => setMode("skip")}
                        />
                        Leave them as they are
                      </label>
                      <label className="checkbox-row">
                        <input
                          type="radio"
                          name="import-mode"
                          checked={mode === "update"}
                          disabled={pending}
                          onChange={() => setMode("update")}
                        />
                        Update them from the file
                      </label>
                      <span className="help-text">
                        Matched on the email address. Your own account is never
                        changed by an import.
                      </span>

                      <h4 className="inspector-title">
                        The first {Math.min(PREVIEW_ROWS, table.rows.length)} as
                        they will be read
                      </h4>
                      <div className="import-preview">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Email</th>
                              <th>Name</th>
                              <th>Phone</th>
                              <th>Roles</th>
                              <th>Status</th>
                              <th>Password</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drafts.map((draft, index) => {
                              const problem = draftProblem(draft);
                              return (
                                <tr key={index}>
                                  <td>{draft.email || "—"}</td>
                                  <td>
                                    {draft.name || "—"}
                                    {problem ? (
                                      <span className="help-text">{problem}</span>
                                    ) : null}
                                  </td>
                                  <td>{draft.phone || "—"}</td>
                                  <td>{draft.roleNames.join(", ") || "—"}</td>
                                  <td>
                                    {draft.membershipStatus}
                                    {draft.isActive ? "" : ", inactive"}
                                    {draft.emailVerified ? ", verified" : ""}
                                  </td>
                                  <td>
                                    {draft.passwordHash ? "carried over" : "unusable"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </>
              )}
            </div>

            <div className="style-modal-footer">
              {report ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginLeft: "auto" }}
                  onClick={onClose}
                >
                  Done
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginLeft: "auto" }}
                  disabled={pending || !table || readable === 0}
                  onClick={submit}
                >
                  {pending
                    ? "Importing…"
                    : `Import ${readable} account${readable === 1 ? "" : "s"}`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** What the import did, once it has done it. */
function ImportSummary({ report }: { report: ImportReport }) {
  return (
    <>
      <div className="report-figures">
        <span className="report-figure">
          <strong>{report.created}</strong>
          <span className="help-text">created</span>
        </span>
        <span className="report-figure">
          <strong>{report.updated}</strong>
          <span className="help-text">updated</span>
        </span>
        <span className="report-figure">
          <strong>{report.skipped}</strong>
          <span className="help-text">already on the site, left alone</span>
        </span>
        <span
          className={`report-figure${
            report.problems.length > 0 ? " is-flagged" : ""
          }`}
        >
          <strong>{report.problems.length}</strong>
          <span className="help-text">rows that could not be read</span>
        </span>
      </div>

      {report.unknownRoles.length > 0 ? (
        <p className="admin-notice is-error">
          No role on this site is named{" "}
          {report.unknownRoles.map((name) => `"${name}"`).join(", ")}. Accounts
          carrying it were imported without it — add the role and import again
          to attach it.
        </p>
      ) : null}

      {report.problems.length > 0 ? (
        <>
          <h4 className="inspector-title">Rows left out</h4>
          <ul className="admin-list">
            {report.problems.map((problem) => (
              <li key={problem.row} className="admin-list-item">
                <div>
                  <strong>Row {problem.row}</strong>
                  <div className="admin-list-meta">{problem.message}</div>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="help-text">
        Accounts imported without a password from the file cannot be signed into
        until somebody sets one on the account. Nobody was emailed.
      </p>
    </>
  );
}
