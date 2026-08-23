"use client";

import { useState, useTransition } from "react";

import type { EmailSettingsValues } from "@/lib/email";

import {
  saveEmailSettingsAction,
  sendTestEmailAction,
  verifyEmailAction,
} from "../settings-actions";

export function EmailSettingsForm({
  settings,
}: {
  settings: EmailSettingsValues & { hasPassword: boolean };
}) {
  const [testAddress, setTestAddress] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setResult(null);
    startTransition(async () => {
      const outcome = await action();
      setResult({
        ok: outcome.ok,
        message: outcome.ok ? success : outcome.error ?? "Something went wrong.",
      });
    });
  }

  return (
    <>
      {result ? (
        <div className={`admin-notice${result.ok ? "" : " is-error"}`}>{result.message}</div>
      ) : null}

      <form action={saveEmailSettingsAction} className="panel">
        <h2 className="panel-title">SMTP</h2>

        <label className="checkbox-row" style={{ marginBottom: "0.75rem" }}>
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
          Email sending enabled
        </label>

        <div className="field-grid">
          <div className="field">
            <label>Host</label>
            <input type="text" name="host" defaultValue={settings.host} />
          </div>
          <div className="field">
            <label>Port</label>
            <input type="number" name="port" defaultValue={settings.port} />
          </div>
          <div className="field">
            <label>Username</label>
            <input type="text" name="username" defaultValue={settings.username} autoComplete="off" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" name="password" autoComplete="new-password" />
            <span className="help-text">
              {settings.hasPassword
                ? "Leave blank to keep the stored password."
                : "No password stored yet."}
            </span>
          </div>
          <div className="field">
            <label>From name</label>
            <input type="text" name="fromName" defaultValue={settings.fromName} />
          </div>
          <div className="field">
            <label>From address</label>
            <input type="email" name="fromEmail" defaultValue={settings.fromEmail} />
          </div>
          <div className="field">
            <label>Reply-to</label>
            <input type="email" name="replyTo" defaultValue={settings.replyTo} />
          </div>
          <div className="field">
            <label>Notification recipients</label>
            <input
              type="text"
              name="notificationRecipients"
              defaultValue={settings.notificationRecipients.join(", ")}
            />
            <span className="help-text">Comma separated.</span>
          </div>
        </div>

        <label className="checkbox-row" style={{ marginTop: "0.75rem" }}>
          <input type="checkbox" name="secure" defaultChecked={settings.secure} />
          Use TLS (port 465)
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            name="notifyOnFormSubmission"
            defaultChecked={settings.notifyOnFormSubmission}
          />
          Send a notification on every form submission
        </label>

        {settings.lastVerifiedAt ? (
          <p className="help-text" style={{ marginTop: "0.75rem" }}>
            Last verified {new Date(settings.lastVerifiedAt).toLocaleString()}.
          </p>
        ) : null}

        <div style={{ marginTop: "0.75rem" }}>
          <button type="submit" className="btn btn-primary">
            Save settings
          </button>
        </div>
      </form>

      <section className="panel">
        <h2 className="panel-title">Test</h2>
        <div className="field-grid">
          <div className="field">
            <label>Send a test email to</label>
            <input
              type="email"
              value={testAddress}
              onChange={(event) => setTestAddress(event.target.value)}
            />
          </div>
        </div>

        <div className="admin-list-actions" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending}
            onClick={() => run(verifyEmailAction, "SMTP connection verified.")}
          >
            Verify connection
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={pending || !testAddress}
            onClick={() => run(() => sendTestEmailAction(testAddress), "Test email sent.")}
          >
            Send test email
          </button>
        </div>
      </section>
    </>
  );
}
