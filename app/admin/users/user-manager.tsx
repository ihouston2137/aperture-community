"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import {
  formatPhone,
  fullName,
  type MemberSummary,
} from "@/lib/member-types";
import {
  MEMBERSHIP_STATUSES,
  membershipStatusLabels,
  type RoleKind,
} from "@/lib/permissions";

import type { UserQuery } from "@/lib/user-query-types";

import { deleteUserAction, saveUserAction } from "./actions";
import { UserFilters, UserPagination } from "./user-filters";

export type UserRecord = MemberSummary & {
  /** The signed-in account, which cannot lock itself out. */
  isSelf: boolean;
};

/** Just enough of a role to offer it in the picker. */
export type RoleOption = { _id: string; name: string; kind: RoleKind };

type DialogState = { mode: "create" } | { mode: "edit"; user: UserRecord } | null;

export function UserManager({
  users,
  roles,
  query,
  total,
  overall,
  page,
  pageCount,
}: {
  /** One page of accounts, already searched and filtered by the server. */
  users: UserRecord[];
  roles: RoleOption[];
  query: UserQuery;
  /** Matching the filters, and existing at all, so an empty page can explain itself. */
  total: number;
  overall: number;
  page: number;
  pageCount: number;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const roleName = (id: string) => roles.find((role) => role._id === id)?.name;

  return (
    <Panel title="Users">
      <div className="panel-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => setDialog({ mode: "create" })}
        >
          Add user
        </button>
      </div>

      <UserFilters query={query} roles={roles} total={total} overall={overall} />

      {users.length === 0 ? (
        <p className="help-text" style={{ marginTop: "0.75rem" }}>
          {overall === 0
            ? "No accounts yet. Add the first one above."
            : "No accounts match these filters."}
        </p>
      ) : null}

      <ul className="admin-list">
        {users.map((user) => {
          const levels = user.communityRoleIds.map(roleName).filter(Boolean);
          const managing = user.managementRoleIds.map(roleName).filter(Boolean);

          return (
            <li key={user._id} className="admin-list-item">
              <div>
                <h3>{fullName(user)}</h3>
                <div className="admin-list-meta">
                  {user.email}
                  {user.phone ? ` · ${formatPhone(user.phone)}` : ""}
                  {levels.length > 0 ? ` · ${levels.join(", ")}` : ""}
                  {managing.length > 0 ? ` · manages: ${managing.join(", ")}` : ""}
                  {levels.length === 0 && managing.length === 0 ? " · no roles" : ""}
                  {user.emailVerified ? "" : " · email unconfirmed"}
                  {user.mustChangePassword ? " · must change password" : ""}
                  {user.isSelf ? " · you" : ""}
                </div>
              </div>

              <span
                className={`badge${
                  user.isActive && user.membershipStatus === "active"
                    ? " badge-published"
                    : ""
                }`}
              >
                {user.isActive
                  ? membershipStatusLabels[user.membershipStatus].toLowerCase()
                  : "inactive"}
              </span>

              <div className="admin-list-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setDialog({ mode: "edit", user })}
                >
                  Edit
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <UserPagination query={query} page={page} pageCount={pageCount} />

      {dialog ? (
        <UserDialog
          user={dialog.mode === "edit" ? dialog.user : undefined}
          roles={roles}
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

/**
 * Add / edit / delete for one account, in a popup.
 *
 * Only mounted while open, so the uncontrolled inputs pick up the right
 * defaults each time rather than holding the previous user's values.
 */
function UserDialog({
  user,
  roles,
  onClose,
  onSaved,
}: {
  /** Present when editing; absent when adding. */
  user?: UserRecord;
  roles: RoleOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
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

  function save(formData: FormData) {
    setError("");
    startTransition(async () => {
      const result = await saveUserAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that account.");
    });
  }

  function remove() {
    if (!user) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", user._id);
      const result = await deleteUserAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that account.");
    });
  }

  const communityRoles = roles.filter((role) => role.kind === "community");
  const managementRoles = roles.filter((role) => role.kind === "management");

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
          aria-label={user ? "Edit user" : "Add user"}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <form action={save} className="style-modal-form">
            <div className="style-modal-header">
              <strong>{user ? "Edit user" : "Add user"}</strong>
              {user ? <span className="help-text">{user.email}</span> : null}
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
              {user ? <input type="hidden" name="id" value={user._id} /> : null}
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="user-first-name">First name</label>
                  <input
                    id="user-first-name"
                    type="text"
                    name="firstName"
                    defaultValue={user?.firstName ?? ""}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="user-last-name">Last name</label>
                  <input
                    id="user-last-name"
                    type="text"
                    name="lastName"
                    defaultValue={user?.lastName ?? ""}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="user-email">Email</label>
                  <input
                    id="user-email"
                    type="email"
                    name="email"
                    defaultValue={user?.email ?? ""}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="user-phone">Phone number</label>
                  <input
                    id="user-phone"
                    type="tel"
                    name="phone"
                    defaultValue={formatPhone(user?.phone ?? "")}
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label htmlFor="user-status">Membership</label>
                  <select
                    id="user-status"
                    name="membershipStatus"
                    defaultValue={user?.membershipStatus ?? "active"}
                  >
                    {MEMBERSHIP_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {membershipStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <span className="help-text">
                    Only an active membership can sign in.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="user-password">
                    {user ? "New password" : "Temporary password"}
                  </label>
                  <input
                    id="user-password"
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    required={!user}
                  />
                  <span className="help-text">
                    {user
                      ? "Leave blank to keep the current one. Setting one forces a change at next sign-in."
                      : "They pick their own password at first sign-in."}
                  </span>
                </div>
              </div>

              <div className="field" style={{ marginTop: "0.75rem" }}>
                <span className="field-label">Membership level</span>
                {communityRoles.length === 0 ? (
                  <span className="help-text">
                    No membership levels defined yet. Add one below.
                  </span>
                ) : (
                  <div className="chip-picker">
                    {communityRoles.map((role) => (
                      <label key={role._id} className="chip-option">
                        <input
                          type="checkbox"
                          name="roleIds"
                          value={role._id}
                          defaultChecked={user?.roleIds.includes(role._id) ?? false}
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                )}
                <span className="help-text">
                  What this person is in the community, and what they can reach in
                  the portal.
                </span>
              </div>

              <div className="field" style={{ marginTop: "0.75rem" }}>
                <span className="field-label">Management roles</span>
                {managementRoles.length === 0 ? (
                  <span className="help-text">No management roles defined yet.</span>
                ) : (
                  <div className="chip-picker">
                    {managementRoles.map((role) => (
                      <label key={role._id} className="chip-option">
                        <input
                          type="checkbox"
                          name="roleIds"
                          value={role._id}
                          defaultChecked={user?.roleIds.includes(role._id) ?? false}
                        />
                        {role.name}
                      </label>
                    ))}
                  </div>
                )}
                <span className="help-text">
                  What this person can administer. An account with none of these
                  can sign in but manage nothing.
                </span>
              </div>

              <label className="checkbox-row" style={{ marginTop: "0.75rem" }}>
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={user ? user.isActive : true}
                />
                Active
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  name="emailVerified"
                  defaultChecked={user ? user.emailVerified : true}
                />
                Email address confirmed
              </label>
              <span className="help-text">
                Clearing this asks them for a six-digit code the next time they
                sign in.
              </span>
              {user?.isSelf ? (
                <span className="help-text">
                  This is your own account — you cannot deactivate or delete it.
                </span>
              ) : null}
            </div>

            <div className="style-modal-footer">
              {user && !user.isSelf ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">Delete this account?</span>
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
                    Delete user
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : user ? "Save user" : "Create user"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
