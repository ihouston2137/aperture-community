"use client";

import { useEffect, useMemo, useState } from "react";

import { backfillThumbnailsAction, rebuildMediaUsageAction } from "./actions";
import {
  MediaInspector,
  type AssetDetail,
  type Bio,
  type BulkPayload,
} from "./media-inspector";
import {
  emptyMediaFilters,
  invalidateMediaOptions,
  loadMediaOptions,
  LoadMore,
  MediaFilterBar,
  MediaGrid,
  nextSelection,
  useMediaBrowser,
  type MediaFilters,
  type UsageOption,
} from "./media-shared";
import { UploadDialog } from "./upload-dialog";

export function MediaManager({
  canUpload,
  canDelete,
}: {
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [filters, setFilters] = useState<MediaFilters>(emptyMediaFilters);
  const [bios, setBios] = useState<Bio[]>([]);
  const [usageOptions, setUsageOptions] = useState<UsageOption[]>([]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AssetDetail | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const { assets, total, hasMore, loading, loadMore, reload } = useMediaBrowser(filters);

  const selected = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset._id)),
    [assets, selectedIds]
  );

  useEffect(() => {
    let cancelled = false;
    loadMediaOptions().then((options) => {
      if (cancelled) return;
      setBios(options.bios ?? []);
      setUsageOptions(options.usageOptions ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A single selection loads its full record; the list projection is lean and
  // does not carry the fields the edit form needs.
  useEffect(() => {
    if (selectedIds.length !== 1) return;

    let cancelled = false;
    fetch(`/api/admin/media/${selectedIds[0]}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (!cancelled && result?.asset) setDetail(result.asset);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  // Derived rather than cleared in an effect: the stored detail is only shown
  // when it belongs to the currently selected item.
  const activeDetail =
    selectedIds.length === 1 && detail?._id === selectedIds[0] ? detail : null;

  function refreshAfterChange() {
    invalidateMediaOptions();
    loadMediaOptions().then((options) => setUsageOptions(options.usageOptions ?? []));
    reload();
  }

  async function handleSaveSingle(form: HTMLFormElement) {
    if (!activeDetail) return;
    setBusy(true);
    setError("");
    setMessage("");

    const response = await fetch(`/api/admin/media/${activeDetail._id}`, {
      method: "POST",
      body: new FormData(form),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Save failed.");
      return;
    }
    setDetail({ ...activeDetail, ...result.asset });
    setMessage("Saved.");
    refreshAfterChange();
  }

  async function handleApplyBulk(payload: BulkPayload) {
    setBusy(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/admin/media", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, ...payload }),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Bulk update failed.");
      return;
    }
    setMessage(`Updated ${result.matched} items.`);
    refreshAfterChange();
  }

  async function handleDelete() {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setError("");
    setMessage("");

    const response = await fetch(
      `/api/admin/media?ids=${encodeURIComponent(selectedIds.join(","))}`,
      { method: "DELETE" }
    );
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setError(result.error ?? "Delete failed.");
      return;
    }

    setMessage(
      result.blocked > 0
        ? `Deleted ${result.deleted}. ${result.blocked} still in use were kept.`
        : `Deleted ${result.deleted}.`
    );
    setSelectedIds([]);
    refreshAfterChange();
  }

  /** Maintenance jobs, for assets or content that predate the current indexes. */
  async function runMaintenance(job: "usage" | "thumbnails") {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      if (job === "usage") {
        const result = await rebuildMediaUsageAction();
        setMessage(
          `Rebuilt usage for ${result.assets} assets (${result.references} references).`
        );
      } else {
        const result = await backfillThumbnailsAction();
        setMessage(`Generated ${result.created} thumbnails (${result.skipped} skipped).`);
      }
      refreshAfterChange();
    } catch {
      setError("The maintenance job failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {message ? <div className="admin-notice">{message}</div> : null}
      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <div className="media-workspace">
        <section className="panel">
          <div className="selection-bar">
            {canUpload ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setUploadOpen(true)}
              >
                Upload media
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn-sm"
              disabled={assets.length === 0}
              onClick={() => {
                setSelectedIds(assets.map((asset) => asset._id));
                setAnchorId(assets[0]?._id ?? null);
              }}
            >
              Select all loaded
            </button>

            {selectedIds.length > 0 ? (
              <button type="button" className="btn btn-sm" onClick={() => setSelectedIds([])}>
                Deselect ({selectedIds.length})
              </button>
            ) : null}

            {canUpload ? (
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.35rem" }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  title="For media added before thumbnails were generated"
                  onClick={() => runMaintenance("thumbnails")}
                >
                  Backfill thumbnails
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={busy}
                  title="For content saved before usage was tracked"
                  onClick={() => runMaintenance("usage")}
                >
                  Rebuild usage
                </button>
              </div>
            ) : null}
          </div>

          <MediaFilterBar filters={filters} onChange={setFilters} usageOptions={usageOptions} />

          {loading && assets.length === 0 ? (
            <p className="admin-subtitle">Loading…</p>
          ) : null}
          {!loading && assets.length === 0 ? (
            <p className="admin-subtitle">Nothing matches these filters.</p>
          ) : null}

          <MediaGrid
            assets={assets}
            selectedIds={selectedIds}
            multiSelect
            onSelect={(asset, event) => {
              const result = nextSelection(
                assets,
                selectedIds,
                anchorId,
                asset._id,
                event
              );
              setSelectedIds(result.ids);
              setAnchorId(result.anchorId);
            }}
          />

          <LoadMore
            hasMore={hasMore}
            loading={loading}
            shown={assets.length}
            total={total}
            onLoadMore={loadMore}
          />
        </section>

        <MediaInspector
          selected={selected}
          detail={activeDetail}
          bios={bios}
          canUpload={canUpload}
          canDelete={canDelete}
          busy={busy}
          onSaveSingle={handleSaveSingle}
          onApplyBulk={handleApplyBulk}
          onDelete={handleDelete}
          onClearSelection={() => setSelectedIds([])}
        />
      </div>

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={(created) => {
          if (created.length > 0) setMessage(`Uploaded ${created.length} files.`);
          refreshAfterChange();
        }}
      />
    </>
  );
}
