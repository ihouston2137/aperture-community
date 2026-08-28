import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { formatPhone, fullName } from "@/lib/member-types";
import { getRoleSummaries } from "@/lib/members";
import { User } from "@/lib/models";
import { getSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import {
  DONATION_KIND_LABELS,
  DONATION_STATUS_LABELS,
  SPONSOR_TYPE_LABELS,
  contributionsByCampaign,
  formatDateLabel,
  formatDollars,
  primaryLogo,
  sponsorChips,
  sponsorLogoSrc,
  statusTone,
} from "@/lib/sponsorship-types";
import {
  getCampaigns,
  getDonations,
  getRecognitionLevels,
  getSponsorCategories,
  getSponsors,
} from "@/lib/sponsorships";

import { ContactButton, DeleteContactButton } from "../../../../contact-controls";
import { DonationButton } from "../../../../record-buttons";
import { ToneLegend } from "../../../../tone-legend";
import {
  ChangeAssignedButton,
  ChangeLevelButton,
  SponsorLogosButton,
} from "../../../../sponsor-controls";

/**
 * One sponsor, on one campaign.
 *
 * The bottom of the drill-down: everything this sponsor has given to this
 * campaign, who is looking after them for it, how to reach them, and — at the
 * foot — what they have given over the years, which is the thing anybody
 * preparing to ask them again wants to know.
 */
export default async function CampaignSponsorDashboard({
  params,
}: {
  params: Promise<{ id: string; sponsorId: string }>;
}) {
  const { id, sponsorId } = await params;

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
      User.find({ isActive: { $ne: false } })
        .select("_id firstName lastName name email roleIds")
        .sort({ lastName: 1, firstName: 1, email: 1 })
        .lean<any[]>(),
      getRoleSummaries("community"),
    ]);

  const campaign = campaigns.find((entry) => entry._id === id);
  const sponsor = sponsors.find((entry) => entry._id === sponsorId);
  if (!campaign || !sponsor) notFound();

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
    .map((user) => ({ _id: String(user._id), name: fullName(user) }));

  const memberName = (memberId: string) =>
    members.find((member) => member._id === memberId)?.name ?? "somebody who has gone";

  const assignment = campaign.assignments.find(
    (entry) => entry.sponsorId === sponsorId
  );

  const fromThisSponsor = donations.filter(
    (donation) => donation.sponsorId === sponsorId
  );
  const here = fromThisSponsor.filter(
    (donation) => donation.campaignId === campaign._id
  );
  const chips = sponsorChips(here);

  // What they have given, campaign by campaign. Closed campaigns are part of
  // somebody's giving history whether or not this reader may open them, so the
  // figures stand either way — only the link is withheld.
  const history = contributionsByCampaign(fromThisSponsor);
  const historyTotal = history.reduce((sum, row) => sum + row.cents, 0);
  const largest = history.reduce((most, row) => Math.max(most, row.cents), 0);

  const level = levels.find((entry) => entry._id === sponsor.recognitionLevelId);
  const logoSrc = sponsorLogoSrc(primaryLogo(sponsor.logos));

  const categoryName = (id: string) =>
    categories.find((category) => category._id === id)?.name ?? "";

  const campaignOptions = campaigns.map((entry) => ({
    _id: entry._id,
    name: entry.name,
    isClosed: entry.status === "closed",
    stretchGoals: entry.stretchGoals,
  }));
  const sponsorOptions = sponsors.map((entry) => ({
    _id: entry._id,
    name: entry.name,
  }));

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/manage/sponsorships">Sponsorships</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/manage/sponsorships/campaigns/${campaign._id}`}>
          {campaign.name}
        </Link>
        <span aria-hidden="true">›</span>
        <span>{sponsor.name}</span>
      </nav>

      <header className="manager-header sponsor-header">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} alt="" className="sponsor-header-logo" />
        ) : null}
        <div>
          <h1 className="member-title">{sponsor.name}</h1>
          <p className="member-lede">
            {SPONSOR_TYPE_LABELS[sponsor.type]}
            {sponsor.industry ? ` · ${sponsor.industry}` : ""}
          </p>
        </div>

        {/* Artwork is wanted at the moment somebody is looking at the sponsor,
            so the way to it is here rather than in the media library. */}
        <span className="sponsor-header-actions">
          <SponsorLogosButton
            sponsorId={sponsor._id}
            sponsorName={sponsor.name}
            logos={sponsor.logos}
            canEdit={access.canEditSponsors}
          />
        </span>
      </header>

      <section className="member-card manager-card">
        <h2 className="member-card-title">On this campaign</h2>

        <dl className="member-facts">
          <dt>Recognition</dt>
          <dd className="sponsor-row-value">
            <strong>{level?.name ?? "Not recognised"}</strong>
            {access.canEditSponsors ? (
              <ChangeLevelButton
                sponsorId={sponsor._id}
                levels={levels}
                current={sponsor.recognitionLevelId}
                icon
              />
            ) : null}
          </dd>

          <dt>Looked after by</dt>
          <dd className="sponsor-row-value">
            <em>
              {!assignment || assignment.memberIds.length === 0
                ? "nobody"
                : assignment.memberIds.map(memberName).join(", ")}
            </em>
            {access.canEditCampaigns && assignment ? (
              <ChangeAssignedButton
                campaignId={campaign._id}
                sponsorId={sponsor._id}
                sponsorName={sponsor.name}
                members={members}
                assigned={assignment.memberIds}
                icon
              />
            ) : null}
          </dd>
        </dl>

        {chips.length > 0 ? (
          <div className="sponsor-line-chips" style={{ marginTop: "1rem" }}>
            {chips.map((chip) => (
              <span
                key={chip.key}
                className={`tone-chip ${chip.tone}`}
                title={chip.label}
              >
                <span className="tone-dot" aria-hidden="true" />
                <span className="visually-hidden">{chip.label}</span>
                {formatDollars(chip.cents)}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      <section className="member-card manager-card">
        <div className="manager-card-head">
          <h2 className="member-card-title">
            Donations to this campaign ({here.length})
          </h2>
          {access.canEditDonations ? (
            <DonationButton
              campaigns={campaignOptions}
              sponsors={sponsorOptions}
              members={members}
              categories={categories}
              defaultSponsorId={sponsor._id}
              defaultCampaignId={campaign._id}
              label="Record a donation"
              primary
            />
          ) : null}
        </div>

        {here.length === 0 ? (
          <p className="member-note">Nothing recorded from them on this campaign.</p>
        ) : (
          <ul className="manager-donations">
            {here.map((donation) => (
              <li key={donation._id}>
                <div style={{ minWidth: 0 }}>
                  <strong>
                    {formatDollars(donation.valueCents)}{" "}
                    <span className="help-text">
                      {DONATION_KIND_LABELS[donation.kind]}
                    </span>
                  </strong>
                  <span className="help-text">
                    {donation.date ? `${formatDateLabel(donation.date)}` : "no date"}
                    {donation.memberIds.length > 0
                      ? ` · ${donation.memberIds.map(memberName).join(", ")}`
                      : ""}
                    {donation.categoryIds.length > 0
                      ? ` · ${donation.categoryIds
                          .map(categoryName)
                          .filter(Boolean)
                          .join(", ")}`
                      : ""}
                  </span>
                  {donation.description ? (
                    <span className="help-text">{donation.description}</span>
                  ) : null}
                </div>

                <span className={`tone-pill ${statusTone(donation.status)}`}>
                  <span className="tone-dot" aria-hidden="true" />
                  {DONATION_STATUS_LABELS[donation.status]}
                </span>

                {access.canEditDonations ? (
                  <DonationButton
                    donation={donation}
                    campaigns={campaignOptions}
                    sponsors={sponsorOptions}
                    members={members}
                    categories={categories}
                    label={`Edit this ${DONATION_KIND_LABELS[
                      donation.kind
                    ].toLowerCase()} donation`}
                    icon
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="member-card manager-card">
        <div className="manager-card-head">
          <h2 className="member-card-title">How to reach them</h2>
          {access.canEditSponsors ? <ContactButton sponsorId={sponsor._id} /> : null}
        </div>

        <div className="sponsor-detail-columns">
          <dl className="member-facts">
            <dt>Email</dt>
            <dd>
              {sponsor.email ? (
                <a href={`mailto:${sponsor.email}`}>{sponsor.email}</a>
              ) : (
                "—"
              )}
            </dd>

            <dt>Phone</dt>
            <dd>{formatPhone(sponsor.phone) || "—"}</dd>

            <dt>Categories</dt>
            <dd>
              {sponsor.categoryIds.length === 0
                ? "—"
                : sponsor.categoryIds.map(categoryName).filter(Boolean).join(", ")}
            </dd>

            <dt>Website</dt>
            <dd>
              {sponsor.website ? (
                <a href={sponsor.website} target="_blank" rel="noreferrer">
                  {sponsor.website}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </dl>

          <dl className="member-facts">
            <dt>Address</dt>
            <dd className="sponsor-address">{sponsor.address || "—"}</dd>
          </dl>
        </div>

        {sponsor.contacts.length === 0 ? (
          <p className="member-note">
            No contacts on file.
            {access.canEditSponsors ? " Add the person to ask for." : ""}
          </p>
        ) : (
          <ul className="manager-donations" style={{ marginTop: "1rem" }}>
            {sponsor.contacts.map((contact, index) => (
              <li key={`${contact.name}-${index}`}>
                <div style={{ minWidth: 0 }}>
                  <strong>{contact.name || "no name"}</strong>
                  <span className="help-text">
                    {contact.title || "no title"}
                    {contact.email ? ` · ${contact.email}` : ""}
                    {contact.phone ? ` · ${formatPhone(contact.phone)}` : ""}
                  </span>
                </div>

                {access.canEditSponsors ? (
                  <>
                    <ContactButton
                      sponsorId={sponsor._id}
                      contact={contact}
                      index={index}
                    />
                    <DeleteContactButton
                      sponsorId={sponsor._id}
                      contact={contact}
                      index={index}
                    />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="member-card manager-card">
        <h2 className="member-card-title">What they have given</h2>

        {history.length === 0 ? (
          <p className="member-note">Nothing recorded from them on any campaign.</p>
        ) : (
          <>
            <ul className="contrib-rows">
              {history.map((row) => {
                const named = campaigns.find((entry) => entry._id === row.campaignId);
                const isHere = row.campaignId === campaign._id;
                const reachable =
                  named && (named.status !== "closed" || access.canSeeClosed);

                return (
                  <li key={row.campaignId} className="contrib-row">
                    <span className="contrib-name">
                      {reachable ? (
                        <Link
                          href={`/manage/sponsorships/campaigns/${row.campaignId}/sponsors/${sponsor._id}`}
                        >
                          {named?.name ?? "a campaign that has gone"}
                        </Link>
                      ) : (
                        (named?.name ?? "a campaign that has gone")
                      )}
                      {isHere ? (
                        <span className="badge">this campaign</span>
                      ) : null}
                    </span>

                    {/* Each campaign's bar is drawn against the largest, so the
                        rows can be compared by eye rather than by reading. */}
                    <span className="contrib-bar" aria-hidden="true">
                      {row.chips.map((chip) => (
                        <span
                          key={chip.key}
                          className={chip.tone}
                          style={{
                            width: largest
                              ? `${(chip.cents / largest) * 100}%`
                              : "0%",
                          }}
                        />
                      ))}
                    </span>

                    <span className="contrib-amount">
                      {formatDollars(row.cents)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <p className="contrib-total">
              <span>
                Total across {history.length} campaign
                {history.length === 1 ? "" : "s"}
              </span>
              <strong>{formatDollars(historyTotal)}</strong>
            </p>
          </>
        )}
      </section>

      <ToneLegend />
    </>
  );
}
