"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Preview = { token: string; changes: { id: string; name: string; attempt: number; status: string; before: number; after: number; recalculated: number; preserved: number; skipped: number; changed: boolean }[] };

export function RegradeSubmissions({ testId }: { testId: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(action: "preview" | "apply") {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/tests/${testId}/regrade`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, token: preview?.token }) });
      const result = await response.json();
      if (!response.ok) { if (response.status === 409) setPreview(null); throw new Error(result.error || "Could not regrade submissions."); }
      if (action === "preview") setPreview(result);
      else {
        setPreview(null);
        setMessage(`${result.updated} submissions reprocessed. Pending submissions remain pending.${result.conflicts ? ` ${result.conflicts} changed during processing; preview again to include them.` : ""}`);
        router.refresh();
      }
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section style={{ marginBottom: "1.25rem" }} aria-label="Regrade submissions">
    <button type="button" className="btn" disabled={busy} onClick={() => run("preview")}>{busy ? "Processing…" : "Regrade submissions"}</button>
    <span role="status" aria-live="polite" style={{ marginLeft: ".75rem" }}>{message}</span>
    {preview && <div className="panel" style={{ marginTop: "1rem" }}>
      <h2 className="panel-title">Preview corrected grades</h2>
      <p>The saved answer key is applied to the original answers and point values. Pending submissions stay pending; their scores below are suggestions. Instructor-awarded points are preserved. No result emails are sent.</p>
      <p className="help-text">Older instructor-reviewed results are preserved when individual overrides cannot be identified. Questions with missing answers or removed variants are skipped.</p>
      <div style={{ overflowX: "auto" }}><table className="admin-table"><thead><tr><th>Name</th><th>Attempt</th><th>Status</th><th>Before</th><th>After</th><th>Recalculated questions</th><th>Preserved</th><th>Skipped</th></tr></thead>
        <tbody>{preview.changes.map(row => <tr key={row.id}><th scope="row">{row.name}</th><td>{row.attempt}</td><td>{row.status === "pending" ? "Pending" : "Graded"}</td><td>{row.before}%</td><td>{row.after}%</td><td>{row.recalculated}</td><td>{row.preserved}</td><td>{row.skipped}</td></tr>)}</tbody>
      </table></div>
      {!preview.changes.length && <p>No submissions to regrade.</p>}
      <div className="admin-list-actions" style={{ marginTop: "1rem" }}>
        <button type="button" className="btn btn-primary" disabled={busy || !preview.changes.some(row => row.changed)} onClick={() => run("apply")}>Apply corrected grades</button>
        <button type="button" className="btn" disabled={busy} onClick={() => setPreview(null)}>Cancel</button>
      </div>
    </div>}
  </section>;
}
