"use client";

export type OwnProfile = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

/**
 * The four fields the community collects, as they appear inside the popup.
 *
 * Presentational: the card around it owns the save, so it can refuse to close
 * the popup while one is in flight.
 */
export function ProfileForm({
  member,
  emailVerified,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  member: OwnProfile;
  emailVerified: boolean;
  pending: boolean;
  error: string;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form action={onSubmit}>
      {error ? <div className="admin-notice is-error">{error}</div> : null}

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
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
