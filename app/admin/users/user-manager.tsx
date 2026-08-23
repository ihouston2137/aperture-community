"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";

import { deleteUserAction, saveUserAction } from "./actions";

export type UserRecord = {
  _id: string;
  email: string;
  name: string;
  isActive: boolean;
  mustChangePassword: boolean;
  roleIds: string[];
  /** The signed-in account, which cannot delete or deactivate itself. */
  isSelf: boolean;
};

/** Just enough of a role to offer it in the picker. */
export type RoleOption = { _id: string; name: string };

type DialogState = { mode: "create" } | { mode: "edit"; user: UserRecord } | null;

export function UserManager({
  users,
  roles,
}: {
  users: UserRecord[];
  roles: RoleOption[];
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

      <ul className="admin-list">
        {users.map((user) => {
          const named = user.roleIds.map(roleName).filter(Boolean);

          return (
            <li key={user._id} className="admin-list-item">
              <div>
                <h3>{user.name || user.email}</h3>
                <div className="admin-list-meta">
                  {user.name ? `${user.email} · ` : ""}
                  {named.length > 0 ? named.join(", ") : "No roles"}
                  {user.mustChangePassword ? " · must change password" : ""}
                  {user.isSelf ? " · you" : ""}
                </div>
              </div>

              <span className={`badge${user.isActive ? " badge-published" : ""}`}>
                {user.isActive ? "active" : "inactive"}
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
                  <label htmlFor="user-name">Name</label>
                  <input
                    id="user-name"
                    type="text"
                    name="name"
                    defaultValue={user?.name ?? ""}
                  />
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
                <span className="field-label">Roles</span>
                {roles.length === 0 ? (
                  <span className="help-text">
                    No roles defined yet. Add one below, then assign it here.
                  </span>
                ) : (
                  <div className="chip-picker">
                    {roles.map((role) => (
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
                  An account with no roles can sign in but manage nothing.
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
