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
  DONATION_STATUS_LABELS,
  dateRangeLabel,
  formatDollars,
  inKindTotals,
  monetaryProgress,
  primaryLogo,
  sponsorChips,
  sponsorLogoSrc,
  statusTone,
} from "@/lib/sponsorship-types";
import {
  getCampaigns,
  getDonations,
  getRecognitionLevels,
  getSponsors,
  splitCreditByMember,
} from "@/lib/sponsorships";

import { Leaderboard } from "../../leaderboard";
import { CampaignButton } from "../../record-buttons";
import { ToneLegend } from "../../tone-legend";
import {
  AddSponsorButton,
  ChangeAssignedButton,
  ChangeLevelButton,
  RemoveSponsorButton,
} from "../../sponsor-controls";

/**
 * One campaign, in full: where it has got to, and who is on it.
 *
 * The donations themselves are a level down, on each sponsor's page for this
 * campaign — a campaign with thirty sponsors would otherwise open with a
 * hundred rows of donations and no way to see the shape of it.
 */
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

  const [campaigns, donations, sponsors, levels, users, roles] = await Promise.all([
    getCampaigns(),
    getDonations(),
    getSponsors(),
    getRecognitionLevels(),
    User.find({ isActive: { $ne: false } })
      .select("_id firstName lastName name email roleIds")
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

  const onCampaign = campaign.assignments
    .map((assignment) => {
      const sponsor = sponsors.find((entry) => entry._id === assignment.sponsorId);
      const given = mine.filter(
        (donation) => donation.sponsorId === assignment.sponsorId
      );
      return {
        assignment,
        sponsor,
        chips: sponsorChips(given),
        giftCount: given.length,
      };
    })
    .sort((a, b) =>
      (a.sponsor?.name ?? "").localeCompare(b.sponsor?.name ?? "")
    );

  // The same question the dashboard asks of every running campaign, asked of
  // this one alone.
  const leaderboard = splitCreditByMember(mine);

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

      <header className="manager-header">
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
      </header>

      <section className="member-card manager-card">
        <div className="manager-card-head">
          <h2 className="member-card-title">Progress</h2>
          {access.canEditCampaigns ? (
            <CampaignButton
              campaign={campaign}
              sponsors={sponsors.map((sponsor) => ({
                _id: sponsor._id,
                name: sponsor.name,
                isUnassignable: sponsor.isUnassignable,
              }))}
              members={members}
              label="Edit campaign"
            />
          ) : null}
        </div>

        <div className="progress-headline">
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
            {/* The goal on a bar of its own. With stretch goals above it, one
                bar for both leaves the goal as a tick somewhere in the middle
                — and the goal is the promise the campaign made. */}
            <div
              className="manager-meter is-segmented"
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
                {DONATION_STATUS_LABELS[segment.status]} {formatDollars(segment.cents)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="help-text">No monetary donations recorded yet.</p>
        )}

        {progress.tiers.length > 0 ? (
          <div className="stretch-block">
            <div className="stretch-block-head">
              <h3 className="member-card-subtitle">Beyond the goal</h3>
              <span className="stretch-block-figure">
                {formatDollars(progress.intoStretchCents)} of{" "}
                {formatDollars(progress.stretchCents)}
              </span>
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
                          )} given for it, across ${tier.earmarkedCount} gift${
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

            <p className="help-text">
              A gift can be applied to a stretch goal when it is recorded. That
              is an earmark rather than a separate pot — it fills the campaign
              either way, and a tier is reached by the campaign&rsquo;s total.
            </p>
          </div>
        ) : null}

        {inKind.count > 0 ? (
          <div className="in-kind-callout tone-in-kind">
            <span className="in-kind-mark" aria-hidden="true" />
            <div>
              {/* A campaign can have in-kind gifts promised and none arrived
                  yet, and leading on a nought would read as nothing given. */}
              <strong className="in-kind-figure">
                {inKind.completeCents > 0
                  ? `${formatDollars(inKind.completeCents)} in goods and services`
                  : `${formatDollars(inKind.pendingCents)} in goods and services promised`}
              </strong>
              <p className="help-text">
                {inKind.count} in-kind gift{inKind.count === 1 ? "" : "s"} from{" "}
                {inKind.sponsorCount} sponsor
                {inKind.sponsorCount === 1 ? "" : "s"}
                {inKind.completeCents > 0 && inKind.pendingCents > 0
                  ? `, with ${formatDollars(inKind.pendingCents)} more promised`
                  : ""}
                . Held apart from the figures above: a lent hall is worth having
                and is not money raised.
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
        <div className="manager-card-head">
          <h2 className="member-card-title">
            Sponsors on this campaign ({onCampaign.length})
          </h2>
          {access.canEditCampaigns ? (
            <AddSponsorButton
              campaignId={campaign._id}
              available={availableSponsors}
              canCreate={access.canEditSponsors}
            />
          ) : null}
        </div>

        {onCampaign.length === 0 ? (
          <p className="member-note">
            None yet.{" "}
            {access.canEditCampaigns
              ? "Add the first with the button above."
              : ""}
          </p>
        ) : (
          <ul className="sponsor-rows">
            {onCampaign.map(({ assignment, sponsor, chips, giftCount }) => {
              const level = levels.find(
                (entry) => entry._id === sponsor?.recognitionLevelId
              );
              const logoSrc = sponsor
                ? sponsorLogoSrc(primaryLogo(sponsor.logos))
                : "";

              return (
                <li key={assignment.sponsorId} className="sponsor-line">
                  <Link
                    href={`/manage/sponsorships/campaigns/${campaign._id}/sponsors/${assignment.sponsorId}`}
                    className="sponsor-line-name"
                  >
                    {logoSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoSrc} alt="" className="sponsor-row-logo" />
                    ) : (
                      <span className="sponsor-row-logo is-empty" aria-hidden="true" />
                    )}
                    <strong>{sponsor?.name ?? "a sponsor that has gone"}</strong>
                  </Link>

                  <span className="sponsor-line-cell is-level">
                    {level?.name ?? "—"}
                    {access.canEditSponsors && sponsor ? (
                      <ChangeLevelButton
                        sponsorId={sponsor._id}
                        levels={levels}
                        current={sponsor.recognitionLevelId}
                        icon
                      />
                    ) : null}
                  </span>

                  <span className="sponsor-line-cell is-assigned">
                    {sponsor?.isUnassignable ? (
                      <span className="help-text">nobody, by arrangement</span>
                    ) : assignment.memberIds.length === 0 ? (
                      "—"
                    ) : (
                      assignment.memberIds.map(memberName).join(", ")
                    )}
                    {access.canEditCampaigns ? (
                      <ChangeAssignedButton
                        campaignId={campaign._id}
                        sponsorId={assignment.sponsorId}
                        sponsorName={sponsor?.name ?? "this sponsor"}
                        members={members}
                        assigned={assignment.memberIds}
                        takesAssignment={!sponsor?.isUnassignable}
                        icon
                      />
                    ) : null}
                  </span>

                  <span className="sponsor-line-chips">
                    {chips.length === 0 ? (
                      <span className="help-text">nothing yet</span>
                    ) : (
                      chips.map((chip) => (
                        <span
                          key={chip.key}
                          className={`tone-chip ${chip.tone}`}
                          title={chip.label}
                        >
                          <span className="tone-dot" aria-hidden="true" />
                          {/* The colour says which this is — the legend above
                              the sponsors reads for the whole page. The word is
                              kept for anyone not reading the colour. */}
                          <span className="visually-hidden">{chip.label}</span>
                          {formatDollars(chip.cents)}
                        </span>
                      ))
                    )}
                  </span>

                  {access.canEditCampaigns ? (
                    <span className="sponsor-line-cell">
                      <RemoveSponsorButton
                        campaignId={campaign._id}
                        sponsorId={assignment.sponsorId}
                        sponsorName={sponsor?.name ?? "this sponsor"}
                        giftCount={giftCount}
                      />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Leaderboard
        entries={leaderboard}
        members={members}
        levels={boardLevels}
        currentUserId={session!.userId}
        caption="On this campaign. A donation credited to more than one member is split evenly between them, so the shares add up to the whole."
      />

      <ToneLegend />
    </>
  );
}
