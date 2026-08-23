"use client";

import { useActionState } from "react";

import { loginAction, type FormState } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    undefined
  );

  return (
    <form action={action} className="panel" style={{ width: "min(24rem, 100%)" }}>
      <h1 className="panel-title">Sign in</h1>

      {state?.error ? (
        <div className="admin-notice is-error">{state.error}</div>
      ) : null}

      <div className="field" style={{ marginBottom: "0.875rem" }}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <div className="field" style={{ marginBottom: "1.25rem" }}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
