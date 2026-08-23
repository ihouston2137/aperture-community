"use client";

import { useEffect, useState } from "react";

import { loadMediaOptions } from "@/app/admin/media/media-shared";
import { isPersonBio } from "@/lib/bio-types";
import type { CollectionImage } from "@/lib/collection-types";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";

/**
 * The media fields for the tiles selected in the preview.
 *
 * The same fields the media library's edit panel offers, minus replacing the
 * file — a collection is an arrangement of assets, not the place to swap one
 * out from under every other page using it.
 *
 * Edits are written straight to the media library, because that is where the
 * fields live; the collection only holds the ids. The applied values are handed
 * back so the preview updates without a round trip.
 */

/** The fields this panel can change, as the gallery holds them. */
export type CollectionMediaPatch = Partial<
  Pick<CollectionImage, "title" | "alt" | "caption" | "author" | "captureDate" | "tags" | "isNsfw">
>;

type Bio = { _id: string; name: string; type: string };

/** A field row: a tick that opts it in, and the control it governs. */
function FieldRow({
  label,
  enabled,
  onToggle,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
        {label}
      </label>
      <div style={{ opacity: enabled ? 1 : 0.5 }}>{children}</div>
    </div>
  );
}

const TEXT_FIELDS = [
  { key: "title", label: "Title" },
  { key: "alt", label: "Alt text" },
  { key: "caption", label: "Caption" },
  { key: "author", label: "Author" },
] as const;

