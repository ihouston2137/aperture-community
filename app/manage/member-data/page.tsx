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
  COUNT_BY_LABELS,
  GROUP_BY_LABELS,
  reportDimension,
  summarise,
  type ReportMember,
  type ReportTable,
} from "@/lib/metadata-report";
import { fullName } from "@/lib/member-types";
import { getSession } from "@/lib/session";

export const metadata = { title: "Member data" };

/**
 * What the membership has answered, group by group.
 *
 * Nothing to configure here. Each group says what to group by, what to count,
 * and which numbers to add up — so this page shows every group the reader may
 * see, each read the way that group asks to be read. A reading that is wrong
 * is corrected where the questions are written, once, rather than by everybody
 * who opens this.
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
   * Only groups whose answers this reader may already read one member's of. A
   * total is still an answer: a figure nobody may read one line of is not one
   * they may read the sum of.
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
      table: summarise(group, facts),
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

        {reports.map(({ group, memberCount, table }) => (
          <GroupReport
            key={group._id}
            group={group}
            memberCount={memberCount}
            table={table}
            canOpen={canReportGroup(viewer, group)}
          />
        ))}
      </div>
    </SiteChrome>
  );
}

/** One group, grouped and counted the way it asks to be. */
function GroupReport({
  group,
  memberCount,
  table,
  canOpen,
}: {
  group: MetadataGroupSummary;
  memberCount: number;
  table: ReportTable;
  canOpen: boolean;
}) {
  const groupBy = reportDimension(group.reportGroupBy);
  const countBy = reportDimension(group.reportCountBy);

  const questionName = (id: string) =>
    group.questions.find((question) => question.id === id)?.label ?? "a question";

  const heading =
    groupBy === "question"
      ? questionName(group.reportGroupQuestionId)
      : GROUP_BY_LABELS[groupBy];

  const countHeading =
    countBy === "question"
      ? `${questionName(group.reportCountQuestionId)} answers`
      : COUNT_BY_LABELS[countBy];

  const figure = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 2 });

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
        Grouped by {heading.toLowerCase()}, counting{" "}
        {countHeading.toLowerCase()}
        {table.sumQuestions.length > 0
          ? `, adding up ${table.sumQuestions
              .map((question) => question.label)
              .join(", ")}`
          : ""}
        {" · "}asked of {memberCount} member{memberCount === 1 ? "" : "s"}
      </p>

      {table.rows.length === 0 ? (
        <p className="member-note">
          Nothing answered yet
          {group.questions.length === 0 ? " — and nothing asked" : ""}.
        </p>
      ) : (
        <div className="import-preview">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{heading}</th>
                <th className="is-figure">{countHeading}</th>
                {table.sumQuestions.map((question) => (
                  <th key={question.id} className="is-figure">
                    {question.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td className="is-figure">{figure(row.count)}</td>
                  {table.sumQuestions.map((question) => (
                    <td key={question.id} className="is-figure">
                      {row.sums.has(question.id)
                        ? figure(row.sums.get(question.id) ?? 0)
                        : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="is-figure is-total">{figure(table.total.count)}</td>
                {table.sumQuestions.map((question) => (
                  <td key={question.id} className="is-figure is-total">
                    {figure(table.total.sums.get(question.id) ?? 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {table.sumQuestions.length > 0 ? (
        <p className="help-text" style={{ marginTop: "0.5rem" }}>
          A question left blank is absent rather than nought, so nobody
          answering and everybody answering none are not the same figure.
        </p>
      ) : null}
    </section>
  );
}
