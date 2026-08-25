"use client";

import { useActionState } from "react";

import { registerAction } from "@/app/auth-actions";
import { MIN_PASSWORD_LENGTH, type AuthFormState } from "@/lib/auth-rules";

export type RegistrationRoleOption = {
  _id: string;
  name: string;
  description: string;
};

export function RegisterForm({
  roles,
  defaultRoleName,
  needsApproval,
  verifiesEmail,
  next = "",
  idPrefix = "",
}: {
  /** Empty when the Administrator has turned off choosing a level. */
  roles: RegistrationRoleOption[];
  /** What everybody is assigned on the way in, whatever they asked for. */
  defaultRoleName: string;
  needsApproval: boolean;
  verifiesEmail: boolean;
  /** Where to land afterwards. The header popup passes the current page. */
  next?: string;
  /** Keeps these fields distinct from a second copy of the form on the page. */
  idPrefix?: string;
}) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    registerAction,
    undefined
  );
  const id = (name: string) => `${idPrefix}${name}`;

  return (
    <form action={action}>
      {state?.error ? <div className="admin-notice is-error">{state.error}</div> : null}

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor={id("firstName")}>First name</label>
          <input
            id={id("firstName")}
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor={id("lastName")}>Last name</label>
          <input
            id={id("lastName")}
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor={id("email")}>Email</label>
          <input id={id("email")} name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor={id("phone")}>Phone number</label>
          <input id={id("phone")} name="phone" type="tel" autoComplete="tel" required />
        </div>
        <div className="field">
          <label htmlFor={id("password")}>Password</label>
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
          <label htmlFor={id("confirmPassword")}>Confirm password</label>
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

      {roles.length > 0 ? (
        <div className="field" style={{ marginTop: "0.9rem" }}>
          <span className="field-label">Joining as</span>

          {/* Radios rather than a dropdown: the levels are the point of joining,
              so they are all on show and the chosen one is visibly on. Every
              radio carries `required`, which makes the group required — there
              is no "no preference", so a level has to be picked. */}
          <div className="level-picker" role="radiogroup" aria-label="Joining as">
            {roles.map((role) => (
              <label key={role._id} className="level-option">
                <input
                  type="radio"
                  name="requestedRoleId"
                  value={role._id}
                  id={id(`level-${role._id}`)}
                  required
                />
                <span className="level-option-mark" aria-hidden="true" />
                <span className="level-option-text">
                  <strong>{role.name}</strong>
                  {role.description ? <span>{role.description}</span> : null}
                </span>
              </label>
            ))}
          </div>

          <span className="help-text">
            {defaultRoleName
              ? `Everyone starts as ${defaultRoleName}. What you choose here is passed to whoever reviews your registration.`
              : "What you choose here is passed to whoever reviews your registration."}
          </span>
        </div>
      ) : null}

      <p className="help-text" style={{ marginTop: "1rem" }}>
        {verifiesEmail
          ? "We will email you a six-digit code to confirm your address."
          : "You can sign in as soon as you have registered."}
        {needsApproval
          ? " Your membership then waits for approval, and you will hear from us by email."
          : ""}
      </p>

      <div className="auth-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating your account…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
