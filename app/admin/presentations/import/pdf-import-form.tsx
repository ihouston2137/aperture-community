"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useUnsavedChanges } from "@/components/admin/editor-save";

export function PdfImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const allowNavigation = useUnsavedChanges(busy);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !file) return;
    if (file.size > 50 * 1024 * 1024) { setError("Choose a PDF smaller than 50 MB."); return; }
    inFlight.current = true;
    setBusy(true);
    setError("");
    const data = new FormData();
    data.set("pdf", file);
    data.set("title", title);
    try {
      const response = await fetch("/api/admin/presentations/import", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok || !result.id) throw new Error(result.error || "The PDF could not be imported.");
      allowNavigation();
      router.push(`/admin/presentations/${result.id}/edit`);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The PDF could not be imported. Please try again.");
      setBusy(false);
      inFlight.current = false;
    }
  }

  return <form onSubmit={submit} className="admin-panel pdf-import-form" aria-busy={busy}>
    <p>Each PDF page becomes a high-resolution image on its own slide. You can add text, icons, and other blocks over it. Text and artwork inside the PDF remain part of the page image.</p>
    <p>The presentation opens as a unpublished draft. PDFs with different page sizes fit within the first page’s slide size without cropping.</p>
    <label className="field">PDF file
      <input type="file" aria-label="PDF file" aria-describedby="pdf-file-help" accept="application/pdf,.pdf" required disabled={busy} onChange={(event) => {
        const selected = event.target.files?.[0] ?? null;
        setFile(selected);
        setTitle(selected?.name.replace(/\.pdf$/i, "").slice(0, 200) ?? "");
        setError("");
      }} />
      <span id="pdf-file-help" className="help-text">Up to 50 MB and 200 pages. Use an unlocked PDF.</span>
    </label>
    <label className="field">Presentation title
      <input type="text" value={title} maxLength={200} required disabled={busy} onChange={(event) => setTitle(event.target.value)} />
    </label>
    {error && <p role="alert" className="admin-notice is-error">{error}</p>}
    {busy && <p role="status">Importing PDF pages… This may take a few minutes for a large document.</p>}
    <button className="btn btn-primary" type="submit" disabled={busy || !file || !title.trim()}>{busy ? "Importing…" : "Import PDF"}</button>
  </form>;
}
