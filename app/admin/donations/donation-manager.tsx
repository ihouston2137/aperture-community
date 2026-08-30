"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { BioPicker } from "@/components/bio-picker";
import { ModalPortal } from "@/components/modal-portal";
import {
  DONATION_KINDS,
  DONATION_KIND_LABELS,
  DONATION_STATUSES,
  DONATION_STATUS_LABELS,
  centsToDollarInput,
  countsTowardTotals,
  formatDateLabel,
  formatDollars,
  isRealised,
  type DonationSummary,
  type SponsorCategorySummary,
  type StretchGoal,
} from "@/lib/sponsorship-types";

import { deleteDonationAction, saveDonationAction } from "./actions";

export type PickerOption = { _id: string; name: string; title?: string };

/**
 * An archived campaign is still offered — a donation promised while it ran can
 * arrive after it is put away — but it is named as archived so nobody files
 * one against the wrong drive by accident.
 */
export type CampaignOption = PickerOption & {
  isArchived?: boolean;
  /** So a donation can be applied to one of them. Absent where none are defined. */
  stretchGoals?: StretchGoal[];
};

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; donation: DonationSummary }
  | null;

/**
 * Every donation, and who is credited with bringing it in.
 *
 * A donation credited to three people counts in full for each of them: the figure
 * answers "what did this member bring in", not "what share of the total is
 * theirs", and splitting it would blur those two questions together.
 */
