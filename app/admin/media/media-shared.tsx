"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  USAGE_CATEGORIES,
  USAGE_CATEGORY_LABELS,
  type UsageCategory,
  type UsageRef,
} from "@/lib/media-usage-types";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";

/**
 * Shared plumbing for the media library and the "Choose media" popup.
 *
 * Both fetch one filtered page at a time from `/api/admin/media`. Nothing here
 * holds the whole collection, so behaviour is identical whether the library has
 * fifty assets or fifty thousand.
 */

export type MediaAssetSummary = {
  _id: string;
  url: string;
  /** Small derivative used for grid tiles; falls back to `url` when absent. */
  thumbnailUrl?: string;
  title?: string;
  alt?: string;
  caption?: string;
  originalName?: string;
  mediaType?: string;
  provider?: string;
  embedUrl?: string;
  isNsfw?: boolean;
  tags?: string[];
  width?: number;
  height?: number;
  usedIn?: UsageRef[];
};

export type UsageOption = { category: UsageCategory; refId: string; name: string };

export const MEDIA_TYPES = ["image", "video", "audio", "file"] as const;

export type MediaFilters = {
  query: string;
  type: string;
  use: UsageCategory | "all";
  ref: string;
};

export const emptyMediaFilters: MediaFilters = {
  query: "",
  type: "all",
  use: "all",
  ref: "all",
};

/** Grid tiles use the generated thumbnail; only detail views need the original. */
export function thumbnailSrc(asset: MediaAssetSummary): string {
  return protectedMediaUrl(asset.thumbnailUrl || asset.url);
}

export function usageSummary(asset: MediaAssetSummary): string {
  const refs = asset.usedIn ?? [];
  return refs.length > 0 ? refs.map((ref) => ref.name).join(", ") : "Unused";
}

/* ----------------------------------------------------------------- Options */

let optionsCache: { bios: any[]; usageOptions: UsageOption[] } | null = null;

export async function loadMediaOptions() {
  if (optionsCache) return optionsCache;
  const response = await fetch("/api/admin/media/options");
  if (!response.ok) return { bios: [], usageOptions: [] };
  optionsCache = await response.json();
  return optionsCache!;
}

export function invalidateMediaOptions() {
  optionsCache = null;
}

/* ------------------------------------------------------------- Paged fetch */

export type MediaPage = {
  assets: MediaAssetSummary[];
  total: number;
  hasMore: boolean;
  page: number;
};

export async function fetchMediaPage(
  filters: MediaFilters,
  page: number,
  lockedType?: string
): Promise<MediaPage> {
  const params = new URLSearchParams({ page: String(page) });
  if (filters.query.trim()) params.set("q", filters.query.trim());

  const type = lockedType ?? filters.type;
  if (type && type !== "all") params.set("type", type);
  if (filters.use !== "all") params.set("use", filters.use);
  if (filters.ref !== "all") params.set("ref", filters.ref);

  const response = await fetch(`/api/admin/media?${params}`);
  if (!response.ok) return { assets: [], total: 0, hasMore: false, page };
  return response.json();
}

/**
 * Loads pages of assets for the current filters. Search is debounced so typing
 * does not issue a request per keystroke, and results append as pages load.
 */
export function useMediaBrowser(filters: MediaFilters, lockedType?: string, active = true) {
  const [assets, setAssets] = useState<MediaAssetSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  // Bumped to force a reload of page 0 after uploads or edits.
  const [revision, setRevision] = useState(0);
  const requestRef = useRef(0);

  const key = `${filters.query}|${filters.type}|${filters.use}|${filters.ref}|${lockedType ?? ""}`;

  // Changing the filters restarts paging. Adjusting during render (rather than
  // in an effect) avoids a wasted fetch of the old page.
  const [appliedKey, setAppliedKey] = useState(key);
  if (key !== appliedKey) {
    setAppliedKey(key);
    setPage(0);
  }

  useEffect(() => {
    if (!active) return;

    const token = ++requestRef.current;

    // Only the text query needs debouncing; dropdowns apply immediately.
    const delay = filters.query.trim() ? 250 : 0;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await fetchMediaPage(filters, page, lockedType);
      if (token !== requestRef.current) return; // a newer request superseded this

      setAssets((current) => (page === 0 ? result.assets : [...current, ...result.assets]));
      setTotal(result.total);
      setHasMore(result.hasMore);
      setLoading(false);
    }, delay);

    return () => clearTimeout(timer);
    // `key` stands in for the filter fields it is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page, revision, active, lockedType]);

  const loadMore = useCallback(() => setPage((current) => current + 1), []);
  const reload = useCallback(() => {
    setPage(0);
    setRevision((current) => current + 1);
  }, []);

  return { assets, total, hasMore, loading, loadMore, reload };
}

/* -------------------------------------------------------------- Filter bar */