export function SelectionInspector({
  selected,
  isFeature,
  onMakeFeature,
  onClear,
  onApplied,
  onRemove,
}: {
  selected: CollectionImage[];
  /** Whether the one selected image is already the collection's feature. */
  isFeature: boolean;
  onMakeFeature: () => void;
  onClear: () => void;
  /** Mirrors the saved values onto the tiles the preview is showing. */
  onApplied: (patch: CollectionMediaPatch) => void;
  onRemove: () => void;
}) {
  const single = selected.length === 1 ? selected[0] : null;

  const [bios, setBios] = useState<Bio[]>([]);
  const [fields, setFields] = useState<Record<string, boolean>>({});
  // Seeded from the one selected asset, which is what makes editing a single
  // image feel direct. The caller remounts this panel when the selection
  // changes, so there is no effect resetting state behind the user's back.
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (!single) return {} as Record<string, string>;
    return {
      title: single.title,
      alt: single.alt,
      caption: single.caption,
      author: single.author,
      captureDate: single.captureDate ? single.captureDate.slice(0, 10) : "",
      tags: single.tags.join(", "),
      isNsfw: String(single.isNsfw),
    };
  });
  const [tagMode, setTagMode] = useState("add");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadMediaOptions().then((options) => {
      if (!cancelled) setBios(options.bios ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabled = (key: string) => Boolean(fields[key]);
  const toggle = (key: string) => (on: boolean) =>
    setFields((current) => ({ ...current, [key]: on }));
  const setValue = (key: string) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function apply() {
    const set: Record<string, unknown> = {};
    const patch: CollectionMediaPatch = {};

    for (const key of ["title", "alt", "caption", "author", "captureDate"]) {
      if (!enabled(key)) continue;
      set[key] = values[key] ?? "";
    }
    for (const key of ["authorBioId", "subjectBioId", "orientation"]) {
      if (enabled(key)) set[key] = values[key] ?? "";
    }
    if (enabled("isNsfw")) set.isNsfw = values.isNsfw === "true";

    const body: Record<string, unknown> = {
      ids: selected.map((image) => image.id),
      set,
    };

    const tags = (values.tags ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (enabled("tags")) body.tags = { mode: tagMode, values: tags };

    setBusy(true);
    setMessage("");
    try {
      // The same endpoint the media library's bulk edit uses, so a field
      // written here behaves exactly as it does there.
      const response = await fetch("/api/admin/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setMessage(result.error ?? "Could not save those changes.");
        return;
      }

      // Mirror onto the preview. Only the fields the gallery renders matter
      // here; the rest live in the media library alone.
      for (const key of ["title", "alt", "caption", "author"] as const) {
        if (enabled(key)) patch[key] = values[key] ?? "";
      }
      if (enabled("captureDate")) {
        patch.captureDate = values.captureDate
          ? new Date(values.captureDate).toISOString()
          : null;
      }
      if (enabled("isNsfw")) patch.isNsfw = values.isNsfw === "true";
      if (enabled("tags")) {
        patch.tags =
          tagMode === "replace"
            ? tags
            : tagMode === "add"
              ? [...new Set([...(single?.tags ?? []), ...tags])]
              : (single?.tags ?? []).filter((tag) => !tags.includes(tag));
      }

      onApplied(patch);
      setMessage(`Saved to ${selected.length} item${selected.length === 1 ? "" : "s"}.`);
    } catch {
      setMessage("Could not save those changes.");
    } finally {
      setBusy(false);
    }
  }

  const nothingChosen = Object.values(fields).every((value) => !value) || busy;

  return (
    <>
      <div className="inspector-section">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <h4 className="inspector-title" style={{ margin: 0 }}>
            {selected.length === 1 ? "Edit media" : `${selected.length} selected`}
          </h4>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={onClear}
          >
            Clear
          </button>
        </div>

        <div className="selection-thumbs">
          {selected.slice(0, 12).map((image) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={image.id}
              src={protectedMediaUrl(image.thumbnailUrl || image.url)}
              alt=""
              loading="lazy"
            />
          ))}
        </div>

        <p className="help-text">
          Tick a field to write it to {selected.length === 1 ? "this item" : "all of them"}.
          Anything left unticked is not changed. These edits go to the media
          library, so they reach everywhere the file is used.
        </p>
      </div>

      {single ? (
        <div className="inspector-section">
          <h4 className="inspector-title">Feature image</h4>
          {isFeature ? (
            <p className="help-text" style={{ marginTop: 0 }}>
              This is the collection&rsquo;s feature image.
            </p>
          ) : (
            <>
              <button type="button" className="btn btn-sm" onClick={onMakeFeature}>
                Make this the feature image
              </button>
              <p className="help-text">
                A collection has one. Unset, it is whichever image comes first in
                the current order.
              </p>
            </>
          )}
        </div>
      ) : null}

      <div className="inspector-section">
        {TEXT_FIELDS.map((field) => (
          <FieldRow
            key={field.key}
            label={field.label}
            enabled={enabled(field.key)}
            onToggle={toggle(field.key)}
          >
            <input
              type="text"
              value={values[field.key] ?? ""}
              onChange={(event) => setValue(field.key)(event.target.value)}
            />
          </FieldRow>
        ))}

        <FieldRow label="Author profile" enabled={enabled("authorBioId")} onToggle={toggle("authorBioId")}>
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
        </FieldRow>

        <FieldRow label="Subject profile" enabled={enabled("subjectBioId")} onToggle={toggle("subjectBioId")}>
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
        </FieldRow>

        <FieldRow label="Capture date" enabled={enabled("captureDate")} onToggle={toggle("captureDate")}>
          <input
            type="date"
            value={values.captureDate ?? ""}
            onChange={(event) => setValue("captureDate")(event.target.value)}
          />
        </FieldRow>

        <FieldRow label="Orientation" enabled={enabled("orientation")} onToggle={toggle("orientation")}>
          <select
            value={values.orientation ?? ""}
            onChange={(event) => setValue("orientation")(event.target.value)}
          >
            <option value="">Auto</option>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
            <option value="square">Square</option>
          </select>
        </FieldRow>

        <FieldRow label="Tags" enabled={enabled("tags")} onToggle={toggle("tags")}>
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
        </FieldRow>

        {NSFW_FEATURES_ENABLED ? (
          <FieldRow
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
          </FieldRow>
        ) : null}

        {message ? <p className="help-text">{message}</p> : null}

        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={nothingChosen}
            onClick={apply}
          >
            {busy ? "Saving…" : `Apply to ${selected.length}`}
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onRemove}>
            Remove from collection
          </button>
        </div>
      </div>
    </>
  );
}
