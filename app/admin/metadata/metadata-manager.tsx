"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import {
  DIMENSION_HELP,
  DIMENSION_LABELS,
  REPORT_DIMENSIONS,
} from "@/lib/metadata-report";
import {
  isChoiceType,
  MANAGED_BY,
  METADATA_PERMISSIONS,
  MANAGED_BY_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_HELP,
  QUESTION_TYPE_LABELS,
  questionType,
  type ManagedBy,
  type MetadataGroupSummary,
  type MetadataQuestion,
  type QuestionType,
} from "@/lib/metadata-types";

import {
  deleteMetadataGroupAction,
  saveMetadataGroupAction,
} from "./actions";

export type RoleChoice = {
  _id: string;
  name: string;
  /** What the role carries, so a grant it cannot use can be marked as such. */
  permissions?: string[];
};
export type UserChoice = { _id: string; name: string };

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; group: MetadataGroupSummary }
  | null;

/** A question while it is being written; the id is minted on first save. */
function blankQuestion(): MetadataQuestion {
  return {
    id: "",
    label: "",
    help: "",
    type: "short",
    options: [],
    isRequired: false,
  };
}

/**
 * The metadata groups a site keeps, and what each one asks.
 *
 * Everything about who may read and change a group lives on the group, so this
 * is one screen rather than a definition here and a permission matrix
 * somewhere else. The distinction that matters most is at the top of the
 * dialog: whether the member answers it, or it is kept about them.
 */
