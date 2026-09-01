"use client";

import { useEffect, useState } from "react";

import { ModalPortal } from "@/components/modal-portal";
import { protectedMediaUrl } from "@/lib/protected-media-url";

import { MediaDetailsFields, type AssetDetail, type Bio } from "./media-inspector";
import { invalidateMediaOptions, loadMediaOptions } from "./media-shared";

/**
 * Edits a file's own metadata from wherever it is placed.
 *
 * Descriptions and captions belong to the asset, not to the story using it, so
 * the story editor changes them here rather than keeping a second copy. The
 * fields are the media library's, so both screens stay in step.
 */
export function MediaDetailsDialog({
  mediaId,
  onClose,
  onSaved,
}: {
  /** `null` keeps the dialog closed. */
  mediaId: string | null;
  onClose: () => void;
  onSaved?: (asset: AssetDetail) => void;
}) {
  if (!mediaId) return null;
  // Keyed so opening a different file remounts with empty state, rather than
  // clearing the previous file's fields from inside an effect.
  return (
    <DetailsBody key={mediaId} mediaId={mediaId} onClose={onClose} onSaved={onSaved} />
  );
}

function DetailsBody({
  mediaId,
  onClose,
  onSaved,
}: {
  mediaId: string;
  onClose: () => void;
  onSaved?: (asset: AssetDetail) => void;
}) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [bios, setBios] = useState<Bio[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch(`/api/admin/media/${mediaId}`).then((response) =>
        response.ok ? response.json() : null
      ),
      loadMediaOptions(),
    ]).then(([detail, options]) => {
      if (cancelled) return;
      if (detail?.asset) setAsset(detail.asset);
      else setError("That file could no longer be loaded.");
      setBios(options.bios ?? []);
    });

    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset) return;

    setBusy(true);
    setError("");
    setMessage("");

    const response = await fetch(`/api/admin/media/${asset._id}`, {
      method: "POST",
      body: new FormData(event.currentTarget),
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Save failed.");
      return;
    }

    const updated = { ...asset, ...result.asset } as AssetDetail;
    setAsset(updated);
    setMessage("Saved.");
    // The usage filters key off titles, so the cached options are now stale.
    invalidateMediaOptions();
    onSaved?.(updated);
  }

  return (
    <ModalPortal>
      <div className="style-modal-backdrop" onClick={onClose}>
        <div className="style-modal" onClick={(event) => event.stopPropagation()}>
          <div className="style-modal-header">
            <strong>File details</strong>
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
            {error ? <div className="admin-notice is-error">{error}</div> : null}
            {message ? <div className="admin-notice">{message}</div> : null}

            {!asset ? (
              <p className="admin-subtitle">Loading…</p>
            ) : (
              <>
                {asset.mediaType === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={protectedMediaUrl(asset.url)}
                    alt={asset.alt ?? ""}
                    loading="lazy"
                    style={{
                      width: "100%",
                      maxHeight: "12rem",
                      objectFit: "contain",
                      marginBottom: "0.75rem",
                    }}
                  />
                ) : null}

                <p className="help-text" style={{ marginTop: 0 }}>
                  {asset.originalName}
                  {asset.width ? ` · ${asset.width}×${asset.height}` : ""}
                  {/* Said here because it is the answer to "why did I have to
                      go looking for this": the browsers hide it by default. */}
                  {asset.origin === "paste" ? " · pasted while editing" : ""}
                </p>

                <form key={asset._id} onSubmit={handleSubmit}>
                  {/* Replacing the file belongs in the library, not here. */}
                  <MediaDetailsFields asset={asset} bios={bios} canUpload={false} />

                  <div className="admin-list-actions" style={{ marginTop: "0.75rem" }}>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
                      {busy ? "Saving…" : "Save details"}
                    </button>
                    <button type="button" className="btn btn-sm" onClick={onClose}>
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