export function MediaFilterBar({
  filters,
  onChange,
  usageOptions,
  lockedType,
}: {
  filters: MediaFilters;
  onChange: (filters: MediaFilters) => void;
  usageOptions: UsageOption[];
  lockedType?: string;
}) {
  const refOptions = useMemo(() => {
    if (filters.use === "all" || filters.use === "unused") return [];
    return usageOptions.filter((option) => option.category === filters.use);
  }, [usageOptions, filters.use]);

  return (
    <div className="field-grid" style={{ marginBottom: "1rem" }}>
      <div className="field">
        <label>Search</label>
        <input
          type="text"
          placeholder="Title, file name, tag or usage…"
          value={filters.query}
          onChange={(event) => onChange({ ...filters, query: event.target.value })}
        />
      </div>

      {!lockedType ? (
        <div className="field">
          <label>Type</label>
          <select
            value={filters.type}
            onChange={(event) => onChange({ ...filters, type: event.target.value })}
          >
            <option value="all">All types</option>
            {MEDIA_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <label>Used in</label>
        <select
          value={filters.use}
          onChange={(event) =>
            // Changing category invalidates the specific-document choice.
            onChange({
              ...filters,
              use: event.target.value as UsageCategory | "all",
              ref: "all",
            })
          }
        >
          <option value="all">Anywhere</option>
          {USAGE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {USAGE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>

      {refOptions.length > 0 ? (
        <div className="field">
          <label>{USAGE_CATEGORY_LABELS[filters.use as UsageCategory]}</label>
          <select
            value={filters.ref}
            onChange={(event) => onChange({ ...filters, ref: event.target.value })}
          >
            <option value="all">Any</option>
            {refOptions.map((option) => (
              <option key={option.refId} value={option.refId}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- Grid tiles */

export function MediaGrid({
  assets,
  selectedIds,
  onSelect,
  showUsage = true,
  multiSelect = false,
}: {
  assets: MediaAssetSummary[];
  selectedIds?: string[];
  /** `event` carries the modifier keys so callers can range- or toggle-select. */
  onSelect: (asset: MediaAssetSummary, event: React.MouseEvent) => void;
  showUsage?: boolean;
  multiSelect?: boolean;
}) {
  const selected = new Set(selectedIds ?? []);

  return (
    <div className="media-grid">
      {assets.map((asset) => {
        const isSelected = selected.has(asset._id);
        return (
          <button
            key={asset._id}
            type="button"
            className={`media-tile${isSelected ? " is-selected" : ""}`}
            aria-pressed={multiSelect ? isSelected : undefined}
            title={`Used in: ${usageSummary(asset)}`}
            onClick={(event) => onSelect(asset, event)}
          >
            {multiSelect ? (
              <span className="media-tile-check" aria-hidden="true">
                {isSelected ? "✓" : ""}
              </span>
            ) : null}

            {asset.mediaType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnailSrc(asset)}
                alt={asset.alt ?? ""}
                // Off-screen tiles are never fetched, and the browser can size
                // the grid before the bytes arrive.
                loading="lazy"
                decoding="async"
                width={asset.width || undefined}
                height={asset.height || undefined}
                className={
                  NSFW_FEATURES_ENABLED && asset.isNsfw ? "nsfw-shield" : undefined
                }
              />
            ) : (
              <span className="media-tile-placeholder">{asset.mediaType ?? "file"}</span>
            )}

            <span className="media-tile-name">{asset.title || asset.originalName}</span>
            {showUsage ? (
              <span className="media-tile-usage">{usageSummary(asset)}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Resolve a click into the next selection, honouring the usual modifiers:
 * plain click replaces, shift extends from the anchor, ctrl/cmd toggles.
 */
export function nextSelection(
  ordered: MediaAssetSummary[],
  current: string[],
  anchorId: string | null,
  clickedId: string,
  event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
): { ids: string[]; anchorId: string } {
  if (event.shiftKey && anchorId) {
    const from = ordered.findIndex((asset) => asset._id === anchorId);
    const to = ordered.findIndex((asset) => asset._id === clickedId);

    if (from !== -1 && to !== -1) {
      const [start, end] = from < to ? [from, to] : [to, from];
      const range = ordered.slice(start, end + 1).map((asset) => asset._id);
      // Extend rather than replace, so several ranges can be combined.
      return { ids: [...new Set([...current, ...range])], anchorId };
    }
  }

  if (event.metaKey || event.ctrlKey) {
    const ids = current.includes(clickedId)
      ? current.filter((id) => id !== clickedId)
      : [...current, clickedId];
    return { ids, anchorId: clickedId };
  }

  return { ids: [clickedId], anchorId: clickedId };
}

export function LoadMore({
  hasMore,
  loading,
  shown,
  total,
  onLoadMore,
}: {
  hasMore: boolean;
  loading: boolean;
  shown: number;
  total: number;
  onLoadMore: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
      <span className="admin-list-meta">
        Showing {shown} of {total}
      </span>
      {hasMore ? (
        <button type="button" className="btn btn-sm" disabled={loading} onClick={onLoadMore}>
          {loading ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
