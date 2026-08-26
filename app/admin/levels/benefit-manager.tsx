"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import type { SponsorBenefitSummary } from "@/lib/sponsorship-types";

import { deleteBenefitAction, saveBenefitAction } from "./actions";

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; benefit: SponsorBenefitSummary }
  | null;

/**
 * The things a sponsor receives — a logo on the programme, tickets, a mention
 * from the stage.
 *
 * Defined once and attached to whichever levels include them, so raising what
 * Gold offers is one edit rather than a rewrite of every description.
 */
export function BenefitManager({
  benefits,
  usage,
  canManage,
}: {
  benefits: SponsorBenefitSummary[];
  /** How many levels include each, so one in use is obvious. */
  usage: Record<string, number>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <Panel title={`Benefits (${benefits.length})`}>
      {canManage ? (
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            Add benefit
          </button>
        </div>
      ) : null}

      {benefits.length === 0 ? (
        <p className="help-text">
          No benefits yet. Add what a sponsor receives, then attach each to the
          levels that include it.
        </p>
      ) : (
        <ul className="admin-list">
          {benefits.map((benefit) => (
            <li key={benefit._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3>{benefit.name}</h3>
                <div className="admin-list-meta">
                  {benefit.description || "no description"}
                </div>
              </div>

              <span className={`badge${usage[benefit._id] ? " badge-published" : ""}`}>
                {usage[benefit._id] ?? 0} level
                {(usage[benefit._id] ?? 0) === 1 ? "" : "s"}
              </span>

              {canManage ? (
                <div className="admin-list-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setDialog({ mode: "edit", benefit })}
                  >
                    Edit
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <BenefitDialog
          benefit={dialog.mode === "edit" ? dialog.benefit : undefined}
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

function BenefitDialog({
  benefit,
  onClose,
  onSaved,
}: {
  benefit?: SponsorBenefitSummary;
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
      const result = await saveBenefitAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that benefit.");
    });
  }

  function remove() {
    if (!benefit) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", benefit._id);
      const result = await deleteBenefitAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that benefit.");
    });
  }

  const title = benefit ? "Edit benefit" : "Add benefit";

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
              {benefit ? (
                <input type="hidden" name="id" value={benefit._id} />
              ) : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field">
                <label htmlFor="benefit-name">Name</label>
                <input
                  id="benefit-name"
                  name="name"
                  type="text"
                  defaultValue={benefit?.name ?? ""}
                  placeholder="Logo on the programme, two event tickets…"
                  required
                />
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="benefit-description">Description</label>
                <textarea
                  id="benefit-description"
                  name="description"
                  rows={3}
                  defaultValue={benefit?.description ?? ""}
                  placeholder="What it amounts to in practice, and anything that limits it."
                />
              </div>
            </div>

            <div className="style-modal-footer">
              {benefit ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this benefit?</span>
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
                    Delete benefit
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : benefit ? "Save benefit" : "Create benefit"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
