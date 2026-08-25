"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import { ModalPortal } from "@/components/modal-portal";
import type { RoleSummary } from "@/lib/member-types";
import { permissionGroupsFor, permissionLabel, type RoleKind } from "@/lib/permissions";

import { deleteRoleAction, saveRoleAction } from "./actions";

export type RoleRecord = RoleSummary & {
  /** Its permissions are fixed and its name is what the access layer looks for. */
  isAdministrator: boolean;
  /** How many users hold it, so deleting one is an informed decision. */
  userCount: number;
};

type DialogState =
  | { mode: "create"; kind: RoleKind }
  | { mode: "edit"; role: RoleRecord }
  | null;

const kindCopy: Record<RoleKind, { title: string; blurb: string; add: string }> = {
  community: {
    title: "Membership levels",
    blurb:
      "What a member is called, and what that level can reach in the portal. Members are shown under these names, so they are labels as much as permissions.",
    add: "Add membership level",
  },
  management: {
    title: "Management roles",
    blurb: "What part of this admin someone can run.",
    add: "Add management role",
  },
};

export function RoleManager({ roles }: { roles: RoleRecord[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <>
      {(["community", "management"] as const).map((kind) => (
        <Panel key={kind} title={kindCopy[kind].title}>
          <p className="help-text" style={{ marginTop: "-0.35rem" }}>
            {kindCopy[kind].blurb}
          </p>

          <div className="panel-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setDialog({ mode: "create", kind })}
            >
              {kindCopy[kind].add}
            </button>
          </div>

          <ul className="admin-list">
            {roles
              .filter((role) => role.kind === kind)
              .map((role) => (
                <li key={role._id} className="admin-list-item">
                  <div>
                    <h3>{role.name}</h3>
                    <div className="admin-list-meta">
                      {role.isAdministrator
                        ? "Every permission"
                        : `${role.permissions.length} permission${
                            role.permissions.length === 1 ? "" : "s"
                          }`}
                      {" · "}
                      {role.userCount} {kind === "community" ? "member" : "user"}
                      {role.userCount === 1 ? "" : "s"}
                      {kind === "community" ? ` · level ${role.level}` : ""}
                      {kind === "community" && !role.openToRegistration
                        ? " · not offered at registration"
                        : ""}
                      {role.description ? ` · ${role.description}` : ""}
                    </div>
                  </div>

                  {role.isSystem ? <span className="badge">built-in</span> : null}

                  <div className="admin-list-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setDialog({ mode: "edit", role })}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </Panel>
      ))}

      {dialog ? (
        <RoleDialog
          role={dialog.mode === "edit" ? dialog.role : undefined}
          kind={dialog.mode === "edit" ? dialog.role.kind : dialog.kind}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Add / edit / delete for one role, in a popup.
 *
 * Only mounted while open, so the uncontrolled inputs pick up the right
 * defaults each time rather than holding the previous role's values.
 */
function RoleDialog({
  role,
  kind,
  onClose,
  onSaved,
}: {
  /** Present when editing; absent when adding. */
  role?: RoleRecord;
  /** Fixed once a role exists: it decides which permissions are on offer. */
  kind: RoleKind;
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
      const result = await saveRoleAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not save that role.");
    });
  }

  function remove() {
    if (!role) return;
    setError("");
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", role._id);
      const result = await deleteRoleAction(formData);
      if (result.ok) onSaved();
      else setError(result.error ?? "Could not delete that role.");
    });
  }

  const isAdministrator = role?.isAdministrator ?? false;
  const isCommunity = kind === "community";
  const label = isCommunity ? "membership level" : "role";

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
          aria-label={role ? `Edit ${label}` : `Add ${label}`}
          onClick={(clickEvent) => clickEvent.stopPropagation()}
        >
          <form action={save} className="style-modal-form">
            <div className="style-modal-header">
              <strong>
                {role ? "Edit" : "Add"} {label}
              </strong>
              {role ? (
                <span className="help-text">
                  {role.userCount} user{role.userCount === 1 ? "" : "s"}
                </span>
              ) : null}
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
              {role ? <input type="hidden" name="id" value={role._id} /> : null}
              {/* Only read when creating; an existing role keeps its kind. */}
              <input type="hidden" name="kind" value={kind} />
              {error ? <div className="admin-notice is-error">{error}</div> : null}

              <div className="field-grid">
                <div className="field">
                  <label htmlFor="role-name">Name</label>
                  <input
                    id="role-name"
                    type="text"
                    name="name"
                    defaultValue={role?.name ?? ""}
                    readOnly={isAdministrator}
                    required
                  />
                  {isAdministrator ? (
                    <span className="help-text">
                      The access layer looks this role up by name.
                    </span>
                  ) : isCommunity ? (
                    <span className="help-text">
                      What members at this level are called.
                    </span>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor="role-description">Description</label>
                  <input
                    id="role-description"
                    type="text"
                    name="description"
                    defaultValue={role?.description ?? ""}
                  />
                </div>
                {isCommunity ? (
                  <div className="field">
                    <label htmlFor="role-level">Level</label>
                    <input
                      id="role-level"
                      type="number"
                      name="level"
                      defaultValue={role?.level ?? 0}
                      step={1}
                    />
                    <span className="help-text">
                      Orders the levels, lowest first. It does not grant anything
                      on its own.
                    </span>
                  </div>
                ) : null}
              </div>

              {isCommunity ? (
                <label className="checkbox-row" style={{ marginTop: "0.75rem" }}>
                  <input
                    type="checkbox"
                    name="openToRegistration"
                    defaultChecked={role ? role.openToRegistration : true}
                  />
                  Offer this level on the registration form
                </label>
              ) : null}

              {isAdministrator ? (
                <p className="help-text" style={{ marginTop: "1rem" }}>
                  The Administrator role always holds every permission, including any
                  added later, and reaches the whole portal as well. Only its
                  description can be changed.
                </p>
              ) : (
                <div className="permission-grid">
                  {permissionGroupsFor(kind).map((group) => (
                    <fieldset key={group.key} className="permission-group">
                      <legend className="field-label">{group.label}</legend>
                      {group.permissions.map((permission) => (
                        <label key={permission.key} className="checkbox-row">
                          <input
                            type="checkbox"
                            name="permissions"
                            value={permission.key}
                            defaultChecked={role?.permissions.includes(permission.key)}
                          />
                          {permissionLabel(permission.key)}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                </div>
              )}
            </div>

            <div className="style-modal-footer">
              {role && !role.isSystem ? (
                confirmingDelete ? (
                  <>
                    <span className="help-text">
                      {role.userCount > 0
                        ? `Delete it? ${role.userCount} user${
                            role.userCount === 1 ? "" : "s"
                          } will lose it.`
                        : `Delete this ${label}?`}
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
                    Delete {label}
                  </button>
                )
              ) : null}

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ marginLeft: "auto" }}
                disabled={pending}
              >
                {pending ? "Saving…" : role ? "Save changes" : `Create ${label}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
