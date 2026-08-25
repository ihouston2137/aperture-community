"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { fullName, type MemberSummary } from "@/lib/member-types";
import { membershipStatusLabels } from "@/lib/permissions";

import { decideMembershipAction, setMembershipStatusAction } from "./actions";
import type { MemberRoleOption } from "./pending-queue";

/**
 * Everyone already decided on. Changing a level here is the same action the
 * approval queue uses, so a member moved up gets the same email as one let in.
 */
export function MemberDirectory({
  members,
  roles,
  canApprove,
  currentUserId,
}: {
  members: MemberSummary[];
  roles: MemberRoleOption[];
  canApprove: boolean;
  currentUserId: string;
}) {
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((member) => {
      if (levelFilter && !member.communityRoleIds.includes(levelFilter)) return false;
      if (!needle) return true;
      return [fullName(member), member.email, member.phone]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [members, query, levelFilter]);

  return (
    <Panel title={`Members (${members.length})`}>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="member-search">Search</label>
          <input
            id="member-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, email or phone"
          />
        </div>
        <div className="field">
          <label htmlFor="member-level">Level</label>
          <select
            id="member-level"
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
          >
            <option value="">Every level</option>
            {roles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          No members match that.
        </p>
      ) : (
        <ul className="admin-list">
          {shown.map((member) => (
            <MemberRow
              key={member._id}
              member={member}
              roles={roles}
              canApprove={canApprove && member._id !== currentUserId}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MemberRow({
  member,
  roles,
  canApprove,
}: {
  member: MemberSummary;
  roles: MemberRoleOption[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const currentLevel = member.communityRoleIds[0] ?? "";
  const levelNames = member.communityRoleIds
    .map((id) => roles.find((role) => role._id === id)?.name)
    .filter(Boolean);

  function changeLevel(roleId: string) {
    if (!roleId || roleId === currentLevel) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", member._id);
      formData.set("decision", "change");
      formData.set("roleId", roleId);
      formData.set("notify", "on");

      const outcome = await decideMembershipAction(formData);
      if (outcome.ok) router.refresh();
      else setError(outcome.error ?? "Could not change that level.");
    });
  }

  function changeStatus(status: string) {
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", member._id);
      formData.set("status", status);

      const outcome = await setMembershipStatusAction(formData);
      if (outcome.ok) router.refresh();
      else setError(outcome.error ?? "Could not change that.");
    });
  }

  const isActive = member.membershipStatus === "active" && member.isActive;

  return (
    <li className="admin-list-item">
      <div>
        <h3>{fullName(member)}</h3>
        <div className="admin-list-meta">
          {member.email}
          {member.phone ? ` · ${member.phone}` : ""}
          {levelNames.length > 0 ? ` · ${levelNames.join(", ")}` : " · no level"}
          {member.emailVerified ? "" : " · email not confirmed"}
        </div>
        {error ? (
          <div className="admin-notice is-error" style={{ marginTop: "0.5rem" }}>
            {error}
          </div>
        ) : null}
      </div>

      <span className={`badge${isActive ? " badge-published" : ""}`}>
        {member.isActive
          ? membershipStatusLabels[member.membershipStatus].toLowerCase()
          : "inactive"}
      </span>

      {canApprove ? (
        <div className="admin-list-actions">
          <select
            value={currentLevel}
            onChange={(event) => changeLevel(event.target.value)}
            disabled={pending}
            aria-label={`Membership level for ${fullName(member)}`}
          >
            {currentLevel ? null : <option value="">No level</option>}
            {roles.map((role) => (
              <option key={role._id} value={role._id}>
                {role.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className={`btn btn-sm${isActive ? " btn-danger" : ""}`}
            disabled={pending}
            onClick={() => changeStatus(isActive ? "suspended" : "active")}
          >
            {isActive ? "Suspend" : "Reinstate"}
          </button>
        </div>
      ) : null}
    </li>
  );
}