export function DonationManager({
  donations,
  campaigns,
  sponsors,
  members,
  categories,
  canManage,
}: {
  donations: DonationSummary[];
  campaigns: CampaignOption[];
  sponsors: PickerOption[];
  members: PickerOption[];
  /** The sponsor categories, which qualify a donation as well as a sponsor. */
  categories: SponsorCategorySummary[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const nameOf = (list: PickerOption[], id: string) =>
    list.find((entry) => entry._id === id)?.name ?? "one that has gone";

  /** What a donation was given for, when it was given for a stretch goal. */
  const appliedTo = (donation: DonationSummary) =>
    campaigns
      .find((entry) => entry._id === donation.campaignId)
      ?.stretchGoals?.find((goal) => goal.id === donation.stretchGoalId)
      ?.description ?? "";

  const categoryName = (id: string) =>
    categories.find((category) => category._id === id)?.name ?? "";

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return donations.filter((donation) => {
      if (campaignId && donation.campaignId !== campaignId) return false;
      if (kind && donation.kind !== kind) return false;
      if (status && donation.status !== status) return false;
      if (categoryId && !donation.categoryIds.includes(categoryId)) return false;
      if (!needle) return true;
      return [
        nameOf(sponsors, donation.sponsorId),
        nameOf(campaigns, donation.campaignId),
        donation.description,
        ...donation.memberIds.map((id) => nameOf(members, id)),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    // The lookups read from the three lists, which is what actually changes.
  }, [
    donations,
    query,
    campaignId,
    kind,
    status,
    categoryId,
    sponsors,
    campaigns,
    members,
  ]);

  // Cancelled donations never happened, so they are left out of the figure — and
  // what has arrived is reported apart from what is still being worked on.
  const counted = shown.filter((donation) => countsTowardTotals(donation.status));
  const shownTotal = counted.reduce((sum, entry) => sum + entry.valueCents, 0);
  const realisedTotal = counted
    .filter((entry) => isRealised(entry.status))
    .reduce((sum, entry) => sum + entry.valueCents, 0);

  return (
    <Panel title={`Donations (${donations.length})`}>
      {canManage ? (
        <div className="panel-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialog({ mode: "create" })}
            disabled={campaigns.length === 0 || sponsors.length === 0}
          >
            Record a donation
          </button>
        </div>
      ) : null}

      {campaigns.length === 0 || sponsors.length === 0 ? (
        <p className="help-text">
          A donation needs a campaign to belong to and a sponsor who gave it —
          add {campaigns.length === 0 ? "a campaign" : "a sponsor"} first.
        </p>
      ) : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="donation-search">Search</label>
          <input
            id="donation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Sponsor, campaign, member or description"
          />
        </div>
        <div className="field">
          <label htmlFor="donation-campaign">Campaign</label>
          <select
            id="donation-campaign"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
          >
            <option value="">Every campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign._id} value={campaign._id}>
                {campaign.name}{campaign.isArchived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="donation-status">Status</label>
          <select
            id="donation-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Every status</option>
            {DONATION_STATUSES.map((entry) => (
              <option key={entry} value={entry}>
                {DONATION_STATUS_LABELS[entry]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="donation-kind">Type</label>
          <select
            id="donation-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="">Both kinds</option>
            {DONATION_KINDS.map((entry) => (
              <option key={entry} value={entry}>
                {DONATION_KIND_LABELS[entry]}
              </option>
            ))}
          </select>
        </div>

        {categories.length > 0 ? (
          <div className="field">
            <label htmlFor="donation-category">Category</label>
            <select
              id="donation-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Every category</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <p className="help-text" style={{ marginTop: "0.75rem" }}>
        {shown.length === 0
          ? "Nothing matches that."
          : `${shown.length} of ${donations.length} · ${formatDollars(
              realisedTotal
            )} in hand${
              shownTotal > realisedTotal
                ? `, ${formatDollars(shownTotal - realisedTotal)} still being worked on`
                : ""
            }.`}
      </p>

      {shown.length > 0 ? (
        <ul className="admin-list" style={{ marginTop: "0.75rem" }}>
          {shown.map((donation) => (
            <li key={donation._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3>{nameOf(sponsors, donation.sponsorId)}</h3>
                <div className="admin-list-meta">
                  {nameOf(campaigns, donation.campaignId)}
                  {donation.date ? ` · ${formatDateLabel(donation.date)}` : ""}
                  {` · ${DONATION_KIND_LABELS[donation.kind]}`}
                  {` · ${DONATION_STATUS_LABELS[donation.status]}`}
                  {donation.isCounted ? "" : " · not counted"}
                  {appliedTo(donation) ? ` · for ${appliedTo(donation)}` : ""}
                  {donation.categoryIds.length > 0
                    ? ` · ${donation.categoryIds
                        .map(categoryName)
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                </div>
                <div className="admin-list-meta">
                  {donation.memberIds.length > 0
                    ? `Credit: ${donation.memberIds
                        .map((id) => nameOf(members, id))
                        .join(", ")}`
                    : "nobody credited"}
                  {donation.description ? ` · ${donation.description}` : ""}
                </div>
              </div>

              <span
                className={`badge${
                  isRealised(donation.status)
                    ? " badge-published"
                    : countsTowardTotals(donation.status)
                      ? " badge-draft"
                      : ""
                }`}
              >
                {formatDollars(donation.valueCents)}
              </span>

              {canManage ? (
                <div className="admin-list-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setDialog({ mode: "edit", donation })}
                  >
                    Edit
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {dialog ? (
        <DonationDialog
          donation={dialog.mode === "edit" ? dialog.donation : undefined}
          campaigns={campaigns}
          sponsors={sponsors}
          members={members}
          categories={categories}
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
 * Record or edit one donation.
 *
 * Exported so a campaign's own dashboard can open it against that campaign
 * without a second editor being written for the purpose.
 */
export function DonationDialog({
  donation,
  campaigns,
  sponsors,
  members,
  categories,
  defaultSponsorId = "",
  defaultCampaignId = "",
  onClose,
  onSaved,
}: {
  donation?: DonationSummary;
  campaigns: CampaignOption[];
  sponsors: PickerOption[];
  members: PickerOption[];
  categories: SponsorCategorySummary[];
  /*
   * Who and what a new donation is for, when the page opening this already knows.
   * Somebody recording a donation from a sponsor's page on a campaign has
   * answered both questions by being there, and should not be asked again.
   * Ignored when editing: an existing donation carries its own.
   */
  defaultSponsorId?: string;
  defaultCampaignId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  // `||` rather than `??`: an absent default is an empty string, which has to
  // fall through to the first campaign the way an absent one does.
  const [sponsorId, setSponsorId] = useState(
    donation?.sponsorId || defaultSponsorId
  );
  const [campaignId, setCampaignId] = useState(
    donation?.campaignId || defaultCampaignId || campaigns[0]?._id || ""
  );
  const [stretchGoalId, setStretchGoalId] = useState(
    donation?.stretchGoalId ?? ""
  );
  const [memberIds, setMemberIds] = useState<string[]>(donation?.memberIds ?? []);

  /*
   * The tiers on the campaign currently chosen.
   *
   * Held to the campaign rather than offered from every campaign at once: a
   * donation belongs to one drive, and a tier belongs to one drive too. Moving the
   * donation to another campaign drops the earmark, because the thing it was for
   * is not on the new one.
   */
  const stretchGoals =
    campaigns.find((entry) => entry._id === campaignId)?.stretchGoals ?? [];
  const appliedGoal = stretchGoals.find((goal) => goal.id === stretchGoalId);
  const appliesTo = appliedGoal ? stretchGoalId : "";
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

  const nameOf = (id: string) =>
    members.find((member) => member._id === id)?.name ?? "one that has gone";

  function save(formData: FormData) {
    setError("");
    formData.set("sponsorId", sponsorId);
    formData.set("campaignId", campaignId);
    formData.set("stretchGoalId", appliesTo);
    for (const id of memberIds) formData.append("memberIds", id);

    startTransition(async () => {
      const result = await saveDonationAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that donation.");
    });
  }

  function remove() {
    if (!donation) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", donation._id);
      const result = await deleteDonationAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that donation.");
    });
  }

  const title = donation ? "Edit donation" : "Record a donation";
  const today = new Date().toISOString().slice(0, 10);

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
              {donation ? (
                <input type="hidden" name="id" value={donation._id} />
              ) : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="donation-for">Campaign</label>
                  <select
                    id="donation-for"
                    value={campaignId}
                    onChange={(event) => setCampaignId(event.target.value)}
                  >
                    {campaigns.map((campaign) => (
                      <option key={campaign._id} value={campaign._id}>
                        {campaign.name}{campaign.isArchived ? " (archived)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {stretchGoals.length > 0 ? (
                  <div className="field">
                    <label htmlFor="donation-applies">Applies to</label>
                    <select
                      id="donation-applies"
                      value={appliesTo}
                      onChange={(event) => setStretchGoalId(event.target.value)}
                    >
                      <option value="">The campaign itself</option>
                      {stretchGoals
                        .filter((goal) => !goal.isSeparate)
                        .map((goal) => (
                          <option key={goal.id} value={goal.id}>
                            {goal.description}
                          </option>
                        ))}
                      {stretchGoals.some((goal) => goal.isSeparate) ? (
                        <optgroup label="Separate goals">
                          {stretchGoals
                            .filter((goal) => goal.isSeparate)
                            .map((goal) => (
                              <option key={goal.id} value={goal.id}>
                                {goal.description}
                              </option>
                            ))}
                        </optgroup>
                      ) : null}
                    </select>
                    <span className="help-text">
                      {appliedGoal?.isSeparate
                        ? "A separate goal is raised alongside the campaign, so this donation fills that goal and is kept out of the campaign's own total."
                        : "For a stretch goal this is an earmark, not a separate pot — it fills the campaign either way, and records what the donation was given for."}
                    </span>
                  </div>
                ) : null}

                <div className="field">
                  <span className="field-label">Sponsor</span>
                  <BioPicker
                    options={sponsors}
                    value={sponsorId}
                    onChange={setSponsorId}
                    emptyLabel="Nobody yet"
                    placeholder="Type a sponsor's name"
                    disabled={pending}
                  />
                </div>

                <div className="field">
                  <label htmlFor="donation-state">Status</label>
                  <select
                    id="donation-state"
                    name="status"
                    defaultValue={donation?.status ?? "proposed"}
                  >
                    {DONATION_STATUSES.map((entry) => (
                      <option key={entry} value={entry}>
                        {DONATION_STATUS_LABELS[entry]}
                      </option>
                    ))}
                  </select>
                  <span className="help-text">
                    Only a complete donation counts as in hand. A cancelled one is
                    left out of every total.
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="donation-type">Type</label>
                  <select
                    id="donation-type"
                    name="kind"
                    defaultValue={donation?.kind ?? "monetary"}
                  >
                    {DONATION_KINDS.map((entry) => (
                      <option key={entry} value={entry}>
                        {DONATION_KIND_LABELS[entry]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="donation-date">Date</label>
                  <input
                    id="donation-date"
                    name="date"
                    type="date"
                    defaultValue={donation?.date || today}
                  />
                </div>

                <div className="field">
                  <label htmlFor="donation-value">Value</label>
                  <input
                    id="donation-value"
                    name="value"
                    type="text"
                    inputMode="decimal"
                    defaultValue={centsToDollarInput(donation?.valueCents ?? 0)}
                    placeholder="0.00"
                    required
                  />
                  <span className="help-text">
                    In dollars. For an in-kind donation, what it is worth.
                  </span>
                </div>
              </div>

              <label className="checkbox-row" style={{ marginTop: "0.875rem" }}>
                <input
                  type="checkbox"
                  name="isCounted"
                  defaultChecked={donation?.isCounted ?? true}
                />
                Counts towards the goal and the leaderboard
              </label>
              <span className="help-text">
                Clear it for a donation that should be on the record without
                filling the campaign&apos;s goal or earning anybody credit — money
                moved from another fund, or an amount already counted elsewhere.
                It still appears against the sponsor who gave it.
              </span>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="donation-description">Description</label>
                <textarea
                  id="donation-description"
                  name="description"
                  rows={3}
                  defaultValue={donation?.description ?? ""}
                  placeholder="What was given, and anything worth remembering about it."
                />
              </div>

              {categories.length > 0 ? (
                <div className="field" style={{ marginTop: "0.875rem" }}>
                  <span className="field-label">Categories</span>
                  <div className="chip-picker">
                    {categories.map((category) => (
                      <label key={category._id} className="chip-option">
                        <input
                          type="checkbox"
                          name="categoryIds"
                          value={category._id}
                          defaultChecked={
                            donation?.categoryIds.includes(category._id) ?? false
                          }
                        />
                        {category.name}
                      </label>
                    ))}
                  </div>
                  <span className="help-text">
                    What kind of donation this was. The sponsor&apos;s own
                    categories say what kind of organisation they are, which is
                    a different question — a printing firm can give money to one
                    campaign and printing to another.
                  </span>
                </div>
              ) : null}

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <span className="field-label">
                  Credited to ({memberIds.length})
                </span>

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
                            setMemberIds((current) =>
                              current.filter((held) => held !== id)
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
                  options={members.filter((member) => !memberIds.includes(member._id))}
                  value=""
                  onChange={(id) => {
                    if (id) setMemberIds((current) => [...current, id]);
                  }}
                  emptyLabel="—"
                  placeholder="Type a name to credit somebody"
                  disabled={pending}
                />
                <span className="help-text">
                  The members who worked with the sponsor to bring this in. Each
                  is credited with the full value.
                </span>
              </div>
            </div>

            <div className="style-modal-footer">
              {donation ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this donation?</span>
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
                    Delete donation
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending || !sponsorId}
              >
                {pending ? "Saving…" : donation ? "Save donation" : "Record it"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
