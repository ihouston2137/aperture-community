import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import { getSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import {
  DONATION_KIND_LABELS,
  DONATION_STATUS_LABELS,
  dateRangeLabel,
  countsTowardTotals,
  formatDollars,
  inKindTotals,
  monetaryProgress,
  primaryLogo,
  sponsorChips,
  sponsorLogoSrc,
  statusTone,
} from "@/lib/sponsorship-types";
import {
  breakdown,
  foldTail,
  getCampaigns,
  getDonations,
  getRecognitionLevels,
  getSponsorCategories,
  getSponsors,
  splitCreditByMember,
  type BreakdownRow,
} from "@/lib/sponsorships";

import { Leaderboard } from "../../leaderboard";
import { CampaignButton } from "../../record-buttons";
import { ToneLegend } from "../../tone-legend";
import { AddSponsorButton } from "../../sponsor-controls";

import { SponsorList, type CampaignSponsorRow } from "./sponsor-list";

/**
 * One campaign, in full: where it has got to, and who is on it.
 *
 * The donations themselves are a level down, on each sponsor's page for this
 * campaign — a campaign with thirty sponsors would otherwise open with a
 * hundred rows of donations and no way to see the shape of it.
 */
/**
 * One slice of a campaign, as a share bar and the legend that names it.
 *
 * A stacked bar because the question is part-to-whole — how the support this
 * campaign has had divides up — and a bar answers that at a glance in a way a
 * column of figures does not. Never a pie: the slices here are frequently a
 * near-tie, and two arcs of similar size cannot be told apart by eye.
 *
 * The legend is not decoration. Several of the hues sit below three-to-one
 * against this surface, which is allowed only where the reader is never asked
 * to identify a slice by colour alone — so every slice is named and figured in
 * ordinary text, and the colour only ties the line to the bar.
 */
function Breakdown({
  title,
  help,
  rows,
}: {
  title: string;
  help: string;
  rows: BreakdownRow[];
}) {
  // Six is where the colours stop being reliably distinguishable; the rest is
  // added into one line rather than dropped.
  const slices = foldTail(rows, 6);
  const whole = slices.reduce((sum, row) => sum + row.rankCents, 0);
  const share = (row: BreakdownRow) =>
    whole > 0 ? Math.round((row.rankCents / whole) * 100) : 0;

  return (
    <section className="breakdown">
      <h3 className="member-card-subtitle">{title}</h3>

      {slices.length === 0 ? (
        <p className="help-text">Nothing recorded yet.</p>
      ) : (
        <>
          <div
            className="breakdown-bar"
            role="img"
            aria-label={slices
              .map((row) => `${row.label}, ${share(row)} percent`)
              .join("; ")}
          >
            {slices.map((row, index) => (
              <span
                key={row.label}
                className="breakdown-slice"
                style={{
                  width: `${whole > 0 ? (row.rankCents / whole) * 100 : 0}%`,
                  // In the order the slices are ranked, never cycled: a line's
                  // colour is its place in this box and nothing else.
                  background: `var(--series-${Math.min(index + 1, 6)})`,
                }}
              />
            ))}
          </div>

          <ul className="breakdown-legend">
            {slices.map((row, index) => (
              <li key={row.label} className="breakdown-line">
                <span
                  className="breakdown-swatch"
                  style={{ background: `var(--series-${Math.min(index + 1, 6)})` }}
                  aria-hidden="true"
                />
                <span className="breakdown-name">{row.label}</span>
                <span className="breakdown-value">
                  {row.monetaryCents > 0 ? formatDollars(row.monetaryCents) : "—"}
                  {row.inKindCents > 0 ? (
                    <span className="help-text">
                      and {formatDollars(row.inKindCents)} in kind
                    </span>
                  ) : null}
                </span>
                <span className="breakdown-share">{share(row)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="help-text">{help}</p>
    </section>
  );
}

export default async function CampaignDashboard({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getSession();
  const { permissions } = await getUserAccess(session!.userId);
  const access = sponsorshipAccess(permissions);
  await connectDB();

  const [campaigns, donations, sponsors, levels, categories, users, roles] =
    await Promise.all([
      getCampaigns(),
      getDonations(),
      getSponsors(),
      getRecognitionLevels(),
      getSponsorCategories(),
      /*
       * Inactive accounts included.
       *
       * A campaign is a record of who looked after whom, and last year's
       * campaign does not stop having had its people because they have since
       * left. Filtering them out did two things wrong at once: an assignment
       * already on file read as "somebody who has gone", and nobody could put
       * a past member back on a past campaign to correct it.
       */
      User.find()
        .select("_id firstName lastName name email roleIds isActive")
        .sort({ lastName: 1, firstName: 1, email: 1 })
        .lean<any[]>(),
      getRoleSummaries("community"),
    ]);

  const campaign = campaigns.find((entry) => entry._id === id);
  if (!campaign) notFound();

  // A closed campaign's figures are their own grant, so the way in is closed
  // too rather than only the link to it being hidden.
  if (campaign.status === "closed" && !access.canSeeClosed) {
    redirect("/manage/sponsorships");
  }

  const seedEmail = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const members = users
    .filter((user) => {
      if (seedEmail && String(user.email ?? "").toLowerCase() === seedEmail) {
        return false;
      }
      return roles.some((role) => (user.roleIds ?? []).map(String).includes(role._id));
    })
    .map((user) => ({
      _id: String(user._id),
      name: fullName(user),
      // Said in the picker, because naming somebody who has left is usually
      // deliberate and occasionally a mistake.
      title: user.isActive === false ? "inactive" : undefined,
      // Carried through for the leaderboard's level filter; the pickers ignore
      // anything they were not asked for.
      levelIds: roles
        .filter((role) => (user.roleIds ?? []).map(String).includes(role._id))
        .map((role) => role._id),
    }));

  const boardLevels = roles.map((role) => ({ _id: role._id, name: role.name }));

  const memberName = (memberId: string) =>
    members.find((member) => member._id === memberId)?.name ?? "somebody who has gone";

  const mine = donations.filter((donation) => donation.campaignId === campaign._id);

  // Only monetary donations fill the bar: a goal is money to be raised, and an
  // in-kind donation — worth recording, worth having — is not money.
  const progress = monetaryProgress(
    mine,
    campaign.goalCents,
    campaign.stretchGoals
  );
  const inKind = inKindTotals(mine);

  /*
   * The sponsors on this campaign, biggest giver first.
   *
   * Money and in-kind are added together for the ordering only — the card
   * still shows them apart, because they are not the same thing. Ranking on
   * money alone would put a sponsor who lent a hall worth thousands below one
   * who sent a small cheque. Cancelled donations never happened, so they order
   * nobody; sponsors who have given nothing yet fall to the back, by name.
   */
  const onCampaign: CampaignSponsorRow[] = campaign.assignments
    .map((assignment) => {
      const sponsor = sponsors.find((entry) => entry._id === assignment.sponsorId);
      const given = mine.filter(
        (donation) => donation.sponsorId === assignment.sponsorId
      );
      const counted = given.filter((donation) =>
        countsTowardTotals(donation.status)
      );
      const givenCents = counted.reduce(
        (sum, donation) => sum + donation.valueCents,
        0
      );
      const level = levels.find(
        (entry) => entry._id === sponsor?.recognitionLevelId
      );

      /*
       * What to say where a figure would go, when there is none.
       *
       * The most recent donation's status if there is one — "Cancelled" and
       * "Never received" are facts worth reading off the list, and they are
       * more particular than anything the assignment can say. Failing that,
       * a closed assignment means they were asked and said no. Failing both,
       * nobody has got to them yet.
       */
      const latest = [...given].sort((a, b) =>
        b.date.localeCompare(a.date)
      )[0];
      const nothingLabel = latest
        ? DONATION_STATUS_LABELS[latest.status]
        : assignment.status === "closed"
          ? "Declined"
          : "Nothing yet";

      return {
        sponsorId: assignment.sponsorId,
        name: sponsor?.name ?? "a sponsor that has gone",
        logoSrc: sponsor ? sponsorLogoSrc(primaryLogo(sponsor.logos)) : "",
        levelId: sponsor?.recognitionLevelId ?? "",
        levelName: level?.name ?? "",
        isUnassignable: Boolean(sponsor?.isUnassignable),
        assignedIds: assignment.memberIds,
        assignedNames: assignment.memberIds.map(memberName).join(", "),
        status: assignment.status,
        givenCents,
        donationCount: counted.length,
        nothingLabel,
        chips: sponsorChips(given),
      };
    })
    .sort(
      (a, b) => b.givenCents - a.givenCents || a.name.localeCompare(b.name)
    );

  /*
   * Split by whether anything has come in.
   *
   * The two lists are worked in different ways — one is what the campaign has
   * raised and who to thank for it, the other is who is still to be asked —
   * and reading them apart is most of why anybody opens this page.
   */
  /*
   * Split on whether anything counted, not on whether anything was recorded.
   *
   * A donation cancelled or never received is a nothing, so the sponsor it
   * belongs to is still to give — and putting them among the donors would
   * show a line reading nought under a heading that says they gave.
   */
  const donating = onCampaign.filter((row) => row.donationCount > 0);
  const notYet = onCampaign
    .filter((row) => row.donationCount === 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  /*
   * Where the campaign's support came from, four ways.
   *
   * Each is the same set of donations sliced by a different fact about them —
   * two about the donation, two about the sponsor who gave it — so the four
   * add up to the same whole and can be read against each other.
   */
  const sponsorOf = (donation: (typeof mine)[number]) =>
    sponsors.find((entry) => entry._id === donation.sponsorId);

  const breakdowns = [
    {
      title: "Category",
      help: "What kind of donation it was, from the categories on the donation itself.",
      rows: breakdown(
        mine,
        (donation) =>
          donation.categoryIds
            .map(
              (id) => categories.find((entry) => entry._id === id)?.name ?? ""
            )
            .filter(Boolean),
        "No category"
      ),
    },
    {
      title: "Industry",
      help: "The trade the sponsor is in.",
      rows: breakdown(
        mine,
        (donation) => {
          const industry = sponsorOf(donation)?.industry;
          return industry ? [industry] : [];
        },
        "Not recorded"
      ),
    },
    {
      title: "Recognition",
      help: "The recognition level the sponsor is currently held at.",
      rows: breakdown(
        mine,
        (donation) => {
          const level = levels.find(
            (entry) => entry._id === sponsorOf(donation)?.recognitionLevelId
          );
          return level ? [level.name] : [];
        },
        "Not recognised"
      ),
    },
    {
      title: "Membership",
      help: "The membership levels held by the members credited with bringing each donation in. A donation credited across two levels is split evenly between them, so these lines come to the same whole as the others.",
      rows: breakdown(
        mine,
        (donation) => {
          if (donation.memberIds.length === 0) return ["Nobody credited"];

          // Distinct levels, not one per member: two members of the same
          // level who brought one donation in together are one line, not two.
          const held = new Set<string>();
          for (const memberId of donation.memberIds) {
            const member = members.find((entry) => entry._id === memberId);
            for (const levelId of member?.levelIds ?? []) {
              const role = boardLevels.find((entry) => entry._id === levelId);
              if (role) held.add(role.name);
            }
          }
          return held.size > 0 ? [...held] : ["No membership level"];
        },
        "Nobody credited",
        // Split, so the levels can be compared against each other and against
        // the four breakdowns beside them.
        { split: true }
      ),
    },
    {
      title: "Monetary and in-kind",
      help: "Money raised against goods and services given.",
      rows: breakdown(
        mine,
        (donation) => [DONATION_KIND_LABELS[donation.kind]],
        "Not recorded"
      ),
    },
  ];

  // The same question the dashboard asks of every running campaign, asked of
  // this one alone.
  const leaderboard = splitCreditByMember(mine);

  // Built once: three controls on this page open the campaign dialog.
  const campaignSponsorOptions = sponsors.map((sponsor) => ({
    _id: sponsor._id,
    name: sponsor.name,
    isUnassignable: sponsor.isUnassignable,
  }));

  const availableSponsors = sponsors
    .filter(
      (sponsor) =>
        !campaign.assignments.some((entry) => entry.sponsorId === sponsor._id)
    )
    .map((sponsor) => ({ _id: sponsor._id, name: sponsor.name }));

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/manage/sponsorships">Sponsorships</Link>
        <span aria-hidden="true">›</span>
        <span>{campaign.name}</span>
      </nav>

      <header className="manager-header sponsor-header">
        <div style={{ minWidth: 0 }}>
          <h1 className="member-title">
            {campaign.name}
            {campaign.status === "closed" ? (
              <span className="badge" style={{ marginLeft: "0.6rem" }}>
                closed
              </span>
            ) : null}
          </h1>
          <p className="member-lede">
            {dateRangeLabel(campaign.startDate, campaign.endDate)}
          </p>
          {campaign.description ? (
            <p className="member-note">{campaign.description}</p>
          ) : null}
        </div>

        {/* Beside the name, the dates and the description it changes. */}
        {access.canEditCampaigns ? (
          <span className="sponsor-header-actions">
            <CampaignButton
              campaign={campaign}
              sponsors={campaignSponsorOptions}
              members={members}
              label="Edit campaign"
            />
          </span>
        ) : null}
      </header>

      <section className="member-card manager-card">
        <div className="manager-card-head">
          <h2 className="member-card-title">Progress</h2>
          {/* The goal and everything above it are edited in the campaign
              dialog, so the way to them is offered where they are shown
              rather than only at the top of the page. */}
          {access.canEditCampaigns && campaign.goalCents ? (
            <CampaignButton
              campaign={campaign}
              sponsors={campaignSponsorOptions}
              members={members}
              label="Edit the goal"
            />
          ) : null}
        </div>

        <div className="progress-hero">
          <div className="progress-hero-figures">
            <span className="progress-figure">
              {formatDollars(progress.totalCents)}
            </span>
            <span className="progress-of">
              {campaign.goalCents
                ? `raised of a ${formatDollars(campaign.goalCents)} goal`
                : "raised in monetary donations"}
            </span>
            {campaign.goalCents ? (
              <span
                className={`progress-percent${
                  progress.percent >= 100 ? " is-met tone-complete" : ""
                }`}
              >
                {progress.percent}%
              </span>
            ) : (
              <span className="progress-percent is-quiet">no goal set</span>
            )}
          </div>

          {campaign.goalCents ? (
            <>
              {/* The goal on a bar of its own. With stretch tiers above it, one
                  bar for both leaves the goal as a tick somewhere in the middle
                  — and the goal is the promise the campaign made. */}
              <div
                className="manager-meter is-segmented is-tall"
                role="img"
                aria-label={`${progress.percent}% of the goal in monetary donations`}
              >
                {progress.segments.map((segment) => (
                  <span
                    key={segment.status}
                    className={statusTone(segment.status)}
                    style={{ width: `${segment.goalSharePercent}%` }}
                    title={`${DONATION_STATUS_LABELS[segment.status]}: ${formatDollars(
                      segment.cents
                    )}`}
                  />
                ))}
              </div>

              <div className="manager-figures">
                <span>
                  {progress.goalFillPercent >= 100
                    ? "Goal reached"
                    : `${formatDollars(
                        campaign.goalCents - progress.totalCents
                      )} to the goal`}
                </span>
                <span className="manager-figure-end">
                  {formatDollars(campaign.goalCents)}
                </span>
              </div>
            </>
          ) : null}

          {progress.segments.length > 0 ? (
            <ul className="tone-key">
              {progress.segments.map((segment) => (
                <li key={segment.status} className={statusTone(segment.status)}>
                  <span className="tone-dot" aria-hidden="true" />
                  {DONATION_STATUS_LABELS[segment.status]}{" "}
                  {formatDollars(segment.cents)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="help-text">No monetary donations recorded yet.</p>
          )}
        </div>

        {progress.tiers.length > 0 ? (
          <div className="stretch-block">
            <div className="stretch-block-head">
              <h3 className="member-card-subtitle">Beyond the goal</h3>
              <span className="stretch-block-figure">
                {formatDollars(progress.intoStretchCents)} of{" "}
                {formatDollars(progress.stretchCents)}
              </span>
              {access.canEditCampaigns ? (
                <CampaignButton
                  campaign={campaign}
                  sponsors={campaignSponsorOptions}
                  members={members}
                  label="Edit"
                />
              ) : null}
            </div>

            {/* A run per tier, each sized to what that tier asks for, so a
                part-filled one reads as part-filled rather than as a share of
                a number nobody is thinking about. */}
            <div
              className="stretch-track"
              role="img"
              aria-label={`${formatDollars(
                progress.intoStretchCents
              )} of ${formatDollars(progress.stretchCents)} beyond the goal`}
            >
              {progress.tiers.map((tier) => (
                <span
                  key={tier.id}
                  className={`stretch-run${
                    tier.isMet ? " is-met tone-complete" : ""
                  }`}
                  style={{ width: `${tier.trackPercent}%` }}
                  title={`${tier.description} — ${formatDollars(
                    tier.thresholdCents
                  )}`}
                >
                  <span
                    className="stretch-run-fill"
                    style={{ width: `${tier.fillPercent}%` }}
                  />
                </span>
              ))}
            </div>

            <ol className="stretch-list">
              {progress.tiers.map((tier) => (
                <li
                  key={tier.id}
                  className={`stretch-tier${
                    tier.isMet ? " is-met tone-complete" : ""
                  }`}
                >
                  <span className="stretch-tier-step" aria-hidden="true">
                    {tier.isMet ? "✓" : tier.step}
                  </span>
                  <span className="stretch-tier-what">
                    {tier.description}
                    <span className="stretch-tier-given">
                      at {formatDollars(tier.thresholdCents)}
                      {tier.earmarkedCount > 0
                        ? ` · ${formatDollars(
                            tier.earmarkedCents
                          )} given for it, across ${tier.earmarkedCount} donation${
                            tier.earmarkedCount === 1 ? "" : "s"
                          }`
                        : ""}
                    </span>
                  </span>
                  <span className="stretch-tier-state">
                    {tier.isMet
                      ? "reached"
                      : `${formatDollars(
                          tier.thresholdCents - progress.totalCents
                        )} to go`}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {progress.secondary.length > 0 ? (
          <div className="stretch-block">
            <div className="stretch-block-head">
              <h3 className="member-card-subtitle">Raised alongside</h3>
              <span className="stretch-block-figure">
                {formatDollars(progress.secondaryCents)} given
              </span>
            </div>

            {/* Each its own effort, so each gets its own card and its own bar
                rather than a place along the campaign's. */}
            <div className="goal-cards">
              {progress.secondary.map((goal) => (
                <article
                  key={goal.id}
                  className={`goal-card${goal.isMet ? " is-met tone-complete" : ""}`}
                >
                  <div className="goal-card-head">
                    <strong className="goal-card-title">
                      {goal.description}
                    </strong>
                    <span className="goal-card-percent">
                      {goal.isMet ? "✓ met" : `${goal.percent}%`}
                    </span>
                  </div>

                  <div
                    className="manager-meter"
                    role="img"
                    aria-label={`${goal.percent}% of ${formatDollars(
                      goal.targetCents
                    )}`}
                  >
                    <span
                      className="goal-card-fill"
                      style={{ width: `${goal.fillPercent}%` }}
                    />
                  </div>

                  <div className="manager-figures">
                    <span>
                      <strong>{formatDollars(goal.raisedCents)}</strong> of{" "}
                      {formatDollars(goal.targetCents)}
                    </span>
                    <span className="manager-figure-end">
                      {goal.donationCount} donation{goal.donationCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </article>
              ))}
            </div>

          </div>
        ) : null}

        {inKind.count > 0 ? (
          <div className="in-kind-callout tone-in-kind">
            <span className="in-kind-mark" aria-hidden="true" />
            <div>
              {/* A campaign can have in-kind donations promised and none arrived
                  yet, and leading on a nought would read as nothing given. */}
              <strong className="in-kind-figure">
                {inKind.completeCents > 0
                  ? `${formatDollars(inKind.completeCents)} in goods and services`
                  : `${formatDollars(inKind.pendingCents)} in goods and services promised`}
              </strong>
              <p className="help-text">
                {inKind.count} in-kind donation{inKind.count === 1 ? "" : "s"} from{" "}
                {inKind.sponsorCount} sponsor
                {inKind.sponsorCount === 1 ? "" : "s"}
                {inKind.completeCents > 0 && inKind.pendingCents > 0
                  ? `, with ${formatDollars(inKind.pendingCents)} more promised`
                  : ""}
              </p>
            </div>
          </div>
        ) : null}

        {progress.uncountedCents > 0 ? (
          <p className="help-text" style={{ marginTop: "0.5rem" }}>
            A further {formatDollars(progress.uncountedCents)} is recorded but
            marked as not counting towards the goal.
          </p>
        ) : null}
      </section>

      <section className="member-card manager-card">
        <h2 className="member-card-title">Breakdowns</h2>
        <p className="help-text">
          The same donations sliced four ways, so the four come to the same
          whole. Money and goods are kept apart in the figures, as they are
          everywhere — a lent hall is not a cheque — while the bars measure the
          two together, since what is being asked is where the support came
          from.
        </p>

        <div className="breakdown-grid">
          {breakdowns.map((entry) => (
            <Breakdown
              key={entry.title}
              title={entry.title}
              help={entry.help}
              rows={entry.rows}
            />
          ))}
        </div>
      </section>

      <Leaderboard
        entries={leaderboard}
        members={members}
        levels={boardLevels}
        currentUserId={session!.userId}
        caption="On this campaign. A donation credited to more than one member is split evenly between them, so the shares add up to the whole."
      />

      <SponsorList
        title="Sponsors donating on this campaign"
        emptyText="Nothing has come in yet."
        rows={donating}
        campaignId={campaign._id}
        levels={levels}
        members={members}
        access={{
          canEditSponsors: access.canEditSponsors,
          canEditCampaigns: access.canEditCampaigns,
        }}
        action={
          access.canEditCampaigns ? (
            <AddSponsorButton
              campaignId={campaign._id}
              available={availableSponsors}
              canCreate={access.canEditSponsors}
            />
          ) : null
        }
      />

      <SponsorList
        title="Sponsors not yet donating on this campaign"
        emptyText={
          onCampaign.length === 0
            ? "No sponsors on this campaign yet."
            : "Everybody on this campaign has given something."
        }
        rows={notYet}
        campaignId={campaign._id}
        levels={levels}
        members={members}
        access={{
          canEditSponsors: access.canEditSponsors,
          canEditCampaigns: access.canEditCampaigns,
        }}
        action={
          access.canEditCampaigns ? (
            <AddSponsorButton
              campaignId={campaign._id}
              available={availableSponsors}
              canCreate={access.canEditSponsors}
            />
          ) : null
        }
      />

      <ToneLegend />
    </>
  );
}
