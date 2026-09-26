"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Notice, Panel } from "@/components/admin-ui";
import { STATIC_HTML_PREFIXES, staticHtmlSlug } from "@/lib/static-html";

export function StaticHtmlManager({ files }: { files: { slug: string; originalName: string }[] }) {
  const router = useRouter();
  const [prefix, setPrefix] = useState<string>("project");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/static-html", { method: "POST", body: new FormData(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed.");
      form.reset(); setPreview("");
      setMessage(`Published ${result.slug}. All three link prefixes are available.`);
      router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Upload failed."); }
    finally { setBusy(false); }
  }

  async function remove(slug: string) {
    if (!window.confirm(`Delete “${slug}”? All three public links will stop working.`)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/static-html?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete the file.");
      setMessage(`Deleted ${slug}.`); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Delete failed."); }
    finally { setBusy(false); }
  }

  async function copy(path: string) {
    setError(""); setMessage("");
    try { await navigator.clipboard.writeText(new URL(path, window.location.origin).href); setMessage("Link copied."); }
    catch { setError("Could not copy the link. Open it and copy the address from your browser."); }
  }

  return <>
    <div role="status">{message && <Notice>{message}</Notice>}</div>
    <div role="alert">{error && <Notice variant="error">{error}</Notice>}</div>
    <Panel title="Upload HTML">
      <p>Upload a UTF-8 .html or .htm file, up to 5 MB. Include styles, images and scripts inside the file; external resources and network requests are blocked.</p>
      <p>The filename becomes the URL slug: Annual Report.html becomes annual-report. Uploads are public immediately.</p>
      <form onSubmit={upload} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <label>HTML file <input name="file" type="file" accept=".html,.htm,text/html" required disabled={busy} onChange={event => {
          const file = event.target.files?.[0];
          try { setPreview(file ? staticHtmlSlug(file.name) : ""); setError(""); }
          catch (error) { setPreview(""); setError(error instanceof Error ? error.message : "Invalid filename."); }
        }} /></label>
        {preview && <p>Available at /project/{preview}, /report/{preview} and /special/{preview}</p>}
        <div><button className="btn btn-primary" disabled={busy || !preview}>Upload and publish</button></div>
      </form>
    </Panel>
    <Panel title="Published files">
      <label>Share links as <select value={prefix} onChange={event => setPrefix(event.target.value)}>
        {STATIC_HTML_PREFIXES.map(value => <option key={value} value={value}>/{value}/</option>)}
      </select></label>
      <p>All three prefixes always work. Choose the one you want to share.</p>
      {files.length === 0 ? <p>No HTML files uploaded yet.</p> : <ul style={{ listStyle: "none", padding: 0 }}>
        {files.map(file => {
          const path = `/${prefix}/${file.slug}`;
          return <li key={file.slug} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", padding: "1rem 0" }}>
            <span>{file.originalName}</span>
            <a href={path} target="_blank" rel="noopener noreferrer">{path}</a>
            <button className="btn" onClick={() => copy(path)}>Copy link</button>
            <button className="btn" disabled={busy} onClick={() => remove(file.slug)}>Delete</button>
          </li>;
        })}
      </ul>}
    </Panel>
  </>;
}
