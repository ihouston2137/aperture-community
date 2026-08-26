"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { BioPicker } from "@/components/bio-picker";
import { ModalPortal } from "@/components/modal-portal";
import type { RelationshipSummary } from "@/lib/relationships";

import { deleteRelationshipAction, saveRelationshipAction } from "./actions";

/** A member as the pickers and the list need them. */
export type MemberOption = { _id: string; name: string; title?: string };

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; relationship: RelationshipSummary }
  | null;

/**
 * Relationships between members: who it is about, what it is called, and
 * everybody on the other end.
 *
 * Members are chosen by typing a name rather than from a list, for the same
 * reason the profile pickers are — there is one entry per account.
 */
export function RelationshipManager({
  relationships,
  members,
}: {
  relationships: RelationshipSummary[];
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

  const nameOf = (id: string) => nameById.get(id) ?? "an account that has gone";

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return relationships;

    const named = (id: string) => nameById.get(id) ?? "";
    return relationships.filter((relationship) =>
      [
        relationship.label,
        relationship.reverseLabel,
        named(relationship.memberId),
        ...relationship.relatedIds.map(named),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [relationships, query, nameById]);

  return (
    <Panel title={`Relationships (${relationships.length})`}>
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setDialog({ mode: "create" })}
          disabled={members.length < 2}
        >
          Add relationship
        </button>
      </div>

      {members.length < 2 ? (
        <p className="help-text">
          Relationships link one member to another, so there have to be at least
          two members before one can be defined.
        </p>
      ) : null}

      <div className="field">
        <label htmlFor="relationship-search">Search</label>
        <input
          id="relationship-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="A name, or what the relationship is called"
        />
      </div>

      {shown.length === 0 ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          {relationships.length === 0
            ? "No relationships yet."
            : "No relationships match that."}
        </p>
      ) : (
        <ul className="admin-list" style={{ marginTop: "1rem" }}>
          {shown.map((relationship) => (
            <li key={relationship._id} className="admin-list-item">
              <div style={{ minWidth: 0 }}>
                <h3>
                  {nameOf(relationship.memberId)} · {relationship.label}
                </h3>
                <div className="admin-list-meta">
                  {relationship.relatedIds.map(nameOf).join(", ")}
                </div>
                <div className="admin-list-meta">
                  and back: {relationship.reverseLabel || "not named"} ·{" "}
                  {nameOf(relationship.memberId)}
                </div>
              </div>

              <span className="badge">
                {relationship.relatedIds.length}{" "}
                {relationship.relatedIds.length === 1 ? "member" : "members"}
              </span>

              <div className="admin-list-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDialog({ mode: "edit", relationship })}
                >
                  Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialog ? (
        <RelationshipDialog
          relationship={dialog.mode === "edit" ? dialog.relationship : undefined}
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

/** Add, edit or delete one relationship. */
function RelationshipDialog({
  relationship,
  members,
  onClose,
  onSaved,
}: {
  /** Present when editing; absent when adding. */
  relationship?: RelationshipSummary;
  members: MemberOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [memberId, setMemberId] = useState(relationship?.memberId ?? "");
  const [label, setLabel] = useState(relationship?.label ?? "");
  const [reverseLabel, setReverseLabel] = useState(relationship?.reverseLabel ?? "");
  const [relatedIds, setRelatedIds] = useState<string[]>(
    relationship?.relatedIds ?? []
  );
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
    members.find((member) => member._id === id)?.name ?? "an account that has gone";

  // Nobody can be on both ends of their own relationship, and nobody twice.
  const available = members.filter(
    (member) => member._id !== memberId && !relatedIds.includes(member._id)
  );

  // The previews read as the directory will, so the wording can be checked
  // before it is saved rather than after.
  const subject = memberId ? nameOf(memberId) : "this member";
  const relatedNames = relatedIds.map(nameOf).join(", ");

  function save() {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      if (relationship) formData.set("id", relationship._id);
      formData.set("memberId", memberId);
      formData.set("label", label);
      formData.set("reverseLabel", reverseLabel);
      for (const id of relatedIds) formData.append("relatedIds", id);

      const result = await saveRelationshipAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that relationship.");
    });
  }

  function remove() {
    if (!relationship) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", relationship._id);
      const result = await deleteRelationshipAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that relationship.");
    });
  }

  const title = relationship ? "Edit relationship" : "Add relationship";

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

              <div className="field-grid">
                <div className="field">
                  <span className="field-label">Member</span>
                  <BioPicker
                    options={members}
                    value={memberId}
                    onChange={(id) => {
                      setMemberId(id);
                      // They cannot be on both ends of it.
                      setRelatedIds((current) =>
                        current.filter((related) => related !== id)
                      );
                    }}
                    emptyLabel="Nobody yet"
                    placeholder="Type a name"
                    disabled={pending}
                  />
                  <span className="help-text">Who the relationship is about.</span>
                </div>

                <div className="field">
                  <label htmlFor="relationship-label">
                    They are, to {subject}
                  </label>
                  <input
                    id="relationship-label"
                    type="text"
                    value={label}
                    maxLength={80}
                    disabled={pending}
                    placeholder="Parent of, Mentor to…"
                    onChange={(event) => setLabel(event.target.value)}
                  />
                  <span className="help-text">
                    On {subject}&rsquo;s entry: <strong>{label || "…"}</strong> —{" "}
                    {relatedNames || "the members below"}.
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="relationship-reverse">
                    {subject} is, to them
                  </label>
                  <input
                    id="relationship-reverse"
                    type="text"
                    value={reverseLabel}
                    maxLength={80}
                    disabled={pending}
                    placeholder="Child of, Mentored by…"
                    onChange={(event) => setReverseLabel(event.target.value)}
                  />
                  <span className="help-text">
                    On each of their entries: <strong>{reverseLabel || "…"}</strong> —{" "}
                    {subject}.
                  </span>
                </div>
              </div>

              <div className="field" style={{ marginTop: "0.875rem" }}>
                <span className="field-label">
                  Related members ({relatedIds.length})
                </span>

                {relatedIds.length > 0 ? (
                  <div className="chip-picker" style={{ marginBottom: "0.5rem" }}>
                    {relatedIds.map((id) => (
                      <span key={id} className="chip-option">
                        {nameOf(id)}
                        <button
                          type="button"
                          className="chip-remove"
                          aria-label={`Remove ${nameOf(id)}`}
                          disabled={pending}
                          onClick={() =>
                            setRelatedIds((current) =>
                              current.filter((held) => held !== id)
                            )
                          }
                        >
                          <span aria-hidden="true">×</span>
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <BioPicker
                  options={available}
                  value=""
                  onChange={(id) => {
                    if (id) setRelatedIds((current) => [...current, id]);
                  }}
                  emptyLabel="—"
                  placeholder="Type a name to add somebody"
                  disabled={pending}
                />
                <span className="help-text">
                  Add as many as the relationship covers. They can be chosen
                  before the member above; anyone who turns out to be that member
                  drops out of this list.
                </span>
              </div>
            </div>

            <div className="style-modal-footer">
              {relationship ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this relationship?</span>
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
                    Delete relationship
                  </button>
                )
              ) : null}

              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={
                  pending ||
                  !memberId ||
                  !label.trim() ||
                  !reverseLabel.trim() ||
                  relatedIds.length === 0
                }
                onClick={save}
              >
                {pending ? "Saving…" : relationship ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
