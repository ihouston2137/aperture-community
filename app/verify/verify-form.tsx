"use client";

import { useActionState, useState, useTransition } from "react";

import {
  cancelVerificationAction,
  resendCodeAction,
  verifyCodeAction,
} from "@/app/auth-actions";
import type { AuthFormState } from "@/lib/auth-rules";

export function VerifyForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    verifyCodeAction,
    undefined
  );
  const [resent, setResent] = useState<{ ok: boolean; message: string } | null>(null);
  const [resending, startResend] = useTransition();

  function resend() {
    setResent(null);
    startResend(async () => setResent(await resendCodeAction()));
  }

  return (
    <>
      <form action={action}>
        {state?.error ? <div className="admin-notice is-error">{state.error}</div> : null}
        {resent ? (
          <div className={`admin-notice${resent.ok ? "" : " is-error"}`}>
            {resent.message}
          </div>
        ) : null}

        <p className="help-text auth-code-sent" style={{ marginBottom: "0.9rem" }}>
          Sent to <strong>{email}</strong>.
        </p>

        <div className="field">
          <label htmlFor="code">Six-digit code</label>
          <input
            id="code"
            name="code"
            type="text"
            className="auth-code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            autoFocus
            required
          />
        </div>

        <div className="auth-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending || resending}
            onClick={resend}
          >
            {resending ? "Sending…" : "Send a new code"}
          </button>
        </div>
      </form>

      {/* A form of its own: it must not carry the code field along with it. */}
      <form action={cancelVerificationAction} style={{ marginTop: "0.9rem" }}>
        <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
          Start over
        </button>
      </form>
    </>
  );
}
