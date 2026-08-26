import nodemailer, { type Transporter } from "nodemailer";

import { connectDB } from "./db";
import {
  normalizeTemplateOverrides,
  renderEmailSubject,
  renderEmailTemplate,
  resolveEmailTemplate,
  type EmailTemplateKey,
  type EmailTemplateOverride,
} from "./email-templates";
import { EmailSettings } from "./models";
import { richTextToPlainText } from "./rich-text";
import { mergeSettings } from "./settings-merge";
import { type VerificationPurpose } from "./verification-types";

export type EmailSettingsValues = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  notificationRecipients: string[];
  notifyOnFormSubmission: boolean;
  lastVerifiedAt: Date | null;
  /** Only the wordings an administrator has actually replaced. */
  templates: EmailTemplateOverride[];
};

export const defaultEmailSettings: EmailSettingsValues = {
  enabled: false,
  host: "",
  port: 587,
  secure: false,
  username: "",
  password: "",
  fromName: "",
  fromEmail: "",
  replyTo: "",
  notificationRecipients: [],
  notifyOnFormSubmission: true,
  templates: [],
  lastVerifiedAt: null,
};

export async function getEmailSettings(): Promise<EmailSettingsValues> {
  await connectDB();
  const doc = await EmailSettings.findOne().lean<any>();
  const settings = mergeSettings(defaultEmailSettings, doc);

  return {
    ...settings,
    notificationRecipients: Array.isArray(settings.notificationRecipients)
      ? settings.notificationRecipients.map(String)
      : [],
    templates: normalizeTemplateOverrides(settings.templates),
  };
}

function createTransport(settings: EmailSettingsValues): Transporter | null {
  if (!settings.host || !settings.fromEmail) return null;

  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port || 587,
    secure: settings.secure,
    auth: settings.username
      ? { user: settings.username, pass: settings.password }
      : undefined,
  });
}

function fromAddress(settings: EmailSettingsValues): string {
  return settings.fromName
    ? `"${settings.fromName}" <${settings.fromEmail}>`
    : settings.fromEmail;
}

export type SendResult = { ok: boolean; error?: string };

/**
 * The one place mail leaves the app.
 *
 * `enabled` gates everything: a site with email switched off sends nothing, and
 * the caller is told so rather than left believing a message went out. Failures
 * are always returned, never thrown — no flow here is worth losing because a
 * mail server was briefly unreachable.
 */
