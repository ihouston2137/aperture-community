"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { fullName, type MemberSummary } from "@/lib/member-types";

import { decideMembershipAction } from "./actions";

export type MemberRoleOption = { _id: string; name: string };

/**
 * Everyone waiting to be let in, each with the level they asked for already
 * selected — approving is one click when the answer is yes, and one change of
 * the picker when it is not.
 */
export function PendingQueue({
  members,
  roles,
  defaultRoleId,
  canApprove,
  autoApprove,
}: {
  members: MemberSummary[];
  roles: MemberRoleOption[];
  defaultRoleId: string;
  canApprove: boolean;
  autoApprove: boolean;
}) {
  if (members.length === 0) {
    return (
      <Panel title="Waiting for approval">
        <p className="help-text">
          {autoApprove
            ? "Nobody is waiting — registrations are approved automatically."
            : "Nobody is waiting. New registrations will appear here."}
        </p>
      </Panel>
    );
  }

  return (
    <Panel title={`Waiting for approval (${members.length})`}>
      <ul className="admin-list">
        {members.map((member) => (
          <PendingRow
            key={member._id}
            member={member}
            roles={roles}
            defaultRoleId={defaultRoleId}
            canApprove={canApprove}
          />
        ))}
      </ul>
    </Panel>
  );
}

function PendingRow({
  member,
  roles,
  defaultRoleId,
  canApprove,
}: {
  member: MemberSummary;
  roles: MemberRoleOption[];
  defaultRoleId: string;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [open, setOpen] = useState(false);

  // What they asked for wins, then the level they were given at registration,
  // then the configured default.
  const [roleId, setRoleId] = useState(
    member.requestedRoleId ||
      member.communityRoleIds[0] ||
      defaultRoleId ||
      roles[0]?._id ||
      ""
  );
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);

  const requested = roles.find((role) => role._id === member.requestedRoleId);

  function decide(decision: "approve" | "reject") {
    setResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", member._id);
      formData.set("decision", decision);
      formData.set("roleId", roleId);
      formData.set("note", note);
      if (notify) formData.set("notify", "on");

      const outcome = await decideMembershipAction(formData);
      if (outcome.ok) {
        setResult(outcome.message ? { ok: true, message: outcome.message } : null);
        router.refresh();
      } else {
        setResult({ ok: false, message: outcome.error ?? "Could not save that." });
      }
    });
  }

  return (
    <li className="admin-list-item" style={{ flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 18rem" }}>
        <h3>{fullName(member)}</h3>
        <div className="admin-list-meta">
          {member.email}
          {member.phone ? ` · ${member.phone}` : ""}
          {requested ? ` · applied as ${requested.name}` : " · no level requested"}
          {member.emailVerified ? "" : " · email not confirmed yet"}
          {member.registeredAt
            ? ` · ${new Date(member.registeredAt).toLocaleDateString()}`
            : ""}
        </div>
        {result ? (
          <div
            className={`admin-notice${result.ok ? "" : " is-error"}`}
            style={{ marginTop: "0.5rem" }}
          >
            {result.message}
          </div>
        ) : null}
      </div>

      {canApprove ? (
        <div style={{ flex: "1 1 100%", marginTop: "0.5rem" }}>
          <div className="admin-list-actions" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
            <select
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              disabled={pending}
              aria-label="Membership level"
            >
              {roles.map((role) => (
                <option key={role._id} value={role._id}>
                  {role.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending || !roleId}
              onClick={() => decide("approve")}
            >
              {pending ? "Saving…" : "Approve"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Hide note" : "Add a note"}
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={pending}
              onClick={() => decide("reject")}
            >
              Decline
            </button>
          </div>

          {open ? (
            <div className="field" style={{ marginTop: "0.6rem" }}>
              <label htmlFor={`note-${member._id}`}>
                Note to include in the email
              </label>
              <textarea
                id={`note-${member._id}`}
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                disabled={pending}
              />
            </div>
          ) : null}

          <label className="checkbox-row" style={{ marginTop: "0.4rem" }}>
            <input
              type="checkbox"
              checked={notify}
              onChange={(event) => setNotify(event.target.checked)}
              disabled={pending}
            />
            Email them about this decision
          </label>
        </div>
      ) : (
        <span className="badge">awaiting approval</span>
      )}
    </li>
  );
}
