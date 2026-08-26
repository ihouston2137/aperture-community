"use client";

import { useState } from "react";

export type OwnBio = {
  name: string;
  /** The levels held, written from the account. */
  membership: string;
  title: string;
  location: string;
  description: string;
  headshotMediaId: string;
  headshotUrl: string;
};

/**
 * A member's own profile, as they are allowed to edit it.
 *
 * The name and the membership are shown but not editable: they are read from
 * the account and the levels it holds, so the way to change them is to change
 * those. Everything else here — the title included — is the member's own.
 */
export function BioForm({
  bio,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  bio: OwnBio;
  pending: boolean;
  error: string;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [headshotUrl, setHeadshotUrl] = useState(bio.headshotUrl);
  const [headshotMediaId, setHeadshotMediaId] = useState(bio.headshotMediaId);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function upload(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);

      const response = await fetch("/api/member/headshot", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? "Upload failed.");

      setHeadshotUrl(data.url ?? "");
      setHeadshotMediaId(data.mediaId ?? "");
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure instanceof Error ? uploadFailure.message : "Upload failed."
      );
    } finally {
      setUploading(false);
    }
  }

  const busy = pending || uploading;

  return (
    <form action={onSubmit}>
      {error ? <div className="admin-notice is-error">{error}</div> : null}

      <input type="hidden" name="headshotUrl" value={headshotUrl} />
      <input type="hidden" name="headshotMediaId" value={headshotMediaId} />

      <dl className="member-facts" style={{ marginBottom: "1rem" }}>
        <dt>Name</dt>
        <dd>{bio.name}</dd>
        <dt>Membership</dt>
        <dd>{bio.membership || "No level yet"}</dd>
      </dl>
      <p className="help-text" style={{ marginBottom: "1rem" }}>
        Your name and membership come from your account. Change your name under
        Change details; your level is set by an administrator.
      </p>

      <div className="field">
        <label htmlFor="me-title">Title</label>
        <input
          id="me-title"
          name="title"
          type="text"
          defaultValue={bio.title}
          maxLength={120}
          placeholder="Photographer, Treasurer, Year 12…"
        />
        <span className="help-text">
          What you call yourself. Nothing to do with your membership level.
        </span>
      </div>

      <div className="field" style={{ marginTop: "0.875rem" }}>
        <span className="field-label">Headshot</span>
        <div className="headshot-field">
          {headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headshotUrl} alt="" className="headshot-preview" />
          ) : (
            <div className="headshot-preview is-empty" aria-hidden="true" />
          )}

          <div className="headshot-controls">
            <label className="btn btn-sm">
              {uploading ? "Uploading…" : headshotUrl ? "Replace" : "Upload a photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Cleared so choosing the same file twice still fires.
                  event.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>

            {headshotUrl ? (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => {
                  setHeadshotUrl("");
                  setHeadshotMediaId("");
                }}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <span className="help-text">JPEG, PNG or WebP, up to 8 MB.</span>
        {uploadError ? (
          <div className="admin-notice is-error" style={{ marginTop: "0.5rem" }}>
            {uploadError}
          </div>
        ) : null}
      </div>

      <div className="field" style={{ marginTop: "0.875rem" }}>
        <label htmlFor="me-location">Location</label>
        <input
          id="me-location"
          name="location"
          type="text"
          defaultValue={bio.location}
          maxLength={120}
          placeholder="Where you are based"
        />
      </div>

      <div className="field" style={{ marginTop: "0.875rem" }}>
        <label htmlFor="me-description">About you</label>
        <textarea
          id="me-description"
          name="description"
          rows={5}
          maxLength={2000}
          defaultValue={bio.description}
        />
      </div>

      <div className="member-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {pending ? "Saving…" : "Save profile"}
        </button>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
