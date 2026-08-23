"use client";

import { useEffect, useState } from "react";

import { isPersonBio } from "@/lib/bio-types";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";

import { usageSummary, type MediaAssetSummary } from "./media-shared";

export type Bio = { _id: string; name: string; type: string };

/** The full record, fetched only for a single selection. */
export type AssetDetail = MediaAssetSummary & {
  author?: string;
  authorBioId?: string;
  subjectBioId?: string;
  captureDate?: string | null;
  orientation?: string;
  size?: number;
  mimeType?: string;
};

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The metadata form itself, shared by the library's inspector and the dialog
 * the story editor opens, so a file is described the same way everywhere.
 */
export function MediaDetailsFields({
  asset,
  bios,
  canUpload,
}: {
  asset: AssetDetail;
  bios: Bio[];
  canUpload: boolean;
}) {
  return (
    <>
      <div className="field">
        <label>Title</label>
        <input type="text" name="title" defaultValue={asset.title ?? ""} />
      </div>
      <div className="field">
        <label>Alt text</label>
        <input type="text" name="alt" defaultValue={asset.alt ?? ""} />
      </div>
      <div className="field">
        <label>Caption</label>
        <input type="text" name="caption" defaultValue={asset.caption ?? ""} />
      </div>
      <div className="field">
        <label>Author</label>
        <input type="text" name="author" defaultValue={asset.author ?? ""} />
      </div>
      <div className="field">
        <label>Author profile</label>
        {/* Only a person can take a photograph, so subjects are not offered. */}
        <select name="authorBioId" defaultValue={asset.authorBioId ?? ""}>
          <option value="">None</option>
          {bios.filter(isPersonBio).map((bio) => (
            <option key={bio._id} value={bio._id}>
              {bio.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Subject profile</label>
        {/* Anything can be the subject, a person included. */}
        <select name="subjectBioId" defaultValue={asset.subjectBioId ?? ""}>
          <option value="">None</option>
          {bios.map((bio) => (
            <option key={bio._id} value={bio._id}>
              {bio.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Capture date</label>
        <input
          type="date"
          name="captureDate"
          defaultValue={asset.captureDate ? String(asset.captureDate).slice(0, 10) : ""}
        />
      </div>
      <div className="field">
        <label>Orientation</label>
        <select name="orientation" defaultValue={asset.orientation ?? ""}>
          <option value="">Auto</option>
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
          <option value="square">Square</option>
        </select>
      </div>
      <div className="field">
        <label>Tags (comma separated)</label>
        <input type="text" name="tags" defaultValue={(asset.tags ?? []).join(", ")} />
      </div>

      {canUpload ? (
        <div className="field">
          <label>Replace file</label>
          <input type="file" name="file" />
          <span className="help-text">
            Must be the same type ({asset.mimeType || "unknown"}).
          </span>
        </div>
      ) : null}

      {/* Omitting the inputs entirely leaves the stored flag untouched — the
          update route only writes `isNsfw` when the field is present. */}
      {NSFW_FEATURES_ENABLED ? (
        <>
          <label className="checkbox-row" style={{ marginTop: "0.6rem" }}>
            <input
              type="checkbox"
              name="isNsfw"
              value="true"
              defaultChecked={Boolean(asset.isNsfw)}
            />
            Sensitive (NSFW)
          </label>
          <input type="hidden" name="isNsfw" value="false" />
        </>
      ) : null}

    </>
  );
}

/* ------------------------------------------------------------------ Single */

function SingleInspector({
  asset,
  bios,
  canUpload,
  canDelete,
  busy,
  onSave,
  onDelete,
}: {
  asset: AssetDetail;
  bios: Bio[];
  canUpload: boolean;
  canDelete: boolean;
  busy: boolean;
  onSave: (form: HTMLFormElement) => void;
  onDelete: () => void;
}) {
  return (
    <>
      {asset.mediaType === "image" ? (
        // The inspector is the only place that loads the original file.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={protectedMediaUrl(asset.url)}
          alt={asset.alt ?? ""}
          loading="lazy"
          className={asset.isNsfw ? "nsfw-shield" : undefined}
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
        {asset.size ? ` · ${formatBytes(asset.size)}` : ""}
      </p>

      <form
        key={asset._id}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(event.currentTarget);
        }}
      >
        <MediaDetailsFields asset={asset} bios={bios} canUpload={canUpload} />

        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          {(asset.usedIn ?? []).length > 0
            ? `In use: ${usageSummary(asset)}`
            : "Not used anywhere — safe to delete."}
        </p>

        <div className="admin-list-actions" style={{ marginTop: "0.75rem" }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            Save
          </button>
          {canDelete ? (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={onDelete}
            >
              Delete
            </button>
          ) : null}
        </div>
      </form>
    </>
  );
}

/* -------------------------------------------------------------------- Bulk */

export type BulkPayload = {
  set: Record<string, unknown>;
  tags?: { mode: string; values: string[] };
};

/** A field is only written when its "change" box is ticked. */
function BulkField({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="checkbox-row" style={{ marginBottom: "0.2rem" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {label}
      </label>
      <div style={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? "auto" : "none" }}>
        {children}
      </div>
    </div>
  );
}

function BulkInspector({
  assets,
  bios,
  canDelete,
  busy,
  onApply,
  onDelete,
}: {
  assets: MediaAssetSummary[];
  bios: Bio[];
  canDelete: boolean;
  busy: boolean;
  onApply: (payload: BulkPayload) => void;
  onDelete: () => void;
}) {
  const [fields, setFields] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [tagMode, setTagMode] = useState("add");

  const enabled = (key: string) => Boolean(fields[key]);
  const toggle = (key: string) => (on: boolean) =>
    setFields((current) => ({ ...current, [key]: on }));
  const setValue = (key: string) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const inUse = assets.filter((asset) => (asset.usedIn ?? []).length > 0).length;

  function apply() {
    const set: Record<string, unknown> = {};
    for (const key of [
      "title",
      "alt",
      "caption",
      "author",
      "authorBioId",
      "subjectBioId",
      "orientation",
      "captureDate",
    ]) {
      if (enabled(key)) set[key] = values[key] ?? "";
    }
    if (enabled("isNsfw")) set.isNsfw = values.isNsfw === "true";

    const payload: BulkPayload = { set };
    if (enabled("tags")) {
      payload.tags = {
        mode: tagMode,
        values: (values.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
    }
    onApply(payload);
  }

  const nothingChosen =
    Object.values(fields).every((value) => !value) || busy;

  return (
    <>
      <p className="help-text" style={{ marginTop: 0 }}>
        Tick a field to apply it to all {assets.length} selected items. Anything
        left unticked is not changed.
      </p>

      <BulkField label="Title" enabled={enabled("title")} onToggle={toggle("title")}>
        <input
          type="text"
          value={values.title ?? ""}
          onChange={(event) => setValue("title")(event.target.value)}
        />
      </BulkField>

      <BulkField label="Alt text" enabled={enabled("alt")} onToggle={toggle("alt")}>
        <input
          type="text"
          value={values.alt ?? ""}
          onChange={(event) => setValue("alt")(event.target.value)}
        />
      </BulkField>

      <BulkField label="Caption" enabled={enabled("caption")} onToggle={toggle("caption")}>
        <input
          type="text"
          value={values.caption ?? ""}
          onChange={(event) => setValue("caption")(event.target.value)}
        />
      </BulkField>

      <BulkField label="Author" enabled={enabled("author")} onToggle={toggle("author")}>
        <input
          type="text"
          value={values.author ?? ""}
          onChange={(event) => setValue("author")(event.target.value)}
        />
      </BulkField>

      <BulkField
        label="Author profile"
        enabled={enabled("authorBioId")}
        onToggle={toggle("authorBioId")}
      >
        <select
          value={values.authorBioId ?? ""}
          onChange={(event) => setValue("authorBioId")(event.target.value)}
        >
          <option value="">None</option>
          {bios.filter(isPersonBio).map((bio) => (
            <option key={bio._id} value={bio._id}>
              {bio.name}
            </option>
          ))}
        </select>
      </BulkField>

      <BulkField
        label="Subject profile"
        enabled={enabled("subjectBioId")}
        onToggle={toggle("subjectBioId")}
      >
        <select
          value={values.subjectBioId ?? ""}
          onChange={(event) => setValue("subjectBioId")(event.target.value)}
        >
          <option value="">None</option>
          {bios.map((bio) => (
            <option key={bio._id} value={bio._id}>
              {bio.name}
            </option>
          ))}
        </select>
      </BulkField>

      <BulkField
        label="Capture date"
        enabled={enabled("captureDate")}
        onToggle={toggle("captureDate")}
      >
        <input
          type="date"
          value={values.captureDate ?? ""}
          onChange={(event) => setValue("captureDate")(event.target.value)}
        />
      </BulkField>

      <BulkField
        label="Orientation"
        enabled={enabled("orientation")}
        onToggle={toggle("orientation")}
      >
        <select
          value={values.orientation ?? ""}
          onChange={(event) => setValue("orientation")(event.target.value)}
        >
          <option value="">Auto</option>
          <option value="landscape">Landscape</option>
          <option value="portrait">Portrait</option>
          <option value="square">Square</option>
        </select>
      </BulkField>

      <BulkField label="Tags" enabled={enabled("tags")} onToggle={toggle("tags")}>
        <select
          value={tagMode}
          onChange={(event) => setTagMode(event.target.value)}
          style={{ marginBottom: "0.35rem" }}
        >
          <option value="add">Add to existing tags</option>
          <option value="remove">Remove these tags</option>
          <option value="replace">Replace all tags</option>
        </select>
        <input
          type="text"
          placeholder="comma, separated, tags"
          value={values.tags ?? ""}
          onChange={(event) => setValue("tags")(event.target.value)}
        />
      </BulkField>

      {NSFW_FEATURES_ENABLED ? (
        <BulkField
          label="Sensitive (NSFW)"
          enabled={enabled("isNsfw")}
          onToggle={toggle("isNsfw")}
        >
          <select
            value={values.isNsfw ?? "false"}
            onChange={(event) => setValue("isNsfw")(event.target.value)}
          >
            <option value="true">Mark as sensitive</option>
            <option value="false">Clear sensitive</option>
          </select>
        </BulkField>
      ) : null}

      <div className="admin-list-actions" style={{ marginTop: "0.75rem" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={nothingChosen}
          onClick={apply}
        >
          Apply to {assets.length}
        </button>
        {canDelete ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={onDelete}
          >
            Delete selected
          </button>
        ) : null}
      </div>

      {inUse > 0 ? (
        <p className="help-text" style={{ marginTop: "0.5rem" }}>
          {inUse} of these are in use and will be skipped by delete.
        </p>
      ) : null}
    </>
  );
}

/* --------------------------------------------------------------- Inspector */

export function MediaInspector({
  selected,
  detail,
  bios,
  canUpload,
  canDelete,
  busy,
  onSaveSingle,
  onApplyBulk,
  onDelete,
  onClearSelection,
}: {
  selected: MediaAssetSummary[];
  /** Full record for a single selection; `null` while it loads. */
  detail: AssetDetail | null;
  bios: Bio[];
  canUpload: boolean;
  canDelete: boolean;
  busy: boolean;
  onSaveSingle: (form: HTMLFormElement) => void;
  onApplyBulk: (payload: BulkPayload) => void;
  onDelete: () => void;
  onClearSelection: () => void;
}) {
  // Remount the bulk form when the selection changes so stale field choices
  // never carry over to a different batch.
  const bulkKey = selected.map((asset) => asset._id).join(",");

  return (
    <aside className="panel media-inspector">
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <h2 className="panel-title" style={{ margin: 0 }}>
          {selected.length === 0
            ? "Nothing selected"
            : selected.length === 1
              ? "Edit media"
              : `${selected.length} selected`}
        </h2>
        {selected.length > 0 ? (
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={onClearSelection}
          >
            Clear
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: "1rem" }}>
        {selected.length === 0 ? (
          <p className="admin-subtitle">
            Select an item to edit it. Shift-click to select a range, or
            ctrl/cmd-click to add and remove individual items.
          </p>
        ) : selected.length === 1 ? (
          detail ? (
            <SingleInspector
              asset={detail}
              bios={bios}
              canUpload={canUpload}
              canDelete={canDelete}
              busy={busy}
              onSave={onSaveSingle}
              onDelete={onDelete}
            />
          ) : (
            <p className="admin-subtitle">Loading…</p>
          )
        ) : (
          <BulkInspector
            key={bulkKey}
            assets={selected}
            bios={bios}
            canDelete={canDelete}
            busy={busy}
            onApply={onApplyBulk}
            onDelete={onDelete}
          />
        )}
      </div>
    </aside>
  );
}

export { formatBytes };
