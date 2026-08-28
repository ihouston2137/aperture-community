"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BioPicker } from "@/components/bio-picker";
import { ModalPortal } from "@/components/modal-portal";
import {
  formatDollars,
  type RecognitionLevelSummary,
} from "@/lib/sponsorship-types";

import {
  addCampaignSponsorAction,
  createCampaignSponsorAction,
  removeCampaignSponsorAction,
  setCampaignAssignedAction,
  setSponsorRecognitionAction,
} from "./actions";

export type Option = { _id: string; name: string; title?: string };

/**
 * A pencil, drawn here rather than pulled from the icon set — this is the
 * only place in the app that needs one, and a square inch of SVG is cheaper
 * than a dependency on the icon registry from a client bundle.
 */
function PencilIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11.5 1.9a1.6 1.6 0 0 1 2.3 2.3L5 13l-3.2.9L2.7 11z" />
    </svg>
  );
}

/** The square control that opens one of these popups from a compact row. */
export function IconButton({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** The glyph. A pencil unless something else is passed. */
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-btn${danger ? " is-danger" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children ?? <PencilIcon />}
    </button>
  );
}

/** A bin, for the one control here that removes something. */
export function TrashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4" />
    </svg>
  );
}


/**
 * The small changes made from a campaign's own page.
 *
 * Each is one popup doing one thing, because that is how they come up: somebody
 * looking at the campaign notices the wrong person is down as looking after a
 * sponsor, and fixes that — without opening the campaign editor and its dates,
 * goal and description.
 */

/** The shell all three share. */
function Popup({
  title,
  pending,
  error,
  onClose,
  children,
  footer,
}: {
  title: string;
  pending: boolean;
  error: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

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
          onClick={(event) => event.stopPropagation()}
        >
          <div className="style-modal-form">
            <div className="style-modal-header">
              <strong>{title}</strong>
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
              {children}
            </div>

            <div className="style-modal-footer">{footer}</div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * Put a sponsor on the campaign: one already on file, or one being met for the
 * first time.
 *
 * Choosing an existing sponsor is the common case and comes first. Creating one
 * is offered only to somebody allowed to create sponsors at all — the two are
 * separate grants, and this is the same decision in a smaller window.
 */
export function AddSponsorButton({
  campaignId,
  available,
  canCreate,
}: {
  campaignId: string;
  /** Sponsors not already on this campaign. */
  available: Option[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"choose" | "create">("choose");
  const [sponsorId, setSponsorId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError("");
    setMode("choose");
    setSponsorId("");
    setName("");
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("campaignId", campaignId);

      let result;
      if (mode === "create") {
        formData.set("name", name);
        result = await createCampaignSponsorAction(formData);
      } else {
        formData.set("sponsorId", sponsorId);
        result = await addCampaignSponsorAction(formData);
      }

      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error ?? "Could not add that sponsor.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
      >
        Add sponsor
      </button>

      {open ? (
        <Popup
          title="Add a sponsor to this campaign"
          pending={pending}
          error={error}
          onClose={close}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginLeft: "auto" }}
              disabled={pending || (mode === "create" ? !name.trim() : !sponsorId)}
              onClick={submit}
            >
              {pending ? "Adding…" : "Add"}
            </button>
          }
        >
          <div className="field">
            <span className="field-label">Already on file</span>
            <BioPicker
              options={available}
              value={sponsorId}
              onChange={(id) => {
                setSponsorId(id);
                if (id) setMode("choose");
              }}
              emptyLabel="Nobody yet"
              placeholder="Type a sponsor's name"
              disabled={pending || mode === "create"}
            />
            <span className="help-text">
              {available.length === 0
                ? "Every sponsor on file is already on this campaign."
                : `${available.length} not yet on this campaign.`}
            </span>
          </div>

          {canCreate ? (
            <div className="field" style={{ marginTop: "1rem" }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={mode === "create"}
                  disabled={pending}
                  onChange={(event) => {
                    setMode(event.target.checked ? "create" : "choose");
                    setSponsorId("");
                  }}
                />
                They are not on file yet
              </label>

              {mode === "create" ? (
                <>
                  <label htmlFor="new-sponsor-name" style={{ marginTop: "0.75rem" }}>
                    Sponsor name
                  </label>
                  <input
                    id="new-sponsor-name"
                    type="text"
                    value={name}
                    maxLength={160}
                    disabled={pending}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <span className="help-text">
                    Just the name for now. Everything else about them can be
                    filled in on the sponsor&rsquo;s own page.
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="help-text" style={{ marginTop: "1rem" }}>
              Not on file? Somebody who can add sponsors will need to create
              them first.
            </p>
          )}
        </Popup>
      ) : null}
    </>
  );
}

/** Move one sponsor to a different recognition level. */
export function ChangeLevelButton({
  sponsorId,
  levels,
  current,
  icon = false,
}: {
  sponsorId: string;
  levels: RecognitionLevelSummary[];
  current: string;
  /** A square pencil rather than a worded button, for a one-line row. */
  icon?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [levelId, setLevelId] = useState(current);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError("");
    setLevelId(current);
  }

  function submit() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("sponsorId", sponsorId);
      formData.set("recognitionLevelId", levelId);

      const result = await setSponsorRecognitionAction(formData);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error ?? "Could not change that level.");
      }
    });
  }

  return (
    <>
      {icon ? (
        <IconButton label="Change recognition level" onClick={() => setOpen(true)} />
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          Change
        </button>
      )}

      {open ? (
        <Popup
          title="Recognition level"
          pending={pending}
          error={error}
          onClose={close}
          footer={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginLeft: "auto" }}
              disabled={pending}
              onClick={submit}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          }
        >
          <div className="field">
            <label htmlFor="change-level">Recognised at</label>
            <select
              id="change-level"
              value={levelId}
              disabled={pending || levels.length === 0}
              onChange={(event) => setLevelId(event.target.value)}
            >
              <option value="">Not recognised</option>
              {levels.map((level) => (
                <option key={level._id} value={level._id}>
                  {level.name}
                  {level.thresholdCents > 0
                    ? ` — from ${formatDollars(level.thresholdCents)}`
                    : ""}
                </option>
              ))}
            </select>
            <span className="help-text">
              {levels.length === 0
                ? "No levels have been defined yet."
                : "This is the sponsor's level everywhere, not only on this campaign."}
            </span>
          </div>
        </Popup>
      ) : null}
    </>
  );
}

