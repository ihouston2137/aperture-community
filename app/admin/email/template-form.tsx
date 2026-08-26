"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Panel } from "@/components/admin-ui";
import {
  EMAIL_TEMPLATES,
  type EmailTemplateDefinition,
  type EmailTemplateOverride,
} from "@/lib/email-templates";

import { saveEmailTemplatesAction } from "../settings-actions";

type Draft = { subject: string; body: string };

/**
 * The wording of the messages the site sends on its own.
 *
 * Each template shows what the app would send if left alone, and typing over it
 * replaces it. Emptying a field puts the default back — there is no separate
 * reset to get out of step with what was typed.
 */
export function EmailTemplateForm({
  overrides,
}: {
  overrides: EmailTemplateOverride[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [open, setOpen] = useState<string>(EMAIL_TEMPLATES[0]?.key ?? "");

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const start: Record<string, Draft> = {};
    for (const template of EMAIL_TEMPLATES) {
      const stored = overrides.find((override) => override.key === template.key);
      start[template.key] = {
        subject: stored?.subject ?? "",
        body: stored?.body ?? "",
      };
    }
    return start;
  });

  const changedCount = useMemo(
    () =>
      EMAIL_TEMPLATES.filter((template) => {
        const draft = drafts[template.key];
        return Boolean(draft?.subject.trim() || draft?.body.trim());
      }).length,
    [drafts]
  );

  function set(key: string, field: keyof Draft, value: string) {
    setResult(null);
    setDrafts((current) => ({
      ...current,
      [key]: { ...current[key], [field]: value },
    }));
  }

  function save() {
    setResult(null);
    startTransition(async () => {
      const payload = EMAIL_TEMPLATES.map((template) => ({
        key: template.key,
        subject: drafts[template.key]?.subject ?? "",
        body: drafts[template.key]?.body ?? "",
      }));

      const formData = new FormData();
      formData.set("templates", JSON.stringify(payload));

      const outcome = await saveEmailTemplatesAction(formData);
      if (outcome.ok) {
        setResult({ ok: true, message: "Saved. The next message sent uses this." });
        router.refresh();
      } else {
        setResult({ ok: false, message: outcome.error ?? "Could not save those." });
      }
    });
  }

  const groups = [...new Set(EMAIL_TEMPLATES.map((template) => template.group))];

  return (
    <Panel title="What the emails say">
      <p className="help-text">
        {changedCount === 0
          ? "Every message is using the wording the site ships with."
          : `${changedCount} of ${EMAIL_TEMPLATES.length} have been rewritten. Clearing a field puts its default back.`}
      </p>

      {result ? (
        <div
          className={`admin-notice${result.ok ? "" : " is-error"}`}
          style={{ marginTop: "0.75rem" }}
          role="status"
        >
          {result.message}
        </div>
      ) : null}

      {groups.map((group) => (
        <div key={group} className="inspector-section">
          <h3 className="inspector-title">{group}</h3>

          <ul className="admin-list">
            {EMAIL_TEMPLATES.filter((template) => template.group === group).map(
              (template) => (
                <TemplateRow
                  key={template.key}
                  template={template}
                  draft={drafts[template.key]}
                  isOpen={open === template.key}
                  pending={pending}
                  onToggle={() =>
                    setOpen((current) =>
                      current === template.key ? "" : template.key
                    )
                  }
                  onChange={(field, value) => set(template.key, field, value)}
                />
              )
            )}
          </ul>
        </div>
      ))}

      <div className="admin-list-actions" style={{ marginTop: "1rem" }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={save}
        >
          {pending ? "Saving…" : "Save wording"}
        </button>
      </div>
    </Panel>
  );
}

function TemplateRow({
  template,
  draft,
  isOpen,
  pending,
  onToggle,
  onChange,
}: {
  template: EmailTemplateDefinition;
  draft: Draft | undefined;
  isOpen: boolean;
  pending: boolean;
  onToggle: () => void;
  onChange: (field: keyof Draft, value: string) => void;
}) {
  const rewritten = Boolean(draft?.subject.trim() || draft?.body.trim());

  return (
    <li className="admin-list-item" style={{ flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 18rem", minWidth: 0 }}>
        <h3>{template.label}</h3>
        <div className="admin-list-meta">{template.description}</div>
      </div>

      <span className={`badge${rewritten ? " badge-draft" : ""}`}>
        {rewritten ? "rewritten" : "default"}
      </span>

      <div className="admin-list-actions">
        <button type="button" className="btn btn-sm" onClick={onToggle}>
          {isOpen ? "Done" : "Edit"}
        </button>
      </div>

      {isOpen ? (
        <div style={{ flex: "1 1 100%", marginTop: "0.75rem" }}>
          <div className="field">
            <label htmlFor={`subject-${template.key}`}>Subject</label>
            <input
              id={`subject-${template.key}`}
              type="text"
              value={draft?.subject ?? ""}
              placeholder={template.subject}
              disabled={pending}
              onChange={(event) => onChange("subject", event.target.value)}
            />
          </div>

          <div className="field" style={{ marginTop: "0.75rem" }}>
            <label htmlFor={`body-${template.key}`}>Message</label>
            <textarea
              id={`body-${template.key}`}
              rows={10}
              value={draft?.body ?? ""}
              placeholder={template.body}
              disabled={pending}
              onChange={(event) => onChange("body", event.target.value)}
            />
            <span className="help-text">
              Leave either blank to keep the wording shown behind it.
            </span>
          </div>

          <div className="field" style={{ marginTop: "0.75rem" }}>
            <span className="field-label">What you can drop in</span>
            <dl className="email-tokens">
              {template.tokens.map((token) => (
                <div key={token.token}>
                  <dt>
                    <code>{`{{${token.token}}}`}</code>
                  </dt>
                  <dd>{token.description}</dd>
                </div>
              ))}
            </dl>
            <span className="help-text">
              Anything else in double braces is left alone, so a mistyped name
              shows up in the message rather than disappearing from it.
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}
