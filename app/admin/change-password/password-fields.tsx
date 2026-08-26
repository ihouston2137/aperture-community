"use client";

import { MIN_PASSWORD_LENGTH } from "@/lib/auth-rules";

/**
 * The three fields a password change asks for.
 *
 * Shared by the admin page and the member dashboard's popup so the rules a
 * reader is told about — the minimum length above all — are the ones the server
 * actually applies.
 */
export function PasswordFields({ idPrefix = "" }: { idPrefix?: string }) {
  return (
    <>
      <div className="field" style={{ marginBottom: "0.875rem" }}>
        <label htmlFor={`${idPrefix}currentPassword`}>Current password</label>
        <input
          id={`${idPrefix}currentPassword`}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="field" style={{ marginBottom: "0.875rem" }}>
        <label htmlFor={`${idPrefix}newPassword`}>New password</label>
        <input
          id={`${idPrefix}newPassword`}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
        <span className="help-text">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </div>

      <div className="field" style={{ marginBottom: "1.25rem" }}>
        <label htmlFor={`${idPrefix}confirmPassword`}>Confirm new password</label>
        <input
          id={`${idPrefix}confirmPassword`}
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
    </>
  );
}