export function MetadataManager({
  groups,
  communityRoles,
  managementRoles,
  users,
}: {
  groups: MetadataGroupSummary[];
  /** Membership levels — what a group can be asked of. */
  communityRoles: RoleChoice[];
  /** Management roles — what access to a group can be granted through. */
  managementRoles: RoleChoice[];
  /** Active accounts, for naming somebody directly on a group. */
  users: UserChoice[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const roleName = (id: string) =>
    communityRoles.find((role) => role._id === id)?.name ??
    managementRoles.find((role) => role._id === id)?.name ??
    "a role that has gone";

  return (
    <Panel title={`Metadata groups (${groups.length})`}>
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setDialog({ mode: "create" })}
        >
          Add group
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          None yet. A group is a set of questions asked of the members holding a
          membership level — either of them, or about them.
        </p>
      ) : (
        <ul className="admin-list" style={{ marginTop: "1rem" }}>
          {groups.map((group) => (
            <li key={group._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3>
                  {group.name}
                  <span
                    className={`badge${
                      group.managedBy === "manager" ? " badge-draft" : ""
                    }`}
                    style={{ marginLeft: "0.5rem" }}
                  >
                    {group.managedBy === "manager" ? "managed" : "member"}
                  </span>
                </h3>
                <div className="admin-list-meta">
                  {group.description || "no description"}
                </div>
                <div className="admin-list-meta">
                  {group.questions.length} question
                  {group.questions.length === 1 ? "" : "s"}
                  {group.isRepeatable
                    ? `, repeated${
                        group.maxEntries > 0 ? ` up to ${group.maxEntries}×` : ""
                      }`
                    : ""}
                  {group.questions.some((question) => question.isRequired)
                    ? `, ${
                        group.questions.filter((question) => question.isRequired)
                          .length
                      } required`
                    : ""}
                  {" · asked of "}
                  {group.roleIds.length === 0
                    ? "nobody yet"
                    : group.roleIds.map(roleName).join(", ")}
                </div>
              </div>

              <div className="admin-list-actions">
                <Link
                  href={`/admin/metadata/${group._id}`}
                  className="btn btn-sm"
                >
                  Report
                </Link>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDialog({ mode: "edit", group })}
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <GroupDialog
          group={dialog.mode === "edit" ? dialog.group : undefined}
          communityRoles={communityRoles}
          managementRoles={managementRoles}
          users={users}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </Panel>
  );
}

function GroupDialog({
  group,
  communityRoles,
  managementRoles,
  users,
  onClose,
  onSaved,
}: {
  group?: MetadataGroupSummary;
  communityRoles: RoleChoice[];
  managementRoles: RoleChoice[];
  users: UserChoice[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<ManagedBy>(group?.managedBy ?? "member");
  const [repeats, setRepeats] = useState(group?.isRepeatable ?? false);
  const [reportRows, setReportRows] = useState(group?.reportRows ?? "user");
  const [reportColumns, setReportColumns] = useState(
    group?.reportColumns ?? "question"
  );

  const [questions, setQuestions] = useState<MetadataQuestion[]>(
    group?.questions ?? [blankQuestion()]
  );
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  /*
   * The number questions as they stand in the dialog, not as they were saved:
   * somebody adding one and choosing it in the same pass should not have to
   * save twice.
   */
  const summable = questions.filter(
    (question) => question.type === "number" && question.label.trim() !== ""
  );

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  function update(index: number, patch: Partial<MetadataQuestion>) {
    setQuestions((current) =>
      current.map((question, position) =>
        position === index ? { ...question, ...patch } : question
      )
    );
  }

  function save(formData: FormData) {
    setError("");
    formData.set("questions", JSON.stringify(questions));

    startTransition(async () => {
      const result = await saveMetadataGroupAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that group.");
    });
  }

  function remove() {
    if (!group) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", group._id);
      const result = await deleteMetadataGroupAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that group.");
    });
  }

  const title = group ? "Edit metadata group" : "Add metadata group";

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal is-wide"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <form action={save} className="style-modal-form">
            <div className="style-modal-header">
              <strong>{title}</strong>
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
                onClick={onClose}
              >
                Close
              </button>
            </div>

            <div className="style-modal-body">
              {group ? <input type="hidden" name="id" value={group._id} /> : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field">
                <label htmlFor="metadata-name">Name</label>
                <input
                  id="metadata-name"
                  name="name"
                  type="text"
                  defaultValue={group?.name ?? ""}
                  placeholder="Emergency contacts, Shirt sizes…"
                  required
                />
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="metadata-description">Description</label>
                <textarea
                  id="metadata-description"
                  name="description"
                  rows={2}
                  defaultValue={group?.description ?? ""}
                  placeholder="What this is for, in the words the member will read."
                />
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="metadata-kind">Who answers it</label>
                <select
                  id="metadata-kind"
                  name="managedBy"
                  value={kind}
                  disabled={pending}
                  onChange={(event) =>
                    setKind(questionKind(event.target.value))
                  }
                >
                  {MANAGED_BY.map((entry) => (
                    <option key={entry} value={entry}>
                      {MANAGED_BY_LABELS[entry]}
                    </option>
                  ))}
                </select>
                <span className="help-text">
                  {kind === "member"
                    ? "The member fills it in on their dashboard, and a required question is put in front of them at sign-in until they have."
                    : "The member never sees it. Who may read it and who may change it are set below."}
                </span>
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <span className="field-label">Asked of</span>
                <ChipPicker
                  name="roleIds"
                  options={communityRoles}
                  chosen={group?.roleIds ?? []}
                />
                <span className="help-text">
                  The membership levels this is asked of. Inactive accounts
                  holding one are included, so a group can still be reported on
                  after somebody has left.
                </span>
              </div>

              <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                Questions
              </h4>

              {questions.map((question, index) => (
                <div key={index} className="metadata-question">
                  <div className="field-grid">
                    <div className="field">
                      <label htmlFor={`question-label-${index}`}>Question</label>
                      <input
                        id={`question-label-${index}`}
                        type="text"
                        value={question.label}
                        placeholder="What size shirt do you take?"
                        disabled={pending}
                        onChange={(event) =>
                          update(index, { label: event.target.value })
                        }
                      />
                    </div>

                    <div className="field">
                      <label htmlFor={`question-type-${index}`}>Answer</label>
                      <select
                        id={`question-type-${index}`}
                        value={question.type}
                        disabled={pending}
                        onChange={(event) =>
                          update(index, {
                            type: questionType(event.target.value) as QuestionType,
                          })
                        }
                      >
                        {QUESTION_TYPES.map((entry) => (
                          <option key={entry} value={entry}>
                            {QUESTION_TYPE_LABELS[entry]}
                          </option>
                        ))}
                      </select>
                      <span className="help-text">
                        {QUESTION_TYPE_HELP[question.type]}
                      </span>
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: "0.5rem" }}>
                    <label htmlFor={`question-help-${index}`}>Help text</label>
                    <input
                      id={`question-help-${index}`}
                      type="text"
                      value={question.help}
                      placeholder="Anything the member needs to know to answer it."
                      disabled={pending}
                      onChange={(event) =>
                        update(index, { help: event.target.value })
                      }
                    />
                  </div>

                  {isChoiceType(question.type) ? (
                    <div className="field" style={{ marginTop: "0.5rem" }}>
                      <label htmlFor={`question-options-${index}`}>
                        The answers offered
                      </label>
                      <textarea
                        id={`question-options-${index}`}
                        rows={3}
                        value={question.options.join("\n")}
                        placeholder={"Small\nMedium\nLarge"}
                        disabled={pending}
                        onChange={(event) =>
                          update(index, {
                            options: event.target.value.split("\n"),
                          })
                        }
                      />
                      <span className="help-text">
                        One to a line. A choice question with nothing to choose
                        from cannot be answered, and is dropped on save.
                      </span>
                    </div>
                  ) : null}

                  <div className="metadata-question-foot">
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={question.isRequired}
                        disabled={pending}
                        onChange={(event) =>
                          update(index, { isRequired: event.target.checked })
                        }
                      />
                      Required
                    </label>

                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      style={{ marginLeft: "auto" }}
                      disabled={pending}
                      onClick={() =>
                        setQuestions((current) =>
                          current.filter((_, position) => position !== index)
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-sm"
                style={{ marginTop: "0.6rem" }}
                disabled={pending}
                onClick={() =>
                  setQuestions((current) => [...current, blankQuestion()])
                }
              >
                Add a question
              </button>

              <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                How it is reported
              </h4>
              <p className="help-text">
                The member data dashboard shows this group the way it is set up
                here, to everybody who may read its answers. How a group is
                usefully read is a property of what it asks — shirt sizes are
                always a count by size — so it is settled once, here, rather
                than by everybody who opens the dashboard.
              </p>

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="report-rows">Down the side</label>
                  <select
                    id="report-rows"
                    name="reportRows"
                    value={reportRows}
                    disabled={pending}
                    onChange={(event) => setReportRows(event.target.value)}
                  >
                    {REPORT_DIMENSIONS.map((dimension) => (
                      <option key={dimension} value={dimension}>
                        {DIMENSION_LABELS[dimension]}
                      </option>
                    ))}
                  </select>
                  <span className="help-text">
                    {DIMENSION_HELP[
                      reportRows as (typeof REPORT_DIMENSIONS)[number]
                    ] ?? ""}
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="report-cols">Across the top</label>
                  <select
                    id="report-cols"
                    name="reportColumns"
                    value={reportColumns}
                    disabled={pending}
                    onChange={(event) => setReportColumns(event.target.value)}
                  >
                    {REPORT_DIMENSIONS.map((dimension) => (
                      <option key={dimension} value={dimension}>
                        {DIMENSION_LABELS[dimension]}
                      </option>
                    ))}
                  </select>
                  <span className="help-text">
                    {DIMENSION_HELP[
                      reportColumns as (typeof REPORT_DIMENSIONS)[number]
                    ] ?? ""}
                  </span>
                </div>
              </div>

              <div className="field" style={{ marginTop: "0.75rem" }}>
                <span className="field-label">Added up</span>
                {summable.length === 0 ? (
                  <span className="help-text">
                    This group asks no number questions, so its report counts
                    records instead — how many entries each member has given.
                    Add a question of the Number type above to total something.
                  </span>
                ) : (
                  <>
                    <ChipPicker
                      name="reportSumIds"
                      options={summable.map((question) => ({
                        _id: question.id,
                        name: question.label,
                      }))}
                      chosen={group?.reportSumIds ?? []}
                    />
                    <span className="help-text">
                      Which of its numbers to total. None chosen takes them all,
                      which is worth watching when they measure different
                      things — tickets and pounds do not add.
                    </span>
                  </>
                )}
              </div>

              <label className="checkbox-row" style={{ marginTop: "1.25rem" }}>
                <input
                  type="checkbox"
                  name="isRepeatable"
                  checked={repeats}
                  disabled={pending}
                  onChange={(event) => setRepeats(event.target.checked)}
                />
                These questions are answered more than once
              </label>
              <span className="help-text">
                For a list rather than a fact: two emergency contacts, three
                allergies, the vehicles somebody might arrive in. The questions
                above are asked again for each one, and each one has to answer
                whatever is required.
              </span>

              {repeats ? (
                <div className="field-grid" style={{ marginTop: "0.75rem" }}>
                  <div className="field">
                    <label htmlFor="metadata-entry-label">
                      What one of them is called
                    </label>
                    <input
                      id="metadata-entry-label"
                      name="entryLabel"
                      type="text"
                      defaultValue={group?.entryLabel ?? ""}
                      placeholder="Emergency contact"
                      disabled={pending}
                    />
                    <span className="help-text">
                      Used on the buttons the member presses — &ldquo;Add
                      another emergency contact&rdquo;.
                    </span>
                  </div>

                  <div className="field">
                    <label htmlFor="metadata-max-entries">At most</label>
                    <input
                      id="metadata-max-entries"
                      name="maxEntries"
                      type="number"
                      min={0}
                      max={50}
                      defaultValue={group?.maxEntries ?? 0}
                      disabled={pending}
                    />
                    <span className="help-text">
                      How many may be given. Leave it at nought for no limit.
                    </span>
                  </div>
                </div>
              ) : null}

              {kind === "manager" ? (
                <>
                  <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                    Who may read it
                  </h4>
                  <p className="help-text">
                    By management role first, then by naming somebody directly.
                    Anybody who may change an answer may read it.
                  </p>
                  <AccessPicker
                    roleName="viewRoleIds"
                    userName="viewUserIds"
                    permission={METADATA_PERMISSIONS.view}
                    roles={managementRoles}
                    users={users}
                    chosenRoles={group?.viewRoleIds ?? []}
                    chosenUsers={group?.viewUserIds ?? []}
                  />

                  <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                    Who may change it
                  </h4>
                  <AccessPicker
                    roleName="editRoleIds"
                    userName="editUserIds"
                    permission={METADATA_PERMISSIONS.edit}
                    roles={managementRoles}
                    users={users}
                    chosenRoles={group?.editRoleIds ?? []}
                    chosenUsers={group?.editUserIds ?? []}
                  />
                </>
              ) : null}

              <h4 className="inspector-title" style={{ marginTop: "1.25rem" }}>
                Who may open the report
              </h4>
              <p className="help-text">
                Everybody&rsquo;s answers on one screen is a different thing to
                be trusted with than one member&rsquo;s answers, so it is granted
                separately.
              </p>
              <AccessPicker
                roleName="reportRoleIds"
                userName="reportUserIds"
                permission={METADATA_PERMISSIONS.report}
                roles={managementRoles}
                users={users}
                chosenRoles={group?.reportRoleIds ?? []}
                chosenUsers={group?.reportUserIds ?? []}
              />
            </div>

            <div className="style-modal-footer">
              {group ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">
                      Delete this group and every answer to it?
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={pending}
                      onClick={remove}
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={pending}
                      onClick={() => setConfirmingDelete(false)}
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    disabled={pending}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : "Save group"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}

/** Narrows the select's value without pulling the whole normalizer in. */
function questionKind(value: string): ManagedBy {
  return value === "manager" ? "manager" : "member";
}

/** A row of checkboxes that post one field name. */
function ChipPicker({
  name,
  options,
  chosen,
}: {
  name: string;
  options: { _id: string; name: string }[];
  chosen: string[];
}) {
  if (options.length === 0) {
    return <span className="help-text">None defined yet.</span>;
  }

  return (
    <div className="chip-picker">
      {options.map((option) => (
        <label key={option._id} className="chip-option">
          <input
            type="checkbox"
            name={name}
            value={option._id}
            defaultChecked={chosen.includes(option._id)}
          />
          {option.name}
        </label>
      ))}
    </div>
  );
}

/**
 * Roles first, then people: the two ways one grant is given.
 *
 * A role only carries the grant if it also holds the matching permission —
 * naming it here says which groups, and the permission says it may be trusted
 * with any. A role missing it is marked, because a grant that silently does
 * nothing is worse than no grant at all. Naming somebody directly is a share
 * of this one group and needs nothing else.
 */
function AccessPicker({
  roleName,
  userName,
  permission,
  roles,
  users,
  chosenRoles,
  chosenUsers,
}: {
  roleName: string;
  userName: string;
  permission: string;
  roles: RoleChoice[];
  users: UserChoice[];
  chosenRoles: string[];
  chosenUsers: string[];
}) {
  const lacking = roles.filter(
    (role) => !(role.permissions ?? []).includes(permission)
  );

  return (
    <>
      <div className="field">
        <span className="field-label">Management roles</span>
        <ChipPicker
          name={roleName}
          options={roles.map((role) => ({
            _id: role._id,
            name: (role.permissions ?? []).includes(permission)
              ? role.name
              : `${role.name} — needs the permission`,
          }))}
          chosen={chosenRoles}
        />
        {lacking.length > 0 ? (
          <span className="help-text">
            A marked role holds no metadata permission of this kind yet, so
            naming it here grants nothing until the role is given one under
            Roles.
          </span>
        ) : null}
      </div>

      <div className="field" style={{ marginTop: "0.5rem" }}>
        <span className="field-label">Named accounts</span>
        <ChipPicker name={userName} options={users} chosen={chosenUsers} />
        <span className="help-text">
          Named directly, which needs no permission of its own — this is one
          group shared with one person.
        </span>
      </div>
    </>
  );
}
