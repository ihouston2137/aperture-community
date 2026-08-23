"use client";

import { useEffect, useState } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";

import {
  emptyMediaFilters,
  invalidateMediaOptions,
  loadMediaOptions,
  LoadMore,
  MediaFilterBar,
  MediaGrid,
  useMediaBrowser,
  type MediaAssetSummary,
  type MediaFilters,
  type UsageOption,
} from "./media-shared";

export type { MediaAssetSummary };

function UploadPanel({
  onUploaded,
}: {
  onUploaded: (assets: MediaAssetSummary[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;

    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: new FormData(form),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Upload failed.");
        return;
      }

      form.reset();
      // The API returns `assets` for files and `asset` for a registered embed.
      const created: MediaAssetSummary[] = result.assets ?? (result.asset ? [result.asset] : []);
      onUploaded(created);
      setOpen(false);
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-sm"
        style={{ marginBottom: "1rem" }}
        onClick={() => setOpen(true)}
      >
        Upload…
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="panel"
      style={{ margin: "0 0 1rem", padding: "0.875rem" }}
    >
      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div className="field-grid">
        <div className="field">
          <label>Files</label>
          <input type="file" name="files" multiple />
          <span className="help-text">
            JPG, PNG, SVG, WebP, GIF, MP4, MP3 or WAV — up to 100 MB each.
          </span>
        </div>
        <div className="field">
          <label>Folder</label>
          <select name="folder" defaultValue="media">
            <option value="media">media</option>
            <option value="publications">publications</option>
            <option value="collections">collections</option>
            <option value="bios">bios</option>
          </select>
        </div>
        <div className="field">
          <label>YouTube or Vimeo link</label>
          <input type="url" name="externalUrl" placeholder="https://youtu.be/…" />
          <span className="help-text">Registers an embed instead of uploading.</span>
        </div>
      </div>

      {NSFW_FEATURES_ENABLED ? (
        <label className="checkbox-row" style={{ marginTop: "0.6rem" }}>
          <input type="checkbox" name="isNsfw" value="true" />
          Mark as sensitive (NSFW)
        </label>
      ) : null}

      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.75rem" }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? "Uploading…" : "Upload"}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function MediaPicker({
  open,
  mediaType,
  onSelect,
  onClose,
}: {
  open: boolean;
  /** Restrict the list, e.g. `image` for an image block. */
  mediaType?: "image" | "video" | "audio" | "file";
  onSelect: (asset: MediaAssetSummary) => void;
  onClose: () => void;
}) {
  const [filters, setFilters] = useState<MediaFilters>(emptyMediaFilters);
  const [usageOptions, setUsageOptions] = useState<UsageOption[]>([]);

  // Only fetches while the popup is open, so an inspector full of MediaFields
  // does not issue one request per field on mount.
  const { assets, total, hasMore, loading, loadMore, reload } = useMediaBrowser(
    filters,
    mediaType,
    open
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadMediaOptions().then((options) => {
      if (!cancelled) setUsageOptions(options.usageOptions ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div className="style-modal-backdrop" onClick={onClose}>
        <div className="style-modal" onClick={(event) => event.stopPropagation()}>
          <div className="style-modal-header">
            <strong>Choose media</strong>
            <button
              type="button"
              className="btn btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <div className="style-modal-body">
            <UploadPanel
              onUploaded={(created) => {
                invalidateMediaOptions();
                reload();

                // Uploading a single file is almost always "add this and use it",
                // so pick it straight away. Batches stay in the grid to choose from.
                if (created.length === 1) {
                  onSelect(created[0]);
                  onClose();
                }
              }}
            />

            <MediaFilterBar
              filters={filters}
              onChange={setFilters}
              usageOptions={usageOptions}
              lockedType={mediaType}
            />

            {loading && assets.length === 0 ? (
              <p className="admin-subtitle">Loading…</p>
            ) : null}
            {!loading && assets.length === 0 ? (
              <p className="admin-subtitle">
                Nothing matches these filters. Upload a file above, or widen the search.
              </p>
            ) : null}

            <MediaGrid
              assets={assets}
              onSelect={(asset) => {
                onSelect(asset);
                onClose();
              }}
            />

            <LoadMore
              hasMore={hasMore}
              loading={loading}
              shown={assets.length}
              total={total}
              onLoadMore={loadMore}
            />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Small inline control: preview + choose/clear, used across every builder. */
export function MediaField({
  label,
  value,
  mediaType,
  onChange,
}: {
  label: string;
  value: string;
  mediaType?: "image" | "video" | "audio" | "file";
  onChange: (url: string, asset?: MediaAssetSummary) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="field">
      <label>{label}</label>
      {value ? (
        <div style={{ marginBottom: "0.35rem" }}>
          {mediaType === "video" ? (
            <video
              src={protectedMediaUrl(value)}
              style={{ width: "100%", maxHeight: "8rem" }}
              muted
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={protectedMediaUrl(value)}
              alt=""
              loading="lazy"
              style={{ width: "100%", maxHeight: "8rem", objectFit: "contain" }}
            />
          )}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          {value ? "Replace" : "Choose"}
        </button>
        {value ? (
          <button type="button" className="btn btn-sm" onClick={() => onChange("")}>
            Clear
          </button>
        ) : null}
      </div>

      <MediaPicker
        open={open}
        mediaType={mediaType}
        onClose={() => setOpen(false)}
        onSelect={(asset) =>
          onChange(asset.provider === "local" ? asset.url : asset.embedUrl ?? asset.url, asset)
        }
      />
    </div>
  );
}
