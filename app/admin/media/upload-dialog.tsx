"use client";

import { useRef, useState } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";

import type { MediaAssetSummary } from "./media-shared";

/**
 * Bulk upload dialog.
 *
 * Files are queued and uploaded a few at a time rather than in one giant
 * request, so an arbitrarily large batch works, each file reports its own
 * status, and one rejected file never fails the rest.
 */

const CONCURRENCY = 3;

type QueueItem = {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
};

let queueCounter = 0;

export function UploadDialog({
  open,
  onClose,
  onUploaded,
  defaultFolder = "media",
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (assets: MediaAssetSummary[]) => void;
  /** Where the files land, e.g. `collections` when uploading into one. */
  defaultFolder?: string;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [folder, setFolder] = useState(defaultFolder);
  const [isNsfw, setIsNsfw] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const items = Array.from(files).map<QueueItem>((file) => ({
      id: `q-${++queueCounter}`,
      file,
      status: "pending",
    }));
    if (items.length > 0) setQueue((current) => [...current, ...items]);
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function uploadOne(item: QueueItem): Promise<MediaAssetSummary[]> {
    updateItem(item.id, { status: "uploading" });

    const body = new FormData();
    body.append("files", item.file);
    body.append("folder", folder);
    if (isNsfw) body.append("isNsfw", "true");

    try {
      const response = await fetch("/api/admin/media", { method: "POST", body });
      const result = await response.json();

      if (!response.ok) {
        updateItem(item.id, { status: "error", error: result.error ?? "Upload failed." });
        return [];
      }

      updateItem(item.id, { status: "done" });
      return result.assets ?? [];
    } catch {
      updateItem(item.id, { status: "error", error: "Upload failed." });
      return [];
    }
  }

  async function startUpload() {
    setError("");

    // A YouTube/Vimeo link registers an embed and needs no file at all.
    if (externalUrl.trim()) {
      const body = new FormData();
      body.append("externalUrl", externalUrl.trim());
      const response = await fetch("/api/admin/media", { method: "POST", body });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Could not register that link.");
        return;
      }
      setExternalUrl("");
      onUploaded(result.asset ? [result.asset] : []);
      return;
    }

    const pending = queue.filter((item) => item.status === "pending");
    if (pending.length === 0) {
      setError("Add some files first.");
      return;
    }

    setBusy(true);
    const uploaded: MediaAssetSummary[] = [];

    // A small worker pool keeps a large batch from opening hundreds of
    // simultaneous requests.
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        uploaded.push(...(await uploadOne(item)));
      }
    });

    await Promise.all(workers);
    setBusy(false);
    onUploaded(uploaded);
  }

  if (!open) return null;

  const done = queue.filter((item) => item.status === "done").length;
  const failed = queue.filter((item) => item.status === "error").length;
  const progress = queue.length > 0 ? Math.round(((done + failed) / queue.length) * 100) : 0;

  return (
    <ModalPortal>
      <div className="style-modal-backdrop" onClick={busy ? undefined : onClose}>
        <div className="style-modal" onClick={(event) => event.stopPropagation()}>
          <div className="style-modal-header">
            <strong>Upload media</strong>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginLeft: "auto" }}
              disabled={busy}
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="style-modal-body">
            {error ? <div className="admin-notice is-error">{error}</div> : null}

            <div
              className={`dropzone${dragging ? " is-dragging" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                addFiles(event.dataTransfer.files);
              }}
            >
              <strong style={{ display: "block", marginBottom: "0.35rem" }}>
                Drop files here, or click to choose
              </strong>
              <span className="help-text">
                Any number of files. JPG, PNG, SVG, WebP, GIF, MP4, MP3 or WAV — up to
                100 MB each.
              </span>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              className="visually-hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                // Reset so choosing the same file twice still fires a change.
                event.target.value = "";
              }}
            />

            {queue.length > 0 ? (
              <>
                <ul className="upload-queue">
                  {queue.map((item) => (
                    <li key={item.id}>
                      <span className="name">{item.file.name}</span>
                      <span
                        className={`upload-status${
                          item.status === "done"
                            ? " is-done"
                            : item.status === "error"
                              ? " is-error"
                              : ""
                        }`}
                      >
                        {item.status === "error" ? item.error : item.status}
                      </span>
                      {item.status === "pending" && !busy ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() =>
                            setQueue((current) => current.filter((entry) => entry.id !== item.id))
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>

                <div className="upload-progress">
                  <span style={{ width: `${progress}%` }} />
                </div>
                <p className="help-text" style={{ marginTop: "0.35rem" }}>
                  {done} uploaded{failed > 0 ? `, ${failed} failed` : ""} of {queue.length}
                </p>
              </>
            ) : null}

            <div className="field-grid" style={{ marginTop: "1rem" }}>
              <div className="field">
                <label>Folder</label>
                <select value={folder} onChange={(event) => setFolder(event.target.value)}>
                  <option value="media">media</option>
                  <option value="publications">publications</option>
                  <option value="collections">collections</option>
                  <option value="bios">bios</option>
                </select>
              </div>
              <div className="field">
                <label>YouTube or Vimeo link</label>
                <input
                  type="url"
                  placeholder="https://youtu.be/…"
                  value={externalUrl}
                  onChange={(event) => setExternalUrl(event.target.value)}
                />
                <span className="help-text">Registers an embed instead of uploading.</span>
              </div>
            </div>

            {NSFW_FEATURES_ENABLED ? (
              <label className="checkbox-row" style={{ marginTop: "0.6rem" }}>
                <input
                  type="checkbox"
                  checked={isNsfw}
                  onChange={(event) => setIsNsfw(event.target.checked)}
                />
                Mark everything in this batch as sensitive (NSFW)
              </label>
            ) : null}
          </div>

          <div className="style-modal-footer">
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || queue.length === 0}
              onClick={() => setQueue([])}
            >
              Clear list
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ marginLeft: "auto" }}
              disabled={busy}
              onClick={startUpload}
            >
              {busy ? `Uploading… ${progress}%` : "Upload"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
