import { verificationCopy } from "./verification-types";

/**
 * The messages the site sends on its own, and the wording an administrator can
 * replace.
 *
 * Each one ships with the copy the app has always sent. An override is stored
 * only when somebody types one, so a template left alone follows the default
 * even after the default is improved — and clearing a field puts the default
 * back rather than sending an empty email.
 */

export type EmailTemplateKey =
  | "verifyEmail"
  | "verifyLogin"
  | "verifyPassword"
  | "membershipApproved"
  | "membershipChanged"
  | "membershipRejected";

/** One thing a template can drop into its subject or body. */
export type EmailToken = { token: string; description: string };

export type EmailTemplateDefinition = {
  key: EmailTemplateKey;
  group: string;
  label: string;
  description: string;
  subject: string;
  body: string;
  tokens: EmailToken[];
};

/** What an administrator has typed in place of a default. */
export type EmailTemplateOverride = {
  key: string;
  subject: string;
  body: string;
};

const GREETING: EmailToken = {
  token: "greeting",
  description: "“Hello Ian,” — or just “Hello,” when no name is known",
};
const NAME: EmailToken = { token: "name", description: "The member's first name" };
const NOTE: EmailToken = {
  token: "note",
  description: "The note typed alongside the decision, if there was one",
};
const SIGN_IN_URL: EmailToken = {
  token: "signInUrl",
  description: "A link to the sign-in page",
};

/** The verification emails differ only in the line that explains the code. */
function codeTemplate(
  key: EmailTemplateKey,
  purpose: keyof typeof verificationCopy,
  label: string,
  description: string
): EmailTemplateDefinition {
  return {
    key,
    group: "Codes",
    label,
    description,
    subject: verificationCopy[purpose].subject,
    body: [
      "{{greeting}}",
      "",
      verificationCopy[purpose].intro,
      "",
      "    {{spacedCode}}",
      "",
      "Your code is {{code}}. It expires in {{expiresIn}}.",
      "",
      "If you did not ask for this, you can ignore this email and nothing will change.",
    ].join("\n"),
    tokens: [
      GREETING,
      NAME,
      { token: "code", description: "The six digits, as typed in" },
      { token: "spacedCode", description: "The same digits spaced out, easier to read" },
      { token: "expiresIn", description: "How long the code lasts — “10 minutes”" },
    ],
  };
}

export const EMAIL_TEMPLATES: EmailTemplateDefinition[] = [
  codeTemplate(
    "verifyEmail",
    "email",
    "Confirm an email address",
    "Sent when somebody registers, and again if a member changes their address.",
  ),
  codeTemplate(
    "verifyLogin",
    "login",
    "Sign-in code",
    "Sent when two-factor sign-in is switched on.",
  ),
  codeTemplate(
    "verifyPassword",
    "password",
    "Password reset code",
    "Sent when somebody asks to reset a forgotten password.",
  ),

  {
    key: "membershipApproved",
    group: "Membership",
    label: "Membership approved",
    description: "Sent when a registration is approved, if the administrator asks for it.",
    subject: "Your membership has been approved",
    body: [
      "{{greeting}}",
      "",
      "Your membership has been approved as {{level}}.",
      "",
      "You can sign in here: {{signInUrl}}",
      "",
      "{{note}}",
    ].join("\n"),
    tokens: [
      GREETING,
      NAME,
      { token: "level", description: "The membership level, or levels, they now hold" },
      SIGN_IN_URL,
      NOTE,
    ],
  },
  {
    key: "membershipChanged",
    group: "Membership",
    label: "Membership level changed",
    description: "Sent when the level a member holds is changed.",
    subject: "Your membership level has changed",
    body: ["{{greeting}}", "", "Your membership level is now {{level}}.", "", "{{note}}"].join(
      "\n"
    ),
    tokens: [
      GREETING,
      NAME,
      { token: "level", description: "The membership level, or levels, they now hold" },
      SIGN_IN_URL,
      NOTE,
    ],
  },
  {
    key: "membershipRejected",
    group: "Membership",
    label: "Membership declined",
    description: "Sent when an application is declined.",
    subject: "About your membership application",
    body: [
      "{{greeting}}",
      "",
      "Your membership application was not approved.",
      "",
      "{{note}}",
    ].join("\n"),
    tokens: [GREETING, NAME, NOTE],
  },
];

export function emailTemplate(key: EmailTemplateKey): EmailTemplateDefinition {
  const found = EMAIL_TEMPLATES.find((template) => template.key === key);
  // The keys are a union, so this cannot happen — but a template read from the
  // database has a plain string key.
  if (!found) throw new Error(`Unknown email template: ${key}`);
  return found;
}

/**
 * The wording actually to be sent: what was typed, falling back to the default
 * field by field, so a customised subject can sit above a default body.
 */
export function resolveEmailTemplate(
  key: EmailTemplateKey,
  overrides: EmailTemplateOverride[] | undefined
): { subject: string; body: string } {
  const defaults = emailTemplate(key);
  const stored = overrides?.find((override) => override.key === key);

  return {
    subject: stored?.subject?.trim() || defaults.subject,
    body: stored?.body?.trim() || defaults.body,
  };
}

/**
 * Substitutes `{{token}}` throughout, then tidies what the substitution left
 * behind.
 *
 * A token that resolves to nothing — most often a decision with no note — would
 * otherwise leave a gap where a paragraph was meant to be, so runs of blank
 * lines are collapsed to one and the ends are trimmed. An unknown token is left
 * exactly as typed rather than silently deleted: seeing `{{levl}}` in a test
 * send is how a typo gets found.
 */
export function renderEmailTemplate(
  text: string,
  values: Record<string, string>
): string {
  const filled = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, token: string) =>
    token in values ? values[token] : whole
  );

  return filled
    .split("\n")
    .map((line) => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A subject is one line whatever was typed into it. */
export function renderEmailSubject(
  text: string,
  values: Record<string, string>
): string {
  return renderEmailTemplate(text, values).replace(/\s*\n+\s*/g, " ");
}

/** Keeps only the overrides that say something, and only for templates that exist. */
export function normalizeTemplateOverrides(value: unknown): EmailTemplateOverride[] {
  if (!Array.isArray(value)) return [];

  const known = new Set(EMAIL_TEMPLATES.map((template) => template.key));
  const out: EmailTemplateOverride[] = [];

  for (const entry of value) {
    const key = String((entry as any)?.key ?? "");
    if (!known.has(key as EmailTemplateKey)) continue;

    const subject = String((entry as any)?.subject ?? "").trim().slice(0, 300);
    const body = String((entry as any)?.body ?? "").trim().slice(0, 8000);
    if (!subject && !body) continue;

    out.push({ key, subject, body });
  }

  return out;
}
