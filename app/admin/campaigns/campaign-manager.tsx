"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { BioPicker } from "@/components/bio-picker";
import { ModalPortal } from "@/components/modal-portal";
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_STATUS_LABELS,
  centsToDollarInput,
  dateRangeLabel,
  dollarsToCents,
  formatDollars,
  type CampaignAssignment,
  type CampaignSummary,
} from "@/lib/sponsorship-types";

import { deleteCampaignAction, saveCampaignAction } from "./actions";

export type PickerOption = { _id: string; name: string; title?: string };

/** A sponsor as the assignment editor needs them: a name, and whether they
    take an assignment at all. */
export type SponsorOption = PickerOption & { isUnassignable?: boolean };

/**
 * A stretch goal while it is being typed.
 *
 * The amount is held as the text in the box rather than as cents, so that a
 * half-typed "12.5" survives the keystroke that follows it. It becomes cents
 * once, on save.
 */
type StretchRow = { id: string; description: string; amount: string };

/**
 * An id for a tier being added.
 *
 * Minted here rather than on save so that the row keeps the same id across
 * reorders and re-renders — and so a gift applied to it keeps pointing at the
 * tier the manager meant, not at whatever ends up in that position.
 */
function newTierId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `tier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type CampaignTotalsMap = Record<
  string,
  {
    totalCents: number;
    realisedCents: number;
    pendingCents: number;
    monetaryCents: number;
    inKindCents: number;
    count: number;
    sponsorCount: number;
  }
>;

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; campaign: CampaignSummary }
  | null;

/**
 * The drives being run, and who is looking after which sponsor for each.
 *
 * The assignment lives on the campaign rather than on the sponsor: the same
 * sponsor is often looked after by different people from one year to the next,
 * and it is the campaign that decides who that is.
 */
export function CampaignManager({
  campaigns,
  sponsors,
  members,
  totals,
  canManage,
}: {
  campaigns: CampaignSummary[];
  sponsors: SponsorOption[];
  members: PickerOption[];
  totals: CampaignTotalsMap;
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (status && campaign.status !== status) return false;
      if (!needle) return true;
      return `${campaign.name} ${campaign.description}`
        .toLowerCase()
        .includes(needle);
    });
  }, [campaigns, query, status]);

  return (
    <Panel title={`Campaigns (${campaigns.length})`}>
      {canManage ? (
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog({ mode: "create" })}
          >
            Add campaign
          </button>
        </div>
      ) : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="campaign-search">Search</label>
          <input
            id="campaign-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="A campaign name"
          />
        </div>
        <div className="field">
          <label htmlFor="campaign-status-filter">Status</label>
          <select
            id="campaign-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Active and closed</option>
            {CAMPAIGN_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {CAMPAIGN_STATUS_LABELS[entry]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          {campaigns.length === 0
            ? "No campaigns yet. Add the first one above."
            : "No campaigns match that."}
        </p>
      ) : (
        <ul className="admin-list" style={{ marginTop: "1rem" }}>
          {shown.map((campaign) => {
            const raised = totals[campaign._id];
            const managed = campaign.assignments.reduce(
              (count, entry) => count + entry.memberIds.length,
              0
            );

            return (
              <li key={campaign._id} className="admin-list-item">
                <div style={{ minWidth: 0 }}>
                  <h3>
                    {campaign.name}
                    {campaign.status === "closed" ? (
                      <span
                        className="badge"
                        style={{ marginLeft: "0.5rem" }}
                      >
                        closed
                      </span>
                    ) : null}
                  </h3>
                  <div className="admin-list-meta">
                    {dateRangeLabel(campaign.startDate, campaign.endDate)}
                    {campaign.goalCents
                      ? ` · goal ${formatDollars(campaign.goalCents)}`
                      : ""}
                    {raised?.pendingCents
                      ? ` · ${formatDollars(raised.pendingCents)} still being worked on`
                      : ""}
                  </div>
                  <div className="admin-list-meta">
                    {campaign.assignments.length} sponsor
                    {campaign.assignments.length === 1 ? "" : "s"} assigned
                    {managed > 0
                      ? ` · ${managed} member${managed === 1 ? "" : "s"} looking after them`
                      : " · nobody assigned to them yet"}
                  </div>
                </div>

                <span className={`badge${raised?.realisedCents ? " badge-published" : ""}`}>
                  {raised
                    ? formatDollars(raised.realisedCents)
                    : "nothing yet"}
                </span>

                {canManage ? (
                  <div className="admin-list-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setDialog({ mode: "edit", campaign })}
                    >
                      Edit
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dialog ? (
        <CampaignDialog
          campaign={dialog.mode === "edit" ? dialog.campaign : undefined}
          sponsors={sponsors}
          members={members}
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
 * Add or edit one campaign.
 *
 * Exported because the sponsorships dashboard opens the same dialog from
 * outside this list — the editor for a record should be one editor, wherever
 * it is reached from.
 */
export function CampaignDialog({
  campaign,
  sponsors,
  members,
  onClose,
  onSaved,
}: {
  campaign?: CampaignSummary;
  sponsors: SponsorOption[];
  members: PickerOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assignments, setAssignments] = useState<CampaignAssignment[]>(
    campaign?.assignments ?? []
  );
  const [stretchRows, setStretchRows] = useState<StretchRow[]>(
    (campaign?.stretchGoals ?? []).map((goal) => ({
      id: goal.id,
      description: goal.description,
      amount: centsToDollarInput(goal.amountCents),
    }))
  );
  const [goal, setGoal] = useState(
    centsToDollarInput(campaign?.goalCents ?? 0)
  );
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

  const nameOf = (list: PickerOption[], id: string) =>
    list.find((entry) => entry._id === id)?.name ?? "one that has gone";

  const takesAssignment = (sponsorId: string) =>
    !sponsors.find((entry) => entry._id === sponsorId)?.isUnassignable;

  /*
   * The running totals behind the steps.
   *
   * A tier is entered as what the next push is worth, but what a manager needs
   * to see is where it lands — so each row says both.
   */
  const goalCents = dollarsToCents(goal);
  const stretchTotals = stretchRows.reduce<number[]>((running, row) => {
    const previous = running[running.length - 1] ?? goalCents;
    running.push(previous + dollarsToCents(row.amount));
    return running;
  }, []);

  // A sponsor appears once per campaign; two rows for the same one would only
  // disagree about who is looking after them.
  const unassigned = sponsors.filter(
    (sponsor) => !assignments.some((entry) => entry.sponsorId === sponsor._id)
  );

  function save(formData: FormData) {
    setError("");
    // A sponsor who takes no assignment keeps none, however the rows got there
    // — the server checks this too, and this keeps the two agreeing.
    formData.set(
      "assignments",
      JSON.stringify(
        assignments.map((entry) =>
          takesAssignment(entry.sponsorId) ? entry : { ...entry, memberIds: [] }
        )
      )
    );
    formData.set(
      "stretchGoals",
      JSON.stringify(
        stretchRows.map((row) => ({
          id: row.id,
          description: row.description,
          amountCents: dollarsToCents(row.amount),
        }))
      )
    );

    startTransition(async () => {
      const result = await saveCampaignAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that campaign.");
    });
  }

  function remove() {
    if (!campaign) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", campaign._id);
      const result = await deleteCampaignAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that campaign.");
    });
  }

  const title = campaign ? "Edit campaign" : "Add campaign";

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
              {campaign ? (
                <input type="hidden" name="id" value={campaign._id} />
              ) : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field">
                <label htmlFor="campaign-name">Name</label>
                <input
                  id="campaign-name"
                  name="name"
                  type="text"
                  defaultValue={campaign?.name ?? ""}
                  placeholder="Spring appeal, New darkroom…"
                  required
                />
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="campaign-description">Description</label>
                <textarea
                  id="campaign-description"
                  name="description"
                  rows={3}
                  defaultValue={campaign?.description ?? ""}
                />
              </div>

              <div className="field-grid" style={{ marginTop: "0.875rem" }}>
                <div className="field">
                  <label htmlFor="campaign-start">Starts</label>
                  <input
                    id="campaign-start"
                    name="startDate"
                    type="date"
                    defaultValue={campaign?.startDate ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="campaign-end">Ends</label>
                  <input
                    id="campaign-end"
                    name="endDate"
                    type="date"
                    defaultValue={campaign?.endDate ?? ""}
                  />
                </div>
                <div className="field">
                  <label htmlFor="campaign-state">Status</label>
                  <select
                    id="campaign-state"
                    name="status"
                    defaultValue={campaign?.status ?? "active"}
                  >
                    {CAMPAIGN_STATUSES.map((entry) => (
                      <option key={entry} value={entry}>
                        {CAMPAIGN_STATUS_LABELS[entry]}
                      </option>
                    ))}
                  </select>
                  <span className="help-text">
                    Closing one keeps everything it raised. It only says nobody
                    is chasing it any more.
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="campaign-goal">Goal</label>
                  <input
                    id="campaign-goal"
                    name="goal"
                    type="text"
                    inputMode="decimal"
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    placeholder="0.00"
                  />
                  <span className="help-text">In dollars. Leave blank for none.</span>
                </div>
              </div>

              <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                Stretch goals
              </h4>
              <p className="help-text">
                What the campaign would go on to do if it passes its goal. Each
                amount is on top of the one above it, and the description is the
                point of it — an amount with nothing to spend it on is not a
                stretch goal, it is a bigger number.
              </p>

              {goalCents <= 0 && stretchRows.length > 0 ? (
                <p className="admin-notice is-error">
                  Stretch goals sit above a goal. Set one above, or remove
                  these.
                </p>
              ) : null}

              {stretchRows.map((row, index) => (
                <div key={row.id} className="stretch-row">
                  <div className="field stretch-amount">
                    <label htmlFor={`stretch-amount-${index}`}>
                      {index === 0 ? "Above the goal, a further" : "Then a further"}
                    </label>
                    <input
                      id={`stretch-amount-${index}`}
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      placeholder="0.00"
                      disabled={pending}
                      onChange={(event) =>
                        setStretchRows((current) =>
                          current.map((entry, position) =>
                            position === index
                              ? { ...entry, amount: event.target.value }
                              : entry
                          )
                        )
                      }
                    />
                    <span className="help-text">
                      {goalCents > 0 && (stretchTotals[index] ?? 0) > goalCents
                        ? `reaches ${formatDollars(stretchTotals[index])}`
                        : "in dollars"}
                    </span>
                  </div>

                  <div className="field">
                    <label htmlFor={`stretch-for-${index}`}>What for</label>
                    <input
                      id={`stretch-for-${index}`}
                      type="text"
                      value={row.description}
                      placeholder="Re-glaze the darkroom…"
                      disabled={pending}
                      onChange={(event) =>
                        setStretchRows((current) =>
                          current.map((entry, position) =>
                            position === index
                              ? { ...entry, description: event.target.value }
                              : entry
                          )
                        )
                      }
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={() =>
                      setStretchRows((current) =>
                        current.filter((_, position) => position !== index)
                      )
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: "0.6rem" }}
                disabled={pending}
                onClick={() =>
                  setStretchRows((current) => [
                    ...current,
                    { id: newTierId(), description: "", amount: "" },
                  ])
                }
              >
                Add a stretch goal
              </button>

              <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                Sponsors and who looks after them
              </h4>
              <p className="help-text">
                Assigning somebody here says who owns the relationship for this
                campaign. Credit for a gift is recorded on the donation itself,
                so the two can differ when they need to.
              </p>

              {assignments.map((assignment) => (
                <div key={assignment.sponsorId} className="assignment-row">
                  <div className="assignment-head">
                    <strong>{nameOf(sponsors, assignment.sponsorId)}</strong>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      style={{ marginLeft: "auto" }}
                      disabled={pending}
                      onClick={() =>
                        setAssignments((current) =>
                          current.filter(
                            (entry) => entry.sponsorId !== assignment.sponsorId
                          )
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>

                  {!takesAssignment(assignment.sponsorId) ? (
                    <p className="help-text">
                      Nobody looks after this sponsor — they are set to take no
                      assignment. They still belong to the campaign, and their
                      gifts are still recorded against them.
                    </p>
                  ) : (
                    <>
                      {assignment.memberIds.length > 0 ? (
                        <div className="chip-picker" style={{ marginBottom: "0.5rem" }}>
                          {assignment.memberIds.map((memberId) => (
                            <span key={memberId} className="chip-option">
                              {nameOf(members, memberId)}
                              <button
                                type="button"
                                className="chip-remove"
                                aria-label={`Remove ${nameOf(members, memberId)}`}
                                disabled={pending}
                                onClick={() =>
                                  setAssignments((current) =>
                                    current.map((entry) =>
                                      entry.sponsorId === assignment.sponsorId
                                        ? {
                                            ...entry,
                                            memberIds: entry.memberIds.filter(
                                              (held) => held !== memberId
                                            ),
                                          }
                                        : entry
                                    )
                                  )
                                }
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <BioPicker
                        options={members.filter(
                          (member) => !assignment.memberIds.includes(member._id)
                        )}
                        value=""
                        onChange={(memberId) => {
                          if (!memberId) return;
                          setAssignments((current) =>
                            current.map((entry) =>
                              entry.sponsorId === assignment.sponsorId
                                ? { ...entry, memberIds: [...entry.memberIds, memberId] }
                                : entry
                            )
                          );
                        }}
                        emptyLabel="—"
                        placeholder="Type a name to assign somebody"
                        disabled={pending}
                      />
                    </>
                  )}
                </div>
              ))}

              <div className="field" style={{ marginTop: "0.75rem" }}>
                <span className="field-label">Add a sponsor to this campaign</span>
                <BioPicker
                  options={unassigned}
                  value=""
                  onChange={(sponsorId) => {
                    if (!sponsorId) return;
                    setAssignments((current) => [
                      ...current,
                      { sponsorId, memberIds: [] },
                    ]);
                  }}
                  emptyLabel="—"
                  placeholder="Type a sponsor's name"
                  disabled={pending || unassigned.length === 0}
                />
                {sponsors.length === 0 ? (
                  <span className="help-text">
                    No sponsors on file yet — add one under Sponsors first.
                  </span>
                ) : null}
              </div>
            </div>

            <div className="style-modal-footer">
              {campaign ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this campaign?</span>
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
                    Delete campaign
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : campaign ? "Save campaign" : "Create campaign"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
