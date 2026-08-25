"use client";

import { useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import type { AuthSettingsValues } from "@/lib/auth-settings";
import { TWO_FACTOR_MODES } from "@/lib/verification-types";

import { saveRegistrationSettingsAction } from "./actions";

export type LevelOption = { _id: string; name: string; openToRegistration: boolean };

const twoFactorLabels: Record<(typeof TWO_FACTOR_MODES)[number], string> = {
  off: "Never — password only",
  admins: "Only accounts that manage something",
  everyone: "Everyone, every sign-in",
};

export function RegistrationSettingsForm({
  settings,
  roles,
}: {
  settings: AuthSettingsValues;
  roles: LevelOption[];
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [notifying, setNotifying] = useState(settings.notifyOnRegistration);

  function save(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      const outcome = await saveRegistrationSettingsAction(formData);
      setResult({
        ok: outcome.ok,
        message: outcome.ok
          ? outcome.message ?? "Saved."
          : outcome.error ?? "Something went wrong.",
      });
    });
  }

  return (
    <form action={save}>
      {result ? (
        <div className={`admin-notice${result.ok ? "" : " is-error"}`}>
          {result.message}
        </div>
      ) : null}

      <Panel title="Joining">
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="allowRegistration"
            defaultChecked={settings.allowRegistration}
          />
          Anyone can register from the sign-in page
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="allowRoleRequest"
            defaultChecked={settings.allowRoleRequest}
          />
          Let people say which membership level they are applying for
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="autoApproveRegistrations"
            defaultChecked={settings.autoApproveRegistrations}
          />
          Approve new registrations automatically
        </label>
        <span className="help-text">
          With this off, a registration waits under Members until somebody
          approves it, and cannot sign in before then.
        </span>

        <div className="field-grid" style={{ marginTop: "0.9rem" }}>
          <div className="field">
            <label htmlFor="defaultCommunityRoleId">Level assigned at registration</label>
            <select
              id="defaultCommunityRoleId"
              name="defaultCommunityRoleId"
              defaultValue={settings.defaultCommunityRoleId}
            >
              <option value="">Lowest level</option>
              {roles.map((role) => (
                <option key={role._id} value={role._id}>
                  {role.name}
                  {role.openToRegistration ? "" : " (not offered at registration)"}
                </option>
              ))}
            </select>
            <span className="help-text">
              Everyone starts here whatever they asked for. Change it when you
              approve them.
            </span>
          </div>
        </div>

        {roles.length === 0 ? (
          <p className="help-text">
            No membership levels exist yet, so nobody can register. Add one under
            Users &amp; roles.
          </p>
        ) : null}
      </Panel>

      <Panel title="Codes">
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="requireEmailVerification"
            defaultChecked={settings.requireEmailVerification}
          />
          Confirm a new email address with a six-digit code
        </label>

        <div className="field-grid" style={{ marginTop: "0.9rem" }}>
          <div className="field">
            <label htmlFor="twoFactorMode">Ask for a code at sign-in</label>
            <select
              id="twoFactorMode"
              name="twoFactorMode"
              defaultValue={settings.twoFactorMode}
            >
              {TWO_FACTOR_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {twoFactorLabels[mode]}
                </option>
              ))}
            </select>
            <span className="help-text">
              A second factor emailed after the password is accepted.
            </span>
          </div>
          <div className="field">
            <label htmlFor="codeTtlMinutes">A code expires after</label>
            <input
              id="codeTtlMinutes"
              type="number"
              name="codeTtlMinutes"
              min={2}
              max={1440}
              defaultValue={settings.codeTtlMinutes}
            />
            <span className="help-text">
              Minutes. Applies to confirmation, sign-in and password recovery
              codes alike.
            </span>
          </div>
        </div>

        <p className="help-text">
          Password recovery always uses a code, whatever is set here — it is the
          only way back into an account.
        </p>
      </Panel>

      <Panel title="New registration notification">
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="notifyOnRegistration"
            checked={notifying}
            onChange={(event) => setNotifying(event.target.checked)}
          />
          Email somebody when a new member registers
        </label>

        <div className="field-grid" style={{ marginTop: "0.9rem" }}>
          <div className="field">
            <label htmlFor="registrationRecipients">Send to</label>
            <input
              id="registrationRecipients"
              type="text"
              name="registrationRecipients"
              defaultValue={settings.registrationRecipients.join(", ")}
              placeholder="membership@example.org, chair@example.org"
            />
            <span className="help-text">
              Comma separated. Anything that is not an email address is dropped.
            </span>
          </div>
          <div className="field">
            <label htmlFor="registrationSubject">Subject</label>
            <input
              id="registrationSubject"
              type="text"
              name="registrationSubject"
              defaultValue={settings.registrationSubject}
              placeholder="New registration"
            />
            <span className="help-text">
              Left blank, the new member is named in the subject.
            </span>
          </div>
        </div>

        <div className="field" style={{ marginTop: "0.75rem" }}>
          <label htmlFor="registrationIntro">Opening line</label>
          <textarea
            id="registrationIntro"
            name="registrationIntro"
            rows={3}
            defaultValue={settings.registrationIntro}
            placeholder="A new member has registered on your community portal."
          />
          <span className="help-text">
            The name, email, phone number, level applied for and level assigned
            follow it, with a link to the approval queue.
          </span>
        </div>

        {notifying && settings.registrationRecipients.length === 0 ? (
          <p className="help-text">
            Add at least one address above, or this will not send anything.
          </p>
        ) : null}
      </Panel>

      <div style={{ marginTop: "0.75rem" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
