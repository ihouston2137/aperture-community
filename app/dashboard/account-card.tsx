"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PasswordFields } from "@/app/admin/change-password/password-fields";
import { formatPhone } from "@/lib/member-types";

import { AccountDialog } from "./account-dialog";
import { changeOwnPasswordAction, saveOwnBioAction, saveOwnProfileAction } from "./actions";
import { BioForm, type OwnBio } from "./bio-form";
import { ProfileForm, type OwnProfile } from "./profile-form";

/**
 * The one card on the dashboard: what the community has on file for the member
 * reading it, and the things they can do to their own account.
 *
 * The details stay on the page — they are the point of the card — while
 * changing them and changing the password are popups over it.
 *
 * Only that. Everywhere else a member can go — the directory, the sections they
 * have been given to work in, the admin — is reached from the menu in the
 * header, which is there on every page rather than only on this one.
 */
export function AccountCard({
  member,
  bio,
  canEdit,
  emailVerified,
  signedInAs,
}: {
  member: OwnProfile;
  /** Empty for an account that carries no member profile, such as staff. */
  bio: OwnBio | null;
  canEdit: boolean;
  emailVerified: boolean;
  signedInAs: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"details" | "password" | "profile" | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function saveDetails(formData: FormData) {
    setError("");
    startTransition(async () => {
      const outcome = await saveOwnProfileAction(formData);
      if (!outcome.ok) {
        setError(outcome.error ?? "Could not save your details.");
        return;
      }

      setNotice(outcome.message ?? "Your details have been saved.");
      setOpen(null);
      // The summary above is server-rendered, so it has to be asked again.
      router.refresh();
    });
  }

  function changePassword(formData: FormData) {
    setError("");
    startTransition(async () => {
      const outcome = await changeOwnPasswordAction(formData);
      if (!outcome.ok) {
        setError(outcome.error ?? "Could not change your password.");
        return;
      }

      setNotice(outcome.message ?? "Your password has been changed.");
      setOpen(null);
    });
  }

  function saveBio(formData: FormData) {
    setError("");
    startTransition(async () => {
      const outcome = await saveOwnBioAction(formData);
      if (!outcome.ok) {
        setError(outcome.error ?? "Could not save your profile.");
        return;
      }

      setNotice(outcome.message ?? "Your profile has been saved.");
      setOpen(null);
      router.refresh();
    });
  }

  function close() {
    if (pending) return;
    setOpen(null);
    setError("");
  }

  function show(dialog: "details" | "password" | "profile") {
    setNotice("");
    setError("");
    setOpen(dialog);
  }

  return (
    <section className="member-card">
      <h2 className="member-card-title">Your account</h2>

      <dl className="member-facts">
        <dt>Name</dt>
        <dd>{[member.firstName, member.lastName].filter(Boolean).join(" ") || "—"}</dd>
        <dt>Email</dt>
        <dd>{member.email}</dd>
        <dt>Phone</dt>
        <dd>{formatPhone(member.phone) || "—"}</dd>
      </dl>

      {notice ? (
        <div className="admin-notice" style={{ marginTop: "1rem" }} role="status">
          {notice}
        </div>
      ) : null}

      <div className="member-actions">
        {canEdit ? (
          <button type="button" className="btn btn-sm" onClick={() => show("details")}>
            Change details
          </button>
        ) : null}

        <button type="button" className="btn btn-sm" onClick={() => show("password")}>
          Change password
        </button>

        {canEdit && bio ? (
          <button type="button" className="btn btn-sm" onClick={() => show("profile")}>
            Edit profile
          </button>
        ) : null}

      </div>

      <p className="member-note">
        {canEdit
          ? `Signed in as ${signedInAs}.`
          : `Signed in as ${signedInAs}. Ask an administrator to change your details — your level cannot edit them.`}
      </p>

      {open === "details" ? (
        <AccountDialog
          title="Your details"
          subtitle="How the community reaches you. Your level and membership are decided elsewhere."
          onClose={close}
        >
          <ProfileForm
            member={member}
            emailVerified={emailVerified}
            pending={pending}
            error={error}
            onSubmit={saveDetails}
            onCancel={close}
          />
        </AccountDialog>
      ) : null}

      {open === "profile" && bio ? (
        <AccountDialog
          title="Edit profile"
          subtitle="How you appear to the rest of the community."
          onClose={close}
        >
          <BioForm
            bio={bio}
            pending={pending}
            error={error}
            onSubmit={saveBio}
            onCancel={close}
          />
        </AccountDialog>
      ) : null}

      {open === "password" ? (
        <AccountDialog
          title="Change password"
          subtitle="You will stay signed in on this device."
          onClose={close}
        >
          <form action={changePassword}>
            {error ? <div className="admin-notice is-error">{error}</div> : null}

            <PasswordFields idPrefix="me-" />

            <div className="member-actions" style={{ marginTop: 0 }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
                {pending ? "Saving…" : "Change password"}
              </button>
              <button
                type="button"
                className="btn btn-sm"
                disabled={pending}
                onClick={close}
              >
                Cancel
              </button>
            </div>
          </form>
        </AccountDialog>
      ) : null}
    </section>
  );
}
