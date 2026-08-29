"use client";

import { useMemo, useState } from "react";

import { formatDollars, statusTone } from "@/lib/sponsorship-types";
import type { CreditTotals, MemberCredit } from "@/lib/sponsorships";

/** A member as the board needs them: a name, and the levels they hold. */
export type BoardMember = { _id: string; name: string; levelIds: string[] };

export type BoardLevel = { _id: string; name: string };

/**
 * Who has brought in what.
 *
 * Ranked on everything that has arrived, with what is still being worked on
 * riding alongside — a member with a full pipeline and nothing banked yet has
 * not done nothing, and a board showing only the banked figure would say they
 * had.
 *
 * Money and in-kind are shown apart because they are not the same thing and do
 * not add: a donated venue and a cheque are both worth having and are not
 * interchangeable. They are ranked together, though, since both are work the
 * member did.
 *
 * The same component on the whole programme and on one campaign — it is the
 * same question asked of a different set of donations.
 */
export function Leaderboard({
  entries,
  members,
  levels,
  currentUserId,
  caption,
}: {
  entries: MemberCredit[];
  members: BoardMember[];
  /** Membership levels, for narrowing the board to one of them. */
  levels: BoardLevel[];
  currentUserId: string;
  caption: string;
}) {
  const [chosen, setChosen] = useState<string[]>([]);

  const byId = useMemo(() => {
    const map = new Map<string, BoardMember>();
    for (const member of members) map.set(member._id, member);
    return map;
  }, [members]);

  const shown = useMemo(() => {
    if (chosen.length === 0) return entries;
    // Any of the memberships picked, not all of them: somebody holding one of
    // them is who the reader is narrowing to.
    return entries.filter((entry) =>
      byId.get(entry.memberId)?.levelIds.some((id) => chosen.includes(id))
    );
  }, [entries, chosen, byId]);

  function toggle(id: string) {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((held) => held !== id)
        : [...current, id]
    );
  }

  if (entries.length === 0) return null;

  return (
    <section className="member-card manager-card">
      <div className="manager-card-head">
        <h2 className="member-card-title">Leaderboard</h2>

        {/* The same control as the member directory's, because it is the same
            question asked of the same memberships — several may be picked, and
            picking none is everybody. */}
        {levels.length > 0 ? (
          <div className="field leaderboard-filter">
            <span className="field-label">Membership</span>
            <div
              className="level-toggles"
              role="group"
              aria-label="Narrow the board to a membership"
            >
              {levels.map((level) => (
                <button
                  key={level._id}
                  type="button"
                  className="btn btn-sm"
                  aria-pressed={chosen.includes(level._id)}
                  onClick={() => toggle(level._id)}
                >
                  {level.name}
                </button>
              ))}
              {chosen.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setChosen([])}
                >
                  Everyone
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <p className="help-text">{caption}</p>

      {shown.length === 0 ? (
        <p className="member-note">
          Nobody with{chosen.length === 1 ? " that membership" : " those memberships"}{" "}
          has brought anything in.
        </p>
      ) : (
        <ol className="leaderboard">
          {shown.map((entry, index) => (
            <li key={entry.memberId} className="leaderboard-row">
              <span className="leaderboard-rank" aria-hidden="true">
                {index + 1}
              </span>

              <span className="leaderboard-name">
                {byId.get(entry.memberId)?.name ?? "somebody who has gone"}
                {entry.memberId === currentUserId ? (
                  <span className="badge">you</span>
                ) : null}
                <span className="help-text">
                  {entry.count} donation{entry.count === 1 ? "" : "s"}
                </span>
              </span>

              <span className="leaderboard-figures">
                <Figure label="Money" totals={entry.monetary} money />
                <Figure label="In-kind" totals={entry.inKind} money={false} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * One kind of giving: what arrived, and what has not yet.
 *
 * Money carries the status colours; in-kind carries the two greys, the same
 * reading as everywhere else.
 */
function Figure({
  label,
  totals,
  money,
}: {
  label: string;
  totals: CreditTotals;
  money: boolean;
}) {
  const pending = totals.inProgressCents + totals.proposedCents;
  if (!totals.completeCents && !pending) return null;

  return (
    <span className="leaderboard-figure">
      <span className="field-label">{label}</span>
      <strong>{formatDollars(totals.completeCents)}</strong>

      {pending > 0 ? (
        <span className="leaderboard-pending">
          {totals.inProgressCents > 0 ? (
            <span
              className={`tone-chip ${
                money ? statusTone("in-progress") : "tone-in-kind-pending"
              }`}
              title={`In progress: ${formatDollars(totals.inProgressCents)}`}
            >
              <span className="tone-dot" aria-hidden="true" />
              <span className="visually-hidden">In progress</span>
              {formatDollars(totals.inProgressCents)}
            </span>
          ) : null}

          {totals.proposedCents > 0 ? (
            <span
              className={`tone-chip ${
                money ? statusTone("proposed") : "tone-in-kind-pending"
              }`}
              title={`Proposed: ${formatDollars(totals.proposedCents)}`}
            >
              <span className="tone-dot" aria-hidden="true" />
              <span className="visually-hidden">Proposed</span>
              {formatDollars(totals.proposedCents)}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
