"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import { BIO_TYPES, BIO_TYPE_LABELS, normalizeBioType } from "@/lib/bio-types";

import { deleteBioAction, saveBioAction } from "./actions";
import { BioFields, type BioRecord } from "./bio-form";

/** Rendered at once. Past this the filters are the way to find one. */
const PAGE_SIZE = 60;

type DialogState = { mode: "create" } | { mode: "edit"; bio: BioRecord } | null;

/**
 * Every profile on the site, found by filtering rather than by scrolling.
 *
 * Each member carries one, so this list runs to as many entries as there are
 * accounts — far too many to render as a form apiece, which is what it used to
 * be. Adding and editing happen in a popup over the list.
 */
export function ProfileManager({ profiles }: { profiles: BioRecord[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [shownCount, setShownCount] = useState(PAGE_SIZE);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return profiles.filter((bio) => {
      if (type && normalizeBioType(bio.type) !== type) return false;
      if (!needle) return true;
      return [
        bio.name,
        bio.title,
        bio.membership,
        bio.location,
        bio.accountEmail,
        bio.slug,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [profiles, query, type]);

  const shown = matches.slice(0, shownCount);

  // Changing a filter starts from the top again rather than keeping however far
  // the previous one had been expanded.
  function filterBy(apply: () => void) {
    apply();
    setShownCount(PAGE_SIZE);
  }

  return (
    <Panel title={`Profiles (${profiles.length})`}>
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setDialog({ mode: "create" })}
        >
          Add profile
        </button>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="profile-search">Search</label>
          <input
            id="profile-search"
            type="search"
            value={query}
            onChange={(event) => filterBy(() => setQuery(event.target.value))}
            placeholder="Name, title, location or account"
          />
        </div>
        <div className="field">
          <label htmlFor="profile-type">Type</label>
          <select
            id="profile-type"
            value={type}
            onChange={(event) => filterBy(() => setType(event.target.value))}
          >
            <option value="">Every type</option>
            {BIO_TYPES.map((kind) => (
              <option key={kind} value={kind}>
                {BIO_TYPE_LABELS[kind]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="help-text" style={{ marginTop: "0.75rem" }}>
        {matches.length === 0
          ? "No profiles match that."
          : matches.length === profiles.length
            ? `Showing all ${profiles.length}.`
            : `${matches.length} of ${profiles.length} match.`}
      </p>

      {shown.length > 0 ? (
        <ul className="admin-list" style={{ marginTop: "0.75rem" }}>
          {shown.map((bio) => (
            <li key={bio._id} className="admin-list-item">
              {bio.headshotUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={bio.headshotUrl} alt="" className="profile-row-headshot" />
              ) : (
                <div className="profile-row-headshot is-empty" aria-hidden="true" />
              )}

              <div style={{ minWidth: 0 }}>
                <h3>{bio.name}</h3>
                <div className="admin-list-meta">
                  {bio.title || bio.membership || "no title"}
                  {bio.title && bio.membership ? ` · ${bio.membership}` : ""}
                  {bio.location ? ` · ${bio.location}` : ""}
                  {bio.accountEmail ? ` · ${bio.accountEmail}` : ""}
                  {` · /${bio.slug}`}
                </div>
              </div>

              <span className={`badge${bio.isPrimary ? " badge-published" : ""}`}>
                {bio.isPrimary
                  ? "primary"
                  : BIO_TYPE_LABELS[normalizeBioType(bio.type)].toLowerCase()}
              </span>

              <div className="admin-list-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDialog({ mode: "edit", bio })}
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {matches.length > shown.length ? (
        <div className="panel-actions" style={{ justifyContent: "center" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setShownCount((count) => count + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, matches.length - shown.length)} more
          </button>
        </div>
      ) : null}

      {dialog ? (
        <ProfileDialog
          bio={dialog.mode === "edit" ? dialog.bio : undefined}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </Panel>
  );
}

/**
 * Add, edit or delete one profile.
 *
 * Only mounted while open, so its uncontrolled fields pick up the right
 * defaults each time rather than holding the previous profile's values.
 */
function ProfileDialog({
  bio,
  onClose,
  onSaved,
}: {
  /** Present when editing; absent when adding. */
  bio?: BioRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  function save(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveBioAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that profile.");
    });
  }

  function remove() {
    if (!bio) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", bio._id);
      const result = await deleteBioAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that profile.");
    });
  }

  const title = bio ? "Edit profile" : "Add profile";

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <form action={save} className="style-modal-form">
            <div className="style-modal-header">
              <strong>{title}</strong>
              {bio ? <span className="help-text">/{bio.slug}</span> : null}
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="style-modal-body">
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              {bio?.userId ? (
                <p className="help-text" style={{ marginBottom: "0.75rem" }}>
                  This profile belongs to {bio.accountEmail || "an account"}. Deleting
                  it only holds until that account is next saved, which builds it
                  again — change the account instead.
                </p>
              ) : null}

              <BioFields bio={bio} />
            </div>

            <div className="style-modal-footer">
              {bio ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this profile?</span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      onClick={remove}
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete profile
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : bio ? "Save profile" : "Create profile"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
