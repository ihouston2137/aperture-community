"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { BioPicker } from "@/components/bio-picker";
import { ModalPortal } from "@/components/modal-portal";
import {
  memberWithTitle,
  type GroupMember,
  type MemberGroupSummary,
} from "@/lib/member-group-types";

import { deleteGroupAction, saveGroupAction } from "./actions";

/** A member as the picker and the list need them. */
export type MemberOption = {
  _id: string;
  name: string;
  title?: string;
  /** Left the site. Still nameable here: a group is a record of who was in it. */
  isInactive?: boolean;
};

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; group: MemberGroupSummary }
  | null;

/**
 * Named sets of members — a committee, a year group, a working party.
 *
 * A group says only who is in it: what somebody may reach is their membership
 * level, and how two people stand to one another is a relationship.
 */
export function GroupManager({
  groups,
  members,
}: {
  groups: MemberGroupSummary[];
  members: MemberOption[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [query, setQuery] = useState("");

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) map.set(member._id, member.name);
    return map;
  }, [members]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;

    const named = (id: string) => nameById.get(id) ?? "";
    return groups.filter((group) =>
      [
        group.name,
        group.description,
        // Names and offices both: "who chairs the committee" is a question
        // somebody will ask this box.
        ...group.members.map((member) => `${named(member.memberId)} ${member.title}`),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [groups, query, nameById]);

  return (
    <Panel title={`Groups (${groups.length})`}>
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setDialog({ mode: "create" })}
        >
          Add group
        </button>
      </div>

      <div className="field">
        <label htmlFor="group-search">Search</label>
        <input
          id="group-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="A group name, or somebody in one"
        />
      </div>

      {shown.length === 0 ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          {groups.length === 0
            ? "No groups yet. Add the first one above."
            : "No groups match that."}
        </p>
      ) : (
        <ul className="admin-list" style={{ marginTop: "1rem" }}>
          {shown.map((group) => (
            <li key={group._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3>{group.name}</h3>
                <div className="admin-list-meta">
                  {group.description || "no description"}
                </div>
                <div className="admin-list-meta">
                  {group.members.length === 0
                    ? "nobody in it yet"
                    : group.members
                        .map((member) =>
                          memberWithTitle(
                            nameById.get(member.memberId) ?? "an account that has gone",
                            member.title
                          )
                        )
                        .join(", ")}
                </div>
              </div>

              <span
                className={`badge${group.memberIds.length > 0 ? " badge-published" : ""}`}
              >
                {group.memberIds.length}{" "}
                {group.memberIds.length === 1 ? "member" : "members"}
              </span>

              <div className="admin-list-actions">
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
          members={members}
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

/** Add, edit or delete one group. */
function GroupDialog({
  group,
  // Named `options` inside: `members` here is the group's own entries, each
  // with the office that person holds in it.
  members: options,
  onClose,
  onSaved,
}: {
  /** Present when editing; absent when adding. */
  group?: MemberGroupSummary;
  members: MemberOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [members, setMembers] = useState<GroupMember[]>(group?.members ?? []);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  const nameOf = (id: string) =>
    options.find((option) => option._id === id)?.name ?? "an account that has gone";

  // Nobody twice, so somebody already in the group is not offered again.
  const chosen = new Set(members.map((member) => member.memberId));
  const available = options.filter((option) => !chosen.has(option._id));

  function save() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      if (group) formData.set("id", group._id);
      formData.set("name", name);
      formData.set("description", description);
      formData.set("members", JSON.stringify(members));

      const result = await saveGroupAction(formData);
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
      const result = await deleteGroupAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that group.");
    });
  }

  const title = group ? "Edit group" : "Add group";

  return (
    <ModalPortal>
      <div
        className="style-modal-backdrop"
        onClick={pending ? undefined : onClose}
        role="presentation"
      >
        <div
          className="style-modal"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <div className="style-modal-form">
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
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field">
                <label htmlFor="group-name">Name</label>
                <input
                  id="group-name"
                  type="text"
                  value={name}
                  maxLength={80}
                  disabled={pending}
                  placeholder="Committee, Class of 2026, Trip to Skye…"
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <label htmlFor="group-description">Description</label>
                <textarea
                  id="group-description"
                  rows={3}
                  value={description}
                  maxLength={500}
                  disabled={pending}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <span className="help-text">
                  What the group is for. Shown wherever the group is listed.
                </span>
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <span className="field-label">Members ({members.length})</span>

                {/* A row each rather than chips: a chip has nowhere to put a
                    title, and the title belongs beside the person it describes
                    rather than in a second list to be matched up by eye. */}
                {members.length > 0 ? (
                  <ul className="group-members">
                    {members.map((member) => (
                      <li key={member.memberId} className="group-member">
                        <span className="group-member-name">
                          {nameOf(member.memberId)}
                        </span>

                        <input
                          type="text"
                          className="group-member-title"
                          value={member.title}
                          maxLength={60}
                          disabled={pending}
                          placeholder="Role in this group — optional"
                          aria-label={`Role for ${nameOf(member.memberId)}`}
                          onChange={(event) =>
                            setMembers((current) =>
                              current.map((held) =>
                                held.memberId === member.memberId
                                  ? { ...held, title: event.target.value }
                                  : held
                              )
                            )
                          }
                        />

                        <button
                          type="button"
                          className="btn btn-sm"
                          aria-label={`Remove ${nameOf(member.memberId)}`}
                          disabled={pending}
                          onClick={() =>
                            setMembers((current) =>
                              current.filter(
                                (held) => held.memberId !== member.memberId
                              )
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <BioPicker
                  options={available}
                  value=""
                  onChange={(id) => {
                    // Added with no office; the field beside them is where one
                    // is given, and most people in a group hold none.
                    if (id) {
                      setMembers((current) => [...current, { memberId: id, title: "" }]);
                    }
                  }}
                  emptyLabel="—"
                  placeholder="Type a name to add somebody"
                  disabled={pending}
                />
                <span className="help-text">
                  A group can be saved empty and filled in later. A role is
                  optional — chair, treasurer, captain — and belongs to this
                  group only, not to the member&apos;s account.
                </span>
              </div>
            </div>

            <div className="style-modal-footer">
              {group ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this group?</span>
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
                    Delete group
                  </button>
                )
              ) : null}

              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending || !name.trim()}
                onClick={save}
              >
                {pending ? "Saving…" : group ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
