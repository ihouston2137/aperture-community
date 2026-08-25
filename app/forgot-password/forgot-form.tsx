"use client";

import { useActionState, useState } from "react";

import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/app/auth-actions";
import { MIN_PASSWORD_LENGTH, type AuthFormState } from "@/lib/auth-rules";

/**
 * Both halves of recovery on one screen.
 *
 * Asking for a code says the same thing whatever address is typed, so the reply
 * cannot be used to find out who has an account — which is also why the code
 * step is shown from the start rather than unlocked by a successful lookup.
 */
export function ForgotPasswordForm({ idPrefix = "" }: { idPrefix?: string }) {
  const id = (name: string) => `${idPrefix}${name}`;
  const [email, setEmail] = useState("");

  const [requestState, requestAction, requesting] = useActionState<
    AuthFormState,
    FormData
  >(requestPasswordResetAction, undefined);

  const [resetState, resetActionState, resetting] = useActionState<
    AuthFormState,
    FormData
  >(resetPasswordAction, undefined);

  return (
    <>
      <form action={requestAction}>
        {requestState?.error ? (
          <div className="admin-notice is-error">{requestState.error}</div>
        ) : null}
        {requestState?.message ? (
          <div className="admin-notice">{requestState.message}</div>
        ) : null}

        <div className="field">
          <label htmlFor={id("email")}>Email</label>
          <input
            id={id("email")}
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>

        <div className="auth-actions">
          <button type="submit" className="btn btn-primary" disabled={requesting}>
            {requesting ? "Sending…" : "Send me a code"}
          </button>
        </div>
      </form>

      <hr
        style={{
          margin: "1.5rem 0 1.25rem",
          border: 0,
          borderTop: "1px solid var(--admin-border, rgba(127,127,127,0.3))",
        }}
      />

      <form action={resetActionState}>
        {resetState?.error ? (
          <div className="admin-notice is-error">{resetState.error}</div>
        ) : null}

        {/* Carried from the field above so the code is checked against the
            address it was sent to, without asking for it twice. */}
        <input type="hidden" name="email" value={email} />

        <div className="field">
          <label htmlFor={id("code")}>Six-digit code</label>
          <input
            id={id("code")}
            name="code"
            type="text"
            className="auth-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
          />
        </div>

        <div className="field-grid" style={{ marginTop: "0.9rem" }}>
          <div className="field">
            <label htmlFor={id("password")}>New password</label>
            <input
              id={id("password")}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
            <span className="help-text">At least {MIN_PASSWORD_LENGTH} characters.</span>
          </div>
          <div className="field">
            <label htmlFor={id("confirmPassword")}>Confirm new password</label>
            <input
              id={id("confirmPassword")}
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
          </div>
        </div>

        <div className="auth-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={resetting || !email}
          >
            {resetting ? "Saving…" : "Set new password"}
          </button>
        </div>
      </form>
    </>
  );
}
