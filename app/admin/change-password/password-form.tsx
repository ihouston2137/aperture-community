"use client";

import { useActionState } from "react";

import { changePasswordAction, type FormState } from "@/app/actions";

import { PasswordFields } from "./password-fields";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    undefined
  );

  return (
    <form action={action} className="panel" style={{ maxWidth: "28rem" }}>
      {state?.error ? <div className="admin-notice is-error">{state.error}</div> : null}

      <PasswordFields />

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
