import Link from "next/link";

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
  monetaryProgress,
  statusTone,
} from "@/lib/sponsorship-types";
import {
  creditByMember,
  getCampaigns,
  getDonations,
  getSponsors,
  splitCreditByMember,
  totalsByCampaign,
} from "@/lib/sponsorships";

import { Leaderboard } from "./leaderboard";
import { CampaignButton } from "./record-buttons";
import { ToneLegend } from "./tone-legend";

export const metadata = { title: "Sponsorships" };

/**
 * Where the campaigns being run have got to.
 *
 * Active campaigns are the page; opening one goes to its own dashboard. Closed
 * ones are listed underneath only for somebody given them, since a finished
 * campaign's final figures are often the sensitive part.
 */
export default async function SponsorshipsDashboard() {
  const session = await getSession();
  const { permissions } = await getUserAccess(session!.userId);
  const access = sponsorshipAccess(permissions);
  await connectDB();

  const [campaigns, donations, sponsors, users, roles] = await Promise.all([
    getCampaigns(),
    getDonations(),
    getSponsors(),
    User.find({ isActive: { $ne: false } })
      .select("_id firstName lastName name email roleIds")
      .sort({ lastName: 1, firstName: 1, email: 1 })
      .lean<any[]>(),
    getRoleSummaries("community"),
  ]);

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

  const sponsorOptions = sponsors.map((sponsor) => ({
    _id: sponsor._id,
    name: sponsor.name,
    isUnassignable: sponsor.isUnassignable,
  }));

  const totals = totalsByCampaign(donations);
  const sponsorName = (id: string) =>
    sponsors.find((sponsor) => sponsor._id === id)?.name ?? "a sponsor that has gone";

  const active = campaigns.filter((campaign) => campaign.status === "active");
  const closed = access.canSeeClosed
    ? campaigns.filter((campaign) => campaign.status === "closed")
    : [];

  // What this person is looking after, across every active campaign. It is the
  // first thing they came to find out.
  const mine = active
    .map((campaign) => ({
      campaign,
      sponsorIds: campaign.assignments
        .filter((entry) => entry.memberIds.includes(session!.userId))
        .map((entry) => entry.sponsorId),
    }))
    .filter((entry) => entry.sponsorIds.length > 0);

  const myCredit = creditByMember(donations).get(session!.userId);

  // Only what is running: a leaderboard is about the work in hand, and last
  // year's figures would sit at the top of it forever.
  const activeIds = new Set(active.map((campaign) => campaign._id));
  const leaderboard = splitCreditByMember(
    donations.filter((donation) => activeIds.has(donation.campaignId))
  );

  const memberName = (memberId: string) =>
    members.find((member) => member._id === memberId)?.name ?? "somebody who has gone";

  // Closed campaigns are only part of the count for somebody who may see them.
  const visibleCampaignCount = active.length + closed.length;

  return (
    <>
      <header className="manager-header">
        <h1 className="member-title">Sponsorships</h1>
        <p className="member-lede">
          {active.length === 0
            ? "Nothing is running at the moment."
            : `${active.length} campaign${active.length === 1 ? "" : "s"} running.`}
        </p>
      </header>

      {mine.length > 0 || myCredit ? (
        <section className="member-card manager-card">
          <h2 className="member-card-title">Yours</h2>

          {mine.length === 0 ? (
            <p className="member-note">
              No sponsors are assigned to you on an active campaign.
            </p>
          ) : (
            <ul className="manager-mine">
              {mine.map(({ campaign, sponsorIds }) => (
                <li key={campaign._id}>
                  <Link href={`/manage/sponsorships/campaigns/${campaign._id}`}>
                    <strong>{campaign.name}</strong>
                  </Link>
                  <span>{sponsorIds.map(sponsorName).join(", ")}</span>
                </li>
              ))}
            </ul>
          )}

          {myCredit ? (
            <p className="member-note">
              You are credited with {formatDollars(myCredit.totalCents)} across{" "}
              {myCredit.count} donation{myCredit.count === 1 ? "" : "s"}.
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="member-card manager-card">
        <div className="manager-card-head">
          <h2 className="member-card-title">Active campaigns</h2>
          {access.canEditCampaigns ? (
            <CampaignButton
              sponsors={sponsorOptions}
              members={members}
              label="Add campaign"
              primary
            />
          ) : null}
        </div>

        {active.length === 0 ? (
          <p className="member-note">
            {access.canEditCampaigns
              ? "Start one and it will appear here."
              : "Nothing is running at the moment."}
          </p>
        ) : (
          <ul className="manager-campaigns">
            {active.map((campaign) => {
              const raised = totals.get(campaign._id);
              const pending = raised?.pendingCents ?? 0;
              // The same reading as the campaign's own page: monetary gifts
              // only, banded by status, cancelled left out.
              const progress = monetaryProgress(
                donations.filter(
                  (donation) => donation.campaignId === campaign._id
                ),
                campaign.goalCents,
                campaign.stretchGoals
              );

              return (
                <li key={campaign._id}>
                  <Link
                    href={`/manage/sponsorships/campaigns/${campaign._id}`}
                    className="manager-campaign is-link"
                  >
                    <div className="manager-campaign-head">
                      <strong>{campaign.name}</strong>
                      <span className="help-text">
                        {dateRangeLabel(campaign.startDate, campaign.endDate)}
                      </span>
                    </div>

                    {campaign.goalCents ? (
                      <>
                        <div
                          className={`manager-meter is-segmented${
                            progress.tiers.length > 0 ? " has-marks" : ""
                          }`}
                          role="img"
                          aria-label={`${progress.percent}% of the goal in monetary gifts`}
                        >
                          {progress.segments.map((segment) => (
                            <span
                              key={segment.status}
                              className={statusTone(segment.status)}
                              style={{
                                width: `${Math.min(100, segment.percent)}%`,
                              }}
                              title={`${
                                DONATION_STATUS_LABELS[segment.status]
                              }: ${formatDollars(segment.cents)}`}
                            />
                          ))}

                          {progress.tiers.length > 0 ? (
                            <span
                              className="meter-mark is-goal"
                              style={{ left: `${progress.goalPercent}%` }}
                              title={`Goal: ${formatDollars(campaign.goalCents)}`}
                            />
                          ) : null}

                          {progress.tiers.map((tier) => (
                            <span
                              key={tier.step}
                              className={`meter-mark${
                                tier.isMet ? " is-met" : ""
                              }`}
                              style={{ left: `${tier.markerPercent}%` }}
                              title={`${formatDollars(tier.thresholdCents)}: ${
                                tier.description
                              }`}
                            />
                          ))}
                        </div>
                        <div className="manager-figures">
                          <span>
                            <strong>{formatDollars(progress.totalCents)}</strong>{" "}
                            of {formatDollars(campaign.goalCents)}
                          </span>
                          <span className="manager-figure-end">
                            {progress.percent}%
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="manager-figures">
                        <span>
                          <strong>{formatDollars(progress.totalCents)}</strong> in
                          monetary gifts
                        </span>
                        <span className="manager-figure-end">no goal set</span>
                      </div>
                    )}

                    {progress.next ? (
                      <p className="help-text">
                        Next: {progress.next.description} at{" "}
                        {formatDollars(progress.next.thresholdCents)}
                        {progress.reached
                          ? ` · ${progress.reached.description} reached`
                          : ""}
                      </p>
                    ) : progress.reached ? (
                      <p className="help-text">
                        Every stretch goal reached, to{" "}
                        {progress.reached.description}.
                      </p>
                    ) : null}

                    <p className="help-text">
                      {pending > 0
                        ? `${formatDollars(pending)} still being worked on · `
                        : ""}
                      {raised?.count ?? 0} donation
                      {(raised?.count ?? 0) === 1 ? "" : "s"} from{" "}
                      {raised?.sponsorCount ?? 0} sponsor
                      {(raised?.sponsorCount ?? 0) === 1 ? "" : "s"} ·{" "}
                      {campaign.assignments.length} assigned
                    </p>
                  </Link>
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
        caption="Across every running campaign. A donation credited to more than one member is split evenly between them, so the shares add up to the whole."
      />

      {closed.length > 0 ? (
        <section className="member-card manager-card">
          <h2 className="member-card-title">Closed</h2>
          <ul className="manager-closed">
            {closed.map((campaign) => (
              <li key={campaign._id}>
                <Link href={`/manage/sponsorships/campaigns/${campaign._id}`}>
                  {campaign.name}
                </Link>
                <span>
                  {formatDollars(totals.get(campaign._id)?.realisedCents ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {access.canSeeRecords ? (
        <section className="member-card manager-card">
          <h2 className="member-card-title">Records</h2>
          <div className="member-actions">
            <Link href="/manage/sponsorships/campaigns" className="btn btn-sm">
              All campaigns ({visibleCampaignCount})
            </Link>
            <Link href="/manage/sponsorships/sponsors" className="btn btn-sm">
              All sponsors ({sponsors.length})
            </Link>
            <Link href="/manage/sponsorships/donations" className="btn btn-sm">
              All donations ({donations.length})
            </Link>
          </div>
          <p className="member-note">
            Everything on file, across every campaign. A campaign&rsquo;s own
            donations are on its page.
          </p>
        </section>
      ) : null}

      <ToneLegend />
    </>
  );
}
