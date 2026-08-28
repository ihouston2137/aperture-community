import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AdminHeader } from "@/components/admin-ui";
import { getUserAccess } from "@/lib/access";
import { connectDB } from "@/lib/db";
import {
  canEditGroup,
  canReportGroup,
  canViewGroup,
  getGroupAnswers,
  getMetadataGroup,
  membersForGroup,
  type MetadataViewer,
} from "@/lib/metadata";
import {
  answerAcross,
  isAnswered,
  METADATA_PERMISSIONS,
  unanswered,
} from "@/lib/metadata-types";
import { fullName } from "@/lib/member-types";
import { requireSession } from "@/lib/session";

import { AnswerButton } from "./answer-button";

export const metadata = { title: "Metadata report" };

/**
 * Everybody a group is asked of, and what each of them has answered.
 *
 * The report is its own grant. Somebody trusted to read one member's answers
 * on that member's record has not necessarily been trusted with the whole
 * membership on one screen, which is a different thing to hold — so this page
 * asks `canReportGroup` rather than `canViewGroup`.
 */
export default async function MetadataReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  const { permissions, roleIds } = await getUserAccess(session.userId);
  await connectDB();

  const group = await getMetadataGroup(id);
  if (!group) notFound();

  const viewer: MetadataViewer = {
    userId: session.userId,
    roleIds,
    permissions,
    isDefiner: permissions.includes(METADATA_PERMISSIONS.define),
  };

  // Hiding the link would only hide the link.
  if (!canReportGroup(viewer, group)) redirect("/admin");

  /*
   * A manager-managed group's answers are only shown to somebody allowed to
   * read them. Being allowed to open the report is not the same grant: it says
   * who may see who has answered, which is often the whole question a
   * committee is asking.
   */
  const showAnswers =
    group.managedBy === "member" || canViewGroup(viewer, group);
  const canEdit = group.managedBy === "manager" && canEditGroup(viewer, group);

  const [members, answers] = await Promise.all([
    membersForGroup(group),
    getGroupAnswers(group),
  ]);

  const rows = members.map((member) => {
    const entries = answers.get(String(member._id))?.entries ?? [];
    return {
      _id: String(member._id),
      name: fullName(member),
      isInactive: member.isActive === false,
      entries,
      outstanding: unanswered(group, entries).length,
      // Counted on the first entry: it is what "has this member started"
      // means, and a second contact does not make the first one more answered.
      answered: group.questions.filter((question) =>
        isAnswered(question, entries[0]?.values ?? [])
      ).length,
    };
  });

  const complete = rows.filter(
    (row) => row.answered === group.questions.length
  ).length;
  const untouched = rows.filter((row) => row.answered === 0).length;

  return (
    <>
      <AdminHeader
        title={group.name}
        subtitle={
          group.description ||
          "Everybody this group is asked of, and what they have answered."
        }
        actions={
          <Link href="/admin/metadata" className="btn btn-sm">
            All groups
          </Link>
        }
      />

      <div className="report-figures" style={{ marginBottom: "1.25rem" }}>
        <span className="report-figure">
          <strong>{rows.length}</strong>
          <span className="help-text">
            member{rows.length === 1 ? "" : "s"} it is asked of
          </span>
        </span>
        <span className="report-figure">
          <strong>{complete}</strong>
          <span className="help-text">have answered everything</span>
        </span>
        <span
          className={`report-figure${untouched > 0 ? " is-flagged" : ""}`}
        >
          <strong>{untouched}</strong>
          <span className="help-text">have answered nothing</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="member-note">
          Nobody holds the membership levels this group is asked of.
        </p>
      ) : (
        <div className="import-preview">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Member</th>
                {group.isRepeatable ? <th>Entries</th> : null}
                {group.questions.map((question) => (
                  <th key={question.id}>
                    {question.label}
                    {question.isRequired ? " *" : ""}
                  </th>
                ))}
                {canEdit ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  <td>
                    {row.name}
                    {row.isInactive ? (
                      <span className="badge" style={{ marginLeft: "0.4rem" }}>
                        inactive
                      </span>
                    ) : null}
                    {row.outstanding > 0 ? (
                      <span className="help-text">
                        {row.outstanding} required unanswered
                      </span>
                    ) : null}
                  </td>

                  {group.isRepeatable ? <td>{row.entries.length}</td> : null}

                  {group.questions.map((question) => (
                    <td key={question.id}>
                      {showAnswers
                        ? answerAcross(question, row.entries) || "—"
                        : isAnswered(question, row.entries[0]?.values ?? [])
                          ? "answered"
                          : "—"}
                    </td>
                  ))}

                  {canEdit ? (
                    <td>
                      <AnswerButton
                        group={group}
                        userId={row._id}
                        userName={row.name}
                        entries={row.entries}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showAnswers ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          You may see who has answered this group, but not what they answered.
          Reading the answers is a separate grant, set on the group itself.
        </p>
      ) : null}
    </>
  );
}
