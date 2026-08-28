import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import {
  canReportGroup,
  canViewGroup,
  getAnswersForGroups,
  getMetadataGroups,
  membersForGroup,
  METADATA_PERMISSIONS,
  type MetadataGroupSummary,
  type MetadataViewer,
} from "@/lib/metadata";
import {
  buildFacts,
  cellKey,
  DIMENSION_LABELS,
  pivot,
  reportDimension,
  summedQuestions,
  type ReportMember,
} from "@/lib/metadata-report";
import { fullName } from "@/lib/member-types";
import { getSession } from "@/lib/session";

export const metadata = { title: "Member data" };

/**
 * What the membership has answered, group by group.
 *
 * Nothing to configure here. Each group carries its own reading — see
 * `reportRows`, `reportColumns` and `reportSumIds` on the group — so this page
 * shows every group the reader may see, each the way that group says it should
 * be shown. A reading that is wrong is corrected where the questions are
 * written, once, rather than by everybody who opens this.
 */
export default async function MemberDataPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { permissions, roleIds } = await getUserAccess(session.userId);
  await connectDB();

  const viewer: MetadataViewer = {
    userId: session.userId,
    roleIds,
    permissions,
    isDefiner: permissions.includes(METADATA_PERMISSIONS.define),
  };

  /*
   * Only the groups whose answers this reader may already read one member's
   * of. A total is still an answer: a figure nobody may read one line of is
   * not one they may read the sum of.
   */
  const visible = (await getMetadataGroups()).filter((group) =>
    canViewGroup(viewer, group)
  );
  // Hiding the menu entry would only hide the menu entry.
  if (visible.length === 0) redirect("/dashboard");

  const answers = await getAnswersForGroups(visible);

  const reports = [];
  for (const group of visible) {
    const members = new Map<string, ReportMember>();
    for (const member of await membersForGroup(group)) {
      members.set(String(member._id), {
        _id: String(member._id),
        name: fullName(member),
      });
    }

    const facts = buildFacts(group, answers.get(group._id) ?? new Map(), members);
    reports.push({
      group,
      memberCount: members.size,
      sums: summedQuestions(group),
      table: pivot(
        facts,
        reportDimension(group.reportRows),
        reportDimension(group.reportColumns)
      ),
    });
  }

  return (
    <SiteChrome>
      <div className="member-page is-wide">
        <header className="manager-header">
          <h1 className="member-title">Member data</h1>
          <p className="member-lede">
            {visible.length} group{visible.length === 1 ? "" : "s"} you can see,
            each read the way it was set up to be read.
          </p>
        </header>

        {reports.map(({ group, memberCount, sums, table }) => (
          <GroupReport
            key={group._id}
            group={group}
            memberCount={memberCount}
            sums={sums.map((question) => question.label)}
            table={table}
            canOpen={canReportGroup(viewer, group)}
          />
        ))}
      </div>
    </SiteChrome>
  );
}

/** One group's figures, laid out the way that group asks for. */
function GroupReport({
  group,
  memberCount,
  sums,
  table,
  canOpen,
}: {
  group: MetadataGroupSummary;
  memberCount: number;
  /** The questions being added up. Empty means the figures are record counts. */
  sums: string[];
  table: ReturnType<typeof pivot>;
  /** Whether this reader may open the group's own report. */
  canOpen: boolean;
}) {
  const counting = sums.length === 0;
  const figure = (cell: { sum: number; records: number } | undefined) => {
    if (!cell) return "—";
    return counting
      ? String(cell.records)
      : cell.sum.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <section className="member-card manager-card">
      <div className="manager-card-head">
        <h2 className="member-card-title">{group.name}</h2>
        {canOpen ? (
          <Link href={`/admin/metadata/${group._id}`} className="btn btn-sm">
            Every answer
          </Link>
        ) : null}
      </div>

      <p className="help-text">
        {counting
          ? "Counting records"
          : `Adding up ${sums.join(", ")}`}
        {" · "}
        {DIMENSION_LABELS[reportDimension(group.reportRows)].toLowerCase()} down
        the side, {DIMENSION_LABELS[
          reportDimension(group.reportColumns)
        ].toLowerCase()} across the top · asked of {memberCount} member
        {memberCount === 1 ? "" : "s"}
      </p>

      {table.rows.length === 0 ? (
        <p className="member-note">
          Nothing answered yet{group.questions.length === 0 ? " — and nothing asked" : ""}.
        </p>
      ) : (
        <div className="import-preview">
          <table className="admin-table">
            <thead>
              <tr>
                <th />
                {table.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                {table.columns.length > 1 ? <th>Total</th> : null}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row}>
                  <th scope="row">{row}</th>

                  {table.columns.map((column) => (
                    <td key={column} className="is-figure">
                      {figure(table.cells.get(cellKey(row, column)))}
                    </td>
                  ))}

                  {table.columns.length > 1 ? (
                    <td className="is-figure is-total">
                      {figure(table.rowTotals.get(row))}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                {table.columns.map((column) => (
                  <td key={column} className="is-figure is-total">
                    {figure(table.columnTotals.get(column))}
                  </td>
                ))}
                {table.columns.length > 1 ? (
                  <td className="is-figure is-total">{figure(table.total)}</td>
                ) : null}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {!counting ? (
        <p className="help-text" style={{ marginTop: "0.5rem" }}>
          A question left blank is absent rather than nought, so nobody
          answering and everybody answering none are not the same figure.
        </p>
      ) : null}
    </section>
  );
}
