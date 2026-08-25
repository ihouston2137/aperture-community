"use client";

import { useState, useTransition } from "react";

import { saveOwnProfileAction } from "./actions";

export type OwnProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/**
 * The four fields the community collects, editable by their owner.
 *
 * A level without `community.profile` sees the same details read-only rather
 * than a form that would be refused on submit.
 */
export function ProfileForm({
  member,
  canEdit,
  emailVerified,
}: {
  member: OwnProfile;
  canEdit: boolean;
  emailVerified: boolean;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const outcome = await saveOwnProfileAction(formData);
      setResult({
        ok: outcome.ok,
        message: outcome.ok
          ? outcome.message ?? "Saved."
          : outcome.error ?? "Could not save your details.",
      });
    });
  }

  if (!canEdit) {
    return (
      <>
        <dl className="member-facts">
          <dt>Name</dt>
          <dd>{[member.firstName, member.lastName].filter(Boolean).join(" ") || "—"}</dd>
          <dt>Email</dt>
          <dd>{member.email}</dd>
          <dt>Phone</dt>
          <dd>{member.phone || "—"}</dd>
        </dl>
        <p className="member-note">
          Ask an administrator to change these — your level cannot edit them.
        </p>
      </>
    );
  }

  return (
    <form action={save}>
      {result ? (
        <div className={`admin-notice${result.ok ? "" : " is-error"}`}>
          {result.message}
        </div>
      ) : null}

      <div className="field-grid">
        <div className="field">
          <label htmlFor="me-firstName">First name</label>
          <input
            id="me-firstName"
            name="firstName"
            type="text"
            defaultValue={member.firstName}
            autoComplete="given-name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="me-lastName">Last name</label>
          <input
            id="me-lastName"
            name="lastName"
            type="text"
            defaultValue={member.lastName}
            autoComplete="family-name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="me-email">Email</label>
          <input
            id="me-email"
            name="email"
            type="email"
            defaultValue={member.email}
            autoComplete="email"
            required
          />
          <span className="help-text">
            {emailVerified
              ? "Changing this means confirming the new address with a code."
              : "This address has not been confirmed yet."}
          </span>
        </div>
        <div className="field">
          <label htmlFor="me-phone">Phone number</label>
          <input
            id="me-phone"
            name="phone"
            type="tel"
            defaultValue={member.phone}
            autoComplete="tel"
          />
        </div>
      </div>

      <div className="member-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </button>
      </div>
    </form>
  );
}