async function sendMail(input: {
  to: string | string[];
  subject: string;
  text: string;
}): Promise<SendResult> {
  const settings = await getEmailSettings();
  if (!settings.enabled) {
    return { ok: false, error: "Email sending is switched off in the admin." };
  }

  const transport = createTransport(settings);
  if (!transport) return { ok: false, error: "SMTP is not configured." };

  const to = Array.isArray(input.to) ? [...new Set(input.to)].join(", ") : input.to;
  if (!to) return { ok: false, error: "No recipient." };

  try {
    await transport.sendMail({
      from: fromAddress(settings),
      to,
      replyTo: settings.replyTo || undefined,
      subject: input.subject,
      text: input.text,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Send failed." };
  }
}

/**
 * Sends one of the templates an administrator can rewrite.
 *
 * The wording is read at send time rather than baked into the caller, so a
 * change in the admin applies to the next message without anything being
 * redeployed.
 */
async function sendTemplate(
  key: EmailTemplateKey,
  to: string | string[],
  values: Record<string, string>
): Promise<SendResult> {
  const settings = await getEmailSettings();
  const template = resolveEmailTemplate(key, settings.templates);

  return sendMail({
    to,
    subject: renderEmailSubject(template.subject, values),
    text: renderEmailTemplate(template.body, values),
  });
}

export async function verifyEmailSettings(): Promise<SendResult> {
  const settings = await getEmailSettings();
  const transport = createTransport(settings);
  if (!transport) return { ok: false, error: "SMTP host and from address are required." };

  try {
    await transport.verify();
    await EmailSettings.findOneAndUpdate(
      {},
      { $set: { lastVerifiedAt: new Date() } },
      { upsert: true }
    );
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Verification failed.",
    };
  }
}

export async function sendTestEmail(to: string): Promise<SendResult> {
  const settings = await getEmailSettings();
  const transport = createTransport(settings);
  if (!transport) return { ok: false, error: "SMTP is not configured." };

  try {
    await transport.sendMail({
      from: fromAddress(settings),
      to,
      replyTo: settings.replyTo || undefined,
      subject: "Aperture test email",
      text: "This is a test email from your Aperture site. SMTP is working.",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Send failed." };
  }
}

/* ----------------------------------------------------- Account and identity */

/** Which template each flow sends. */
const codeTemplateKeys: Record<VerificationPurpose, EmailTemplateKey> = {
  email: "verifyEmail",
  login: "verifyLogin",
  password: "verifyPassword",
};

const decisionTemplateKeys: Record<
  "approved" | "rejected" | "changed",
  EmailTemplateKey
> = {
  approved: "membershipApproved",
  changed: "membershipChanged",
  rejected: "membershipRejected",
};

/**
 * The six-digit code, for whichever flow asked for it.
 *
 * The code is spaced out in the body so it is readable and easy to retype, and
 * the digits also appear unspaced so a client that offers to autofill can find
 * them.
 */
export async function sendVerificationCodeEmail(input: {
  to: string;
  name: string;
  code: string;
  purpose: VerificationPurpose;
  expiresAt: Date;
}): Promise<SendResult> {
  const minutes = Math.max(
    1,
    Math.round((input.expiresAt.getTime() - Date.now()) / 60000)
  );

  return sendTemplate(codeTemplateKeys[input.purpose], input.to, {
    greeting: input.name ? `Hello ${input.name},` : "Hello,",
    name: input.name,
    code: input.code,
    spacedCode: input.code.split("").join(" "),
    expiresIn: `${minutes} minute${minutes === 1 ? "" : "s"}`,
  });
}

/**
 * Tells the addresses configured under Registration that somebody has joined.
 *
 * Off by default, and silent when nobody is listed — a site that has not asked
 * for these is not told about the ones it is missing.
 */
export async function sendRegistrationNotification(input: {
  recipients: string[];
  subject: string;
  intro: string;
  member: {
    name: string;
    email: string;
    phone: string;
    requestedRole: string;
    assignedRole: string;
  };
  needsApproval: boolean;
  reviewUrl: string;
}): Promise<SendResult> {
  if (input.recipients.length === 0) return { ok: false, error: "No recipients." };

  const lines = [
    input.intro.trim() || "A new member has registered on your community portal.",
    "",
    `Name: ${input.member.name}`,
    `Email: ${input.member.email}`,
    `Phone: ${input.member.phone || "not given"}`,
    `Applied as: ${input.member.requestedRole || "no preference"}`,
    `Assigned: ${input.member.assignedRole}`,
    "",
    input.needsApproval
      ? `This registration is waiting for approval: ${input.reviewUrl}`
      : `This registration was approved automatically: ${input.reviewUrl}`,
  ];

  return sendMail({
    to: input.recipients,
    subject: input.subject.trim() || `New registration: ${input.member.name}`,
    text: lines.join("\n"),
  });
}

/** Tells a member their application was approved, declined, or their level changed. */
export async function sendMembershipDecisionEmail(input: {
  to: string;
  name: string;
  decision: "approved" | "rejected" | "changed";
  roleName: string;
  note: string;
  siteUrl: string;
}): Promise<SendResult> {
  return sendTemplate(decisionTemplateKeys[input.decision], input.to, {
    greeting: input.name ? `Hello ${input.name},` : "Hello,",
    name: input.name,
    level: input.roleName,
    note: input.note.trim(),
    signInUrl: input.siteUrl,
  });
}

/* --------------------------------------------------------------- Form mail */

export type SubmissionField = {
  label?: string;
  name?: string;
  type?: string;
  value: unknown;
};

/**
 * Sends the form-submission notification. Failures are reported but never
 * block the submission itself — the record is already stored by then.
 */
export async function sendFormSubmissionNotification(input: {
  formTitle: string;
  fields: SubmissionField[];
  extraRecipients?: string[];
}): Promise<{ sent: boolean; error?: string }> {
  const settings = await getEmailSettings();

  if (!settings.enabled || !settings.notifyOnFormSubmission) {
    return { sent: false };
  }

  const recipients = [
    ...settings.notificationRecipients,
    ...(input.extraRecipients ?? []),
  ].filter(Boolean);
  if (recipients.length === 0) return { sent: false };

  const lines = input.fields.map((field) => {
    const value = Array.isArray(field.value)
      ? field.value.join(", ")
      : richTextToPlainText(String(field.value ?? ""));
    return `${field.label || field.name}: ${value}`;
  });

  const result = await sendMail({
    to: recipients,
    subject: `New submission: ${input.formTitle}`,
    text: `A new submission was received for “${input.formTitle}”.\n\n${lines.join("\n")}`,
  });

  return { sent: result.ok, error: result.error };
}
