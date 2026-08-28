import { redirect } from "next/navigation";

import { SiteChrome } from "@/components/site-chrome";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import {
  canViewGroup,
  getAnswersForGroups,
  getMetadataGroups,
  membersForGroup,
  METADATA_PERMISSIONS,
  type MetadataViewer,
} from "@/lib/metadata";
import {
  buildFacts,
  cellKey,
  numberQuestions,
  pivot,
  readReportSettings,
  questionLabel,
  type ReportMember,
} from "@/lib/metadata-report";
import { fullName } from "@/lib/member-types";
import { getSession } from "@/lib/session";

import { ReportControls, type SummableQuestion } from "./report-controls";

export const metadata = { title: "Member data" };

/**
 * What the membership has answered, added up however the reader needs it.
 *
 * Three settings and one table. The alternative was a screen per question
 * somebody might ask, each obsolete the moment a new group was defined — so
 * the dashboard is told what to group by rather than knowing in advance.
 *
 * It reports only on the groups this reader may already see one member's
 * answers to. Totals are still answers: a figure nobody may read one line of
 * is not one they may read the sum of.
 */
export default async function MemberDataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  const visible = (await getMetadataGroups()).filter((group) =>
    canViewGroup(viewer, group)
  );
  // Hiding the menu entry would only hide the menu entry.
  if (visible.length === 0) redirect("/dashboard");

  const settings = readReportSettings(await searchParams);

  // Everybody the visible groups are asked of, named once however many groups
  // they appear on.
  const members = new Map<string, ReportMember>();
  for (const group of visible) {
    for (const member of await membersForGroup(group)) {
      const id = String(member._id);
      if (!members.has(id)) members.set(id, { _id: id, name: fullName(member) });
    }
  }

  const answers = await getAnswersForGroups(visible);
  const facts = buildFacts(visible, answers, members, settings.questionIds);
  const table = pivot(facts, settings.rowDimension, settings.columnDimension);

  const summable: SummableQuestion[] = numberQuestions(visible).map((entry) => ({
    id: entry.question.id,
    label: entry.question.label,
    groupName: entry.groupName,
  }));

  const money = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <SiteChrome>
      <div className="member-page is-wide">
        <header className="manager-header">
          <h1 className="member-title">Member data</h1>
          <p className="member-lede">
            {visible.length} metadata group{visible.length === 1 ? "" : "s"} you
            can see, across {members.size} member
            {members.size === 1 ? "" : "s"}.
          </p>
        </header>

        <ReportControls settings={settings} questions={summable} />

        <section className="member-card manager-card">
          <div className="manager-card-head">
            <h2 className="member-card-title">Totals</h2>
            <span className="stretch-block-figure">
              {money(table.total.sum)} across {table.total.records} record
              {table.total.records === 1 ? "" : "s"}
            </span>
          </div>

          {facts.length === 0 ? (
            <p className="member-note">
              {summable.length === 0
                ? "Nothing to add up yet. A group needs a number question before it can be totalled."
                : "Nobody has answered the questions being added up."}
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
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={row}>
                      <th scope="row">{row}</th>

                      {table.columns.map((column) => {
                        const cell = table.cells.get(cellKey(row, column));
                        return (
                          <td key={column} className="is-figure">
                            {cell ? (
                              <>
                                {money(cell.sum)}
                                {/* The records behind the figure, so a large
                                    total from one answer is not read as many. */}
                                <span className="help-text">
                                  {cell.records}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      })}

                      <td className="is-figure is-total">
                        {money(table.rowTotals.get(row)?.sum ?? 0)}
                        <span className="help-text">
                          {table.rowTotals.get(row)?.records ?? 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    {table.columns.map((column) => (
                      <td key={column} className="is-figure is-total">
                        {money(table.columnTotals.get(column)?.sum ?? 0)}
                        <span className="help-text">
                          {table.columnTotals.get(column)?.records ?? 0}
                        </span>
                      </td>
                    ))}
                    <td className="is-figure is-total">
                      {money(table.total.sum)}
                      <span className="help-text">{table.total.records}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="help-text" style={{ marginTop: "0.75rem" }}>
            The small figure under each total is how many records it came from.
            A question left blank is absent rather than counted as nought, so
            &ldquo;nobody answered&rdquo; and &ldquo;everybody said none&rdquo;
            do not look the same.
          </p>
        </section>

        <section className="member-card manager-card">
          <h2 className="member-card-title">Reporting on</h2>
          <ul className="admin-list">
            {visible.map((group) => (
              <li key={group._id} className="admin-list-item">
                <div>
                  <h3>{group.name}</h3>
                  <div className="admin-list-meta">
                    {group.questions
                      .filter((question) => question.type === "number")
                      .map((question) => questionLabel(group, question))
                      .join(", ") || "no number questions"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SiteChrome>
  );
}
