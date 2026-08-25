"use client";

import { useActionState } from "react";

import { loginAction, type FormState } from "@/app/actions";

export function LoginForm({
  /** Where to land afterwards. The header popup passes the current page. */
  next = "",
  idPrefix = "",
}: {
  next?: string;
  /**
   * Distinguishes these fields from a second copy of the form on the same
   * page — the header popup and the sign-in page can both be mounted at once.
   */
  idPrefix?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    undefined
  );
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <form action={action}>
      {state?.error ? (
        <div className="admin-notice is-error">{state.error}</div>
      ) : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="field" style={{ marginBottom: "0.875rem" }}>
        <label htmlFor={id("email")}>Email</label>
        <input
          id={id("email")}
          name="email"
          type="email"
          autoComplete="username"
          required
        />
      </div>

      <div className="field">
        <label htmlFor={id("password")}>Password</label>
        <input
          id={id("password")}
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="auth-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