/**
 * Take one sponsor off this campaign, from the row itself.
 *
 * The same thing can be done from inside the assignment popup, but that one is
 * opened to change who looks after somebody — a person who has decided a
 * sponsor does not belong on the campaign at all should not have to guess that
 * the answer is behind a pencil.
 *
 * Nothing is deleted: the sponsor stays on file and their donations stay recorded
 * against the campaign, which is what the confirmation says.
 */
export function RemoveSponsorButton({
  campaignId,
  sponsorId,
  sponsorName,
  donationCount,
}: {
  campaignId: string;
  sponsorId: string;
  sponsorName: string;
  /** Donations this sponsor has already given to this campaign. */
  donationCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function remove() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("campaignId", campaignId);
      formData.set("sponsorId", sponsorId);

      const result = await removeCampaignSponsorAction(formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.error ?? "Could not take them off.");
      }
    });
  }

  return (
    <>
      <IconButton
        label={`Take ${sponsorName} off this campaign`}
        danger
        onClick={() => setOpen(true)}
      >
        <TrashIcon />
      </IconButton>

      {open ? (
        <Popup
          title="Take off campaign"
          pending={pending}
          error={error}
          onClose={() => {
            if (!pending) setOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={pending}
                onClick={remove}
              >
                {pending ? "Removing…" : "Yes, take them off"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Keep
              </button>
            </>
          }
        >
          <p className="help-text">
            Take {sponsorName} off this campaign?{" "}
            {donationCount > 0
              ? `Their ${donationCount} donation${
                  donationCount === 1 ? "" : "s"
                } to it stay recorded, and still count towards what it raised.`
              : "They stay on file, and can be put back on at any time."}
          </p>
        </Popup>
      ) : null}
    </>
  );
}

/** Change who looks after one sponsor on this campaign, or take them off it. */
export function ChangeAssignedButton({
  campaignId,
  sponsorId,
  sponsorName,
  members,
  assigned,
  takesAssignment = true,
  icon = false,
}: {
  campaignId: string;
  sponsorId: string;
  sponsorName: string;
  members: Option[];
  assigned: string[];
  /** False for a sponsor nobody is put down as looking after. The dialog then
      only offers to take them off the campaign. */
  takesAssignment?: boolean;
  /** A square pencil rather than a worded button, for a one-line row. */
  icon?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>(assigned);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const nameOf = (id: string) =>
    members.find((member) => member._id === id)?.name ?? "somebody who has gone";

  function close() {
    if (pending) return;
    setOpen(false);
    setError("");
    setConfirmingRemove(false);
    setMemberIds(assigned);
  }

  function save() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("campaignId", campaignId);
      formData.set("sponsorId", sponsorId);
      for (const id of memberIds) formData.append("memberIds", id);

      const result = await setCampaignAssignedAction(formData);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error ?? "Could not save that.");
      }
    });
  }

  function remove() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("campaignId", campaignId);
      formData.set("sponsorId", sponsorId);

      const result = await removeCampaignSponsorAction(formData);
      if (result.ok) {
        close();
        router.refresh();
      } else {
        setError(result.error ?? "Could not take them off.");
      }
    });
  }

  return (
    <>
      {icon ? (
        <IconButton
          label={
            takesAssignment
              ? `Change who looks after ${sponsorName}`
              : `${sponsorName} on this campaign`
          }
          onClick={() => setOpen(true)}
        />
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
          Change
        </button>
      )}

      {open ? (
        <Popup
          title={
            takesAssignment
              ? `Who looks after ${sponsorName}`
              : `${sponsorName} on this campaign`
          }
          pending={pending}
          error={error}
          onClose={close}
          footer={
            <>
              {confirmingRemove ? (
                <>
                  <span className="help-text">
                    Take {sponsorName} off this campaign? Their donations to it stay
                    recorded.
                  </span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={remove}
                  >
                    Yes, take them off
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() => setConfirmingRemove(false)}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={pending}
                  onClick={() => setConfirmingRemove(true)}
                >
                  Take off campaign
                </button>
              )}

              {takesAssignment ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ marginLeft: "auto" }}
                  disabled={pending}
                  onClick={save}
                >
                  {pending ? "Saving…" : "Save"}
                </button>
              ) : null}
            </>
          }
        >
          {!takesAssignment ? (
            <p className="help-text">
              Nobody looks after {sponsorName} — they are set to take no
              assignment, which is changed on the sponsor itself. They still
              belong to this campaign, and their donations are still recorded
              against them.
            </p>
          ) : (
            <div className="field">
              <span className="field-label">Assigned ({memberIds.length})</span>

              {memberIds.length > 0 ? (
                <div className="chip-picker" style={{ marginBottom: "0.5rem" }}>
                  {memberIds.map((id) => (
                    <span key={id} className="chip-option">
                      {nameOf(id)}
                      <button
                        type="button"
                        className="chip-remove"
                        aria-label={`Remove ${nameOf(id)}`}
                        disabled={pending}
                        onClick={() =>
                          setMemberIds((current) => current.filter((held) => held !== id))
                        }
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <BioPicker
                options={members.filter((member) => !memberIds.includes(member._id))}
                value=""
                onChange={(id) => {
                  if (id) setMemberIds((current) => [...current, id]);
                }}
                emptyLabel="—"
                placeholder="Type a name to assign somebody"
                disabled={pending}
              />
              <span className="help-text">
                Who owns this relationship for this campaign. Credit is
                recorded on the donation itself, so the two can differ.
              </span>
            </div>
          )}
        </Popup>
      ) : null}
    </>
  );
}
