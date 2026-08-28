"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import {
  centsToDollarInput,
  formatDollars,
  type RecognitionLevelSummary,
  type SponsorBenefitSummary,
} from "@/lib/sponsorship-types";

import {
  deleteRecognitionLevelAction,
  saveRecognitionLevelAction,
} from "./actions";

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; level: RecognitionLevelSummary }
  | null;

/**
 * The tiers sponsors are recognised at — Gold, Silver, Partner, whatever this
 * community calls them.
 *
 * Defined here rather than fixed by the app, because what the tiers are called
 * and how many there are is a decision each community makes. A sponsor is put
 * at one by hand: recognition is a decision somebody makes, and a sponsor is
 * often held at a level through a quiet year.
 */
export function RecognitionManager({
  levels,
  benefits,
  counts,
  canManage,
}: {
  levels: RecognitionLevelSummary[];
  benefits: SponsorBenefitSummary[];
  /** How many sponsors sit at each level, so a tier in use is obvious. */
  counts: Record<string, number>;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const benefitName = (id: string) =>
    benefits.find((benefit) => benefit._id === id)?.name ?? "one that has gone";

  return (
    <Panel title={`Recognition levels (${levels.length})`}>
      {canManage ? (
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            Add level
          </button>
        </div>
      ) : null}

      {levels.length === 0 ? (
        <p className="help-text">
          No levels yet. Add some and each sponsor can be set to one.
        </p>
      ) : (
        <ul className="admin-list">
          {levels.map((level) => (
            <li key={level._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3>
                  {level.name}
                  {level.isAnonymous ? (
                    <span className="badge badge-draft" style={{ marginLeft: "0.5rem" }}>
                      anonymous
                    </span>
                  ) : null}
                </h3>
                <div className="admin-list-meta">
                  {level.description || "no description"}
                  {` · rank ${level.rank}`}
                  {level.thresholdCents > 0
                    ? ` · from ${formatDollars(level.thresholdCents)}`
                    : ""}
                </div>
                <div className="admin-list-meta">
                  {level.benefitIds.length === 0
                    ? "no benefits attached"
                    : level.benefitIds.map(benefitName).join(", ")}
                </div>
              </div>

              <span className={`badge${counts[level._id] ? " badge-published" : ""}`}>
                {counts[level._id] ?? 0} sponsor
                {(counts[level._id] ?? 0) === 1 ? "" : "s"}
              </span>

              {canManage ? (
                <div className="admin-list-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setDialog({ mode: "edit", level })}
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
        <LevelDialog
          level={dialog.mode === "edit" ? dialog.level : undefined}
          benefits={benefits}
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

function LevelDialog({
  level,
  benefits,
  onClose,
  onSaved,
}: {
  level?: RecognitionLevelSummary;
  benefits: SponsorBenefitSummary[];
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
      const result = await saveRecognitionLevelAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that level.");
    });
  }

  function remove() {
    if (!level) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", level._id);
      const result = await deleteRecognitionLevelAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that level.");
    });
  }

  const title = level ? "Edit level" : "Add level";

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
              {level ? <input type="hidden" name="id" value={level._id} /> : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="level-name">Name</label>
                  <input
                    id="level-name"
                    name="name"
                    type="text"
                    defaultValue={level?.name ?? ""}
                    placeholder="Gold, Silver, Founding partner…"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="level-rank">Rank</label>
                  <input
                    id="level-rank"
                    name="rank"
                    type="number"
                    defaultValue={level?.rank ?? 0}
                  />
                  <span className="help-text">
                    Orders the levels, highest first. Gold above Silver above
                    Bronze.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="level-threshold">Qualifies from</label>
                  <input
                    id="level-threshold"
                    name="threshold"
                    type="text"
                    inputMode="decimal"
                    defaultValue={centsToDollarInput(level?.thresholdCents ?? 0)}
                    placeholder="0.00"
                  />
                  <span className="help-text">
                    The least a sponsor must have given to qualify, in dollars.
                    Leave blank for a level with no figure attached. Sponsors
                    are still put at a level by hand — reaching the figure does
                    not move anybody on its own.
                  </span>
                </div>
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="level-description">Description</label>
                <textarea
                  id="level-description"
                  name="description"
                  rows={3}
                  defaultValue={level?.description ?? ""}
                  placeholder="What this level means, and what a sponsor at it receives."
                />
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <span className="field-label">Benefits at this level</span>
                {benefits.length === 0 ? (
                  <span className="help-text">
                    No benefits defined yet — the panel beside this one is where
                    they are added.
                  </span>
                ) : (
                  <div className="chip-picker">
                    {benefits.map((benefit) => (
                      <label key={benefit._id} className="chip-option">
                        <input
                          type="checkbox"
                          name="benefitIds"
                          value={benefit._id}
                          defaultChecked={level?.benefitIds.includes(benefit._id) ?? false}
                        />
                        {benefit.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <label className="checkbox-row" style={{ marginTop: "1rem" }}>
                <input
                  type="checkbox"
                  name="isAnonymous"
                  defaultChecked={level?.isAnonymous ?? false}
                />
                Anonymous level
              </label>
              <span className="help-text">
                Sponsors recognised at this level are never named on the website
                or anywhere else outside these signed-in pages. Some people give
                on the condition that nobody is told.
              </span>
            </div>

            <div className="style-modal-footer">
              {level ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this level?</span>
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
                    Delete level
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : level ? "Save level" : "Create level"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
