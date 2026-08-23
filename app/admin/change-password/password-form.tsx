"use client";

import { useActionState } from "react";

import { changePasswordAction, type FormState } from "@/app/actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    undefined
  );

  return (
    <form action={action} className="panel" style={{ maxWidth: "28rem" }}>
      {state?.error ? <div className="admin-notice is-error">{state.error}</div> : null}

      <div className="field" style={{ marginBottom: "0.875rem" }}>
        <label htmlFor="currentPassword">Current password</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="field" style={{ marginBottom: "0.875rem" }}>
        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
        <span className="help-text">At least 10 characters.</span>
      </div>

      <div className="field" style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="confirmPassword">Confirm new password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
