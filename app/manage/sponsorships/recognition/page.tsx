import Link from "next/link";
import { redirect } from "next/navigation";

import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { sponsorshipAccess } from "@/lib/sponsorship-access";
import {
  formatDollars,
  primaryLogo,
  sponsorLogoSrc,
} from "@/lib/sponsorship-types";
import {
  getCampaigns,
  getDonations,
  getRecognitionLevels,
  getSponsors,
  recognitionReport,
  type RecognitionRow,
} from "@/lib/sponsorships";

import { ChangeLevelButton } from "../sponsor-controls";

export const metadata = { title: "Recognition" };

/**
 * Who is being recognised, and who ought to be.
 *
 * The second question is the one that goes unasked. A sponsor who has paid for
 * a campaign and appears nowhere on the site is an oversight nothing else
 * surfaces — the donation record looks complete, because the donation is
 * recorded. This page puts the two lists beside each other so the gap between
 * them is the thing being read.
 */
export default async function RecognitionDashboard() {
  const session = await getSession();
  const { permissions } = await getUserAccess(session!.userId);
  const access = sponsorshipAccess(permissions);

  // The whole-programme view is its own grant, the same as the records lists:
  // this is every sponsor on file, not the two somebody looks after.
  if (!access.canSeeRecords) redirect("/manage/sponsorships");

  await connectDB();

  const [sponsors, campaigns, donations, levels] = await Promise.all([
    getSponsors(),
    getCampaigns(),
    getDonations(),
    getRecognitionLevels(),
  ]);

  const report = recognitionReport(sponsors, campaigns, donations);
  const active = campaigns.filter((campaign) => campaign.status === "active");
  const levelName = (id: string) =>
    levels.find((level) => level._id === id)?.name ?? "a level that has gone";

  return (
    <>
      <nav className="manager-crumbs" aria-label="Breadcrumb">
        <Link href="/manage/sponsorships">Sponsorships</Link>
        <span aria-hidden="true">›</span>
        <span>Recognition</span>
      </nav>

      <header className="manager-header">
        <h1 className="member-title">Recognition</h1>
        <p className="member-lede">
          {active.length === 0
            ? "Nothing is running, so the figures below are of nothing."
            : `Against the ${active.length} campaign${
                active.length === 1 ? "" : "s"
              } now running.`}
        </p>
      </header>

      <section className="member-card manager-card">
        <div className="manager-card-head">
          <h2 className="member-card-title">
            Being recognised ({report.recognised.length})
          </h2>
          <span className="stretch-block-figure">
            {formatDollars(report.recognisedCents)} from running campaigns
          </span>
        </div>

        {report.recognised.length === 0 ? (
          <p className="member-note">
            Nobody is at a recognition level yet.
          </p>
        ) : (
          <ul className="recognition-rows">
            {report.recognised.map((row) => (
              <RecognitionLine
                key={row._id}
                row={row}
                levelLabel={levelName(row.recognitionLevelId)}
                levels={levels}
                canEdit={access.canEditSponsors}
              />
            ))}
          </ul>
        )}
      </section>

      <section
        className={`member-card manager-card${
          report.unrecognised.length > 0 ? " is-flagged" : ""
        }`}
      >
        <div className="manager-card-head">
          <h2 className="member-card-title">
            Given, but not recognised ({report.unrecognised.length})
          </h2>
          <span className="stretch-block-figure">
            {formatDollars(report.unrecognisedCents)} unthanked
          </span>
        </div>

        {report.unrecognised.length === 0 ? (
          <p className="member-note">
            Everybody who has given to a running campaign is at a level.
          </p>
        ) : (
          <>
            <p className="help-text">
              These sponsors have given to a campaign now running and sit at no
              recognition level, so nothing on the site names them. Putting one
              at a level is the whole of what this page is for.
            </p>

            <ul className="recognition-rows">
              {report.unrecognised.map((row) => (
                <RecognitionLine
                  key={row._id}
                  row={row}
                  levelLabel=""
                  levels={levels}
                  canEdit={access.canEditSponsors}
                />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

/** One sponsor: who they are, what they have given, and the level they hold. */
function RecognitionLine({
  row,
  levelLabel,
  levels,
  canEdit,
}: {
  row: RecognitionRow;
  /** Empty for a sponsor at no level. */
  levelLabel: string;
  levels: Awaited<ReturnType<typeof getRecognitionLevels>>;
  canEdit: boolean;
}) {
  const logoSrc = sponsorLogoSrc(primaryLogo(row.logos));

  return (
    <li className="recognition-row">
      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc} alt="" className="recognition-logo" />
      ) : (
        <span className="recognition-logo is-empty" aria-hidden="true" />
      )}

      <div className="recognition-who">
        <strong>{row.name}</strong>
        <span className="recognition-level">
          {levelLabel || "no level"}
          {row.campaignCount > 0
            ? ` · ${row.count} donation${row.count === 1 ? "" : "s"} across ${
                row.campaignCount
              } campaign${row.campaignCount === 1 ? "" : "s"}`
            : " · nothing from a running campaign"}
        </span>
      </div>

      {/* Money and in-kind are never added into one figure, however tempting a
          single number would be on a list like this. */}
      <div className="recognition-figures">
        <strong>{formatDollars(row.monetaryCents)}</strong>
        {row.inKindCents > 0 ? (
          <span className="help-text">
            and {formatDollars(row.inKindCents)} in kind
          </span>
        ) : null}
      </div>

      {canEdit ? (
        <ChangeLevelButton
          sponsorId={row._id}
          levels={levels}
          current={row.recognitionLevelId}
          label={levelLabel ? "Change" : "Recognise"}
        />
      ) : null}
    </li>
  );
}
