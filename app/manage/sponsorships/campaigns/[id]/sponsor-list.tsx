"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ASSIGNMENT_STATUS_LABELS,
  formatDollars,
  isClosedAssignment,
  type AssignmentStatus,
  type RecognitionLevelSummary,
  type SponsorChip,
} from "@/lib/sponsorship-types";

import {
  ChangeAssignedButton,
  ChangeLevelButton,
  RemoveSponsorButton,
} from "../../sponsor-controls";

/** One sponsor on a campaign, reduced to what the list draws. */
export type CampaignSponsorRow = {
  sponsorId: string;
  name: string;
  /** Already through the media route; empty when they have no artwork. */
  logoSrc: string;
  levelId: string;
  levelName: string;
  isUnassignable: boolean;
  assignedIds: string[];
  assignedNames: string;
  status: AssignmentStatus;
  givenCents: number;
  donationCount: number;
  /**
   * Why there is nothing to show, when there is nothing to show.
   *
   * A sponsor with no figure is not all one thing: one has not been asked yet,
   * one said no, and one promised and never sent it. The list says which,
   * because those three call for three different next moves.
   */
  nothingLabel: string;
  chips: SponsorChip[];
};

export type ListAccess = {
  canEditSponsors: boolean;
  canEditCampaigns: boolean;
};

/**
 * The sponsors on a campaign, as cards or as rows.
 *
 * Two readings of one list, because the two are wanted for different jobs:
 * cards to look over the sponsors and their artwork, rows to work down them.
 * Neither is right for both, so the choice is offered rather than decided.
 *
 * Collapsible, because the page carries two of these and somebody working
 * through the ones still to give does not need the ones already giving open
 * above them.
 */
export function SponsorList({
  title,
  emptyText,
  rows,
  campaignId,
  levels,
  members,
  access,
  action,
}: {
  title: string;
  emptyText: string;
  rows: CampaignSponsorRow[];
  campaignId: string;
  levels: RecognitionLevelSummary[];
  members: { _id: string; name: string; title?: string }[];
  access: ListAccess;
  /** The "add sponsor" control, passed in because only the page may build it. */
  action?: React.ReactNode;
}) {
  /*
   * Shut, and as rows when opened.
   *
   * The page carries two of these under everything else it says, and a
   * campaign with forty sponsors would otherwise bury the progress figures
   * under two screens of cards. Rows because somebody opening a list of forty
   * is working down it.
   */
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"cards" | "rows">("rows");

  const bodyId = `sponsor-list-${title.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <section className="member-card manager-card">
      <div className="manager-card-head">
        <button
          type="button"
          className="collapse-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="collapse-caret" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
          <h2 className="member-card-title">
            {title} ({rows.length})
          </h2>
        </button>

        {open && rows.length > 0 ? (
          <div
            className="level-toggles view-toggle"
            role="group"
            aria-label={`How ${title} is shown`}
          >
            <button
              type="button"
              className="icon-btn"
              aria-pressed={view === "cards"}
              aria-label="Show as cards"
              title="Show as cards"
              onClick={() => setView("cards")}
            >
              <CardsIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-pressed={view === "rows"}
              aria-label="Show as rows"
              title="Show as rows"
              onClick={() => setView("rows")}
            >
              <RowsIcon />
            </button>
          </div>
        ) : null}

        {action}
      </div>

      {open ? (
        <div id={bodyId}>
          {rows.length === 0 ? (
            <p className="member-note">{emptyText}</p>
          ) : (
            <ul
              className={view === "cards" ? "sponsor-cards" : "sponsor-lines"}
            >
              {rows.map((row) => (
                <li
                  key={row.sponsorId}
                  /* The colour says open or finished; the badge beside the
                     figure says how it finished. */
                  className={`${
                    view === "cards" ? "sponsor-card" : "sponsor-line"
                  } ${isClosedAssignment(row.status) ? "is-closed" : "is-open"}`}
                >
                  <Link
                    href={`/manage/sponsorships/campaigns/${campaignId}/sponsors/${row.sponsorId}`}
                    className="sponsor-card-head"
                  >
                    {row.logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={row.logoSrc} alt="" className="sponsor-card-logo" />
                    ) : (
                      <span
                        className="sponsor-card-logo is-empty"
                        aria-hidden="true"
                      />
                    )}
                    <span className="sponsor-card-name">
                      <strong>{row.name}</strong>
                    </span>
                  </Link>

                  {/* The level and the pencil that changes it, on one line.
                      Outside the link above, since a control nested in one
                      would open two things at once. */}
                  <span className="sponsor-card-level">
                    <span className="help-text">
                      {row.levelName || "no level"}
                    </span>
                    {access.canEditSponsors ? (
                      <ChangeLevelButton
                        sponsorId={row.sponsorId}
                        levels={levels}
                        current={row.levelId}
                        icon
                      />
                    ) : null}
                  </span>

                  <div className="sponsor-card-given">
                    <strong>
                      {row.givenCents > 0
                        ? formatDollars(row.givenCents)
                        : row.nothingLabel}
                    </strong>
                    {row.donationCount > 0 ? (
                      <span className="help-text">
                        {row.donationCount} donation
                        {row.donationCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <span
                      className={`badge assignment-${
                        isClosedAssignment(row.status) ? "closed" : "open"
                      }`}
                    >
                      {ASSIGNMENT_STATUS_LABELS[row.status]}
                    </span>
                  </div>

                  {row.chips.length > 0 ? (
                    <div className="sponsor-card-chips">
                      {row.chips.map((chip) => (
                        <span
                          key={chip.key}
                          className={`tone-chip ${chip.tone}`}
                          title={chip.label}
                        >
                          <span className="tone-dot" aria-hidden="true" />
                          {/* The colour says which this is — the legend at the
                              foot of the page reads for the whole of it. */}
                          <span className="visually-hidden">{chip.label}</span>
                          {formatDollars(chip.cents)}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="sponsor-card-foot">
                    <span className="sponsor-card-assigned">
                      {row.isUnassignable
                        ? "nobody, by arrangement"
                        : row.assignedNames || "nobody assigned"}
                    </span>

                    <span className="sponsor-card-actions">
                      {access.canEditCampaigns ? (
                        <>
                          <ChangeAssignedButton
                            campaignId={campaignId}
                            sponsorId={row.sponsorId}
                            sponsorName={row.name}
                            members={members}
                            assigned={row.assignedIds}
                            status={row.status}
                            takesAssignment={!row.isUnassignable}
                            icon
                          />
                          <RemoveSponsorButton
                            campaignId={campaignId}
                            sponsorId={row.sponsorId}
                            sponsorName={row.name}
                            donationCount={row.donationCount}
                          />
                        </>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Four boxes: the cards. */
function CardsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1" />
      <rect x="9" y="1" width="6" height="6" rx="1" />
      <rect x="1" y="9" width="6" height="6" rx="1" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

/** Three bars: the rows. */
function RowsIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
      <rect x="1" y="2" width="14" height="3" rx="1" />
      <rect x="1" y="6.5" width="14" height="3" rx="1" />
      <rect x="1" y="11" width="14" height="3" rx="1" />
    </svg>
  );
}
