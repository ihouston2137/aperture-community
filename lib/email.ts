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
import type { MarkedQuestion, TestGrade } from "./form-test";
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

/* ------------------------------------------------------- Test results */

/**
 * One question as a line of a posted paper.
 *
 * Prints only what it was handed. A grade shaped for the person who took it
 * has the answers taken out of it, and the same renderer then prints a paper
 * without them — so what arrives in an inbox can never say more than what the
 * screen said, without anybody having to keep two sets of rules in step.
 */
function markedLine(question: MarkedQuestion, index: number): string {
  const lines = [
    `${index + 1}. ${question.label || "(untitled)"} — ${
      question.correct ? "correct" : "wrong"
    }`,
  ];
  if (question.given !== undefined && !question.correct) {
    lines.push(`     They wrote: ${question.given || "(nothing)"}`);
  }
  if (question.expected !== undefined && !question.correct) {
    lines.push(`     Correct: ${question.expected}`);
  }
  return lines.join("\n");
}

function scoreLines(grade: TestGrade): string[] {
  const lines = [`Scored ${grade.percent}% — ${grade.right} of ${grade.marked} correct.`];
  if (grade.passed !== null) {
    lines.push(
      grade.passed
        ? `Passed — ${grade.passMark}% was needed.`
        : `Did not pass — ${grade.passMark}% was needed.`
    );
  }
  return lines;
}

/** What became of the two letters, so a silent failure can be seen. */
export type TestResultSend = {
  markers: boolean;
  taker: boolean;
  /** How many addresses the test named, and whether a taker copy was asked for. */
  markerCount: number;
  takerAsked: boolean;
  errors: string[];
};

/**
 * The marked paper, posted.
 *
 * Two different letters rather than one with names hidden in it: the people
 * marking are told who sat it and what the whole paper looked like, and the
 * person who sat it is told exactly what the screen told them and no more.
 * Neither is gated by the site-wide form-notification switch — an address
 * typed into a test is somebody asking for these results, and a setting about
 * form submissions has no business cancelling it.
 *
 * Failures are returned, never thrown. A result is already recorded by the
 * time this runs, and losing it because a mail server was busy would be much
 * the worse outcome.
 */
export async function sendTestResultEmail(input: {
  testTitle: string;
  takerName: string;
  /** The whole marking, for whoever holds the test. */
  grade: TestGrade;
  markers: string[];
  /**
   * The person who took it: their address, and their result already shaped by
   * the test's result mode. A null grade is the silent mode — a receipt, with
   * no mark on it.
   */
  taker?: { email: string; grade: TestGrade | null } | null;
  /** Which attempt this was, and whether it is the one being kept. */
  attempts: number;
  kept: boolean;
}): Promise<TestResultSend> {
  const sent: TestResultSend = {
    markers: false,
    taker: false,
    markerCount: input.markers.length,
    takerAsked: Boolean(input.taker?.email),
    errors: [],
  };

  const attempt =
    input.attempts > 1
      ? `Attempt ${input.attempts}. ${
          input.kept
            ? "This is the result being kept."
            : "An earlier, better result is the one being kept."
        }`
      : "";

  if (input.markers.length > 0) {
    const paper = input.grade.questions.map(markedLine).join("\n");
    const body = [
      `${input.takerName} took "${input.testTitle}".`,
      scoreLines(input.grade).join("\n"),
      attempt,
      paper,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await sendMail({
      to: input.markers,
      subject: `Test result: ${input.testTitle} — ${input.takerName} (${input.grade.percent}%)`,
      text: body,
    });
    sent.markers = result.ok;
    if (!result.ok) sent.errors.push(`markers: ${result.error ?? "send failed"}`);
  }

  if (input.taker?.email) {
    const shown = input.taker.grade;
    const body = shown
      ? [
          `Here is your result for "${input.testTitle}".`,
          scoreLines(shown).join("\n"),
          attempt,
          shown.questions.map(markedLine).join("\n"),
        ]
          .filter(Boolean)
          .join("\n\n")
      : [
          `Your attempt at "${input.testTitle}" has been received and recorded.`,
          attempt,
        ]
          .filter(Boolean)
          .join("\n\n");

    const result = await sendMail({
      to: input.taker.email,
      subject: shown
        ? `Your result: ${input.testTitle} (${shown.percent}%)`
        : `Received: ${input.testTitle}`,
      text: body,
    });
    sent.taker = result.ok;
    if (!result.ok) sent.errors.push(`taker: ${result.error ?? "send failed"}`);
  }

  /*
   * Said out loud when it fails.
   *
   * This is the one send nobody is watching: the candidate is shown their mark
   * whatever happens to the post, and the people expecting the paper only find
   * out it never came by not receiving it. A swallowed error here is a setting
   * that looks switched on and does nothing, so it goes to the server log with
   * enough in it to tell "nobody was addressed" from "the mail server said no".
   */
  if (sent.errors.length > 0) {
    console.error(
      `Test result email for "${input.testTitle}" failed: ${sent.errors.join("; ")}`
    );
  }

  return sent;
}

/**
 * Sends the form-submission notification. Failures are reported but never
 * block the submission itself — the record is already stored by then.
 */
export async function sendFormSubmissionNotification(input: {
  formTitle: string;
  fields: SubmissionField[];
  extraRecipients?: string[];
  /** Set when the form was a test. Leads the message, as the mark does the list. */
  grade?: { percent: number; right: number; marked: number } | null;
}): Promise<{ sent: boolean; error?: string }> {
  const settings = await getEmailSettings();

  if (!settings.enabled) {
    console.info(
      `Submission to "${input.formTitle}" not notified: email sending is switched off in the admin.`
    );
    return { sent: false, error: "Email sending is switched off in the admin." };
  }

  /*
   * Two kinds of recipient, and only one of them is a default.
   *
   * `notifyOnFormSubmission` decides whether the site's standing recipients
   * hear about every form there is — it is a blanket, and switching it off is
   * a statement about forms in general. Addresses typed into one form's own
   * settings are not that: somebody named them on that form, for that form,
   * and silently dropping them because a site-wide default is off left the
   * setting looking switched on while doing nothing. So the toggle gates the
   * standing list alone; a form's own addresses are always posted to.
   */
  const named = (input.extraRecipients ?? []).filter(Boolean);
  const standing = settings.notifyOnFormSubmission
    ? settings.notificationRecipients.filter(Boolean)
    : [];
  const recipients = [...standing, ...named];

  if (recipients.length === 0) {
    console.info(
      `Submission to "${input.formTitle}" not notified: nobody is set to be told. ` +
        (settings.notifyOnFormSubmission
          ? "Add recipients in Email settings, or notify addresses on the form itself."
          : "Submission notifications are switched off in Email settings, and the form names nobody of its own.")
    );
    return { sent: false };
  }

  const lines = input.fields.map((field) => {
    const value = Array.isArray(field.value)
      ? field.value.join(", ")
      : richTextToPlainText(String(field.value ?? ""));
    return `${field.label || field.name}: ${value}`;
  });

  const scored = input.grade
    ? `Graded ${input.grade.percent}% — ${input.grade.right} of ${input.grade.marked} correct.\n\n`
    : "";

  const result = await sendMail({
    to: recipients,
    subject: input.grade
      ? `New test result: ${input.formTitle} (${input.grade.percent}%)`
      : `New submission: ${input.formTitle}`,
    text: `A new submission was received for “${input.formTitle}”.\n\n${scored}${lines.join("\n")}`,
  });

  // Nobody is watching this send: the person who filled the form is thanked
  // either way, and the people expecting the entry only find out it never came
  // by not receiving it.
  if (!result.ok) {
    console.error(
      `Submission notification for "${input.formTitle}" failed: ${result.error ?? "send failed"}`
    );
  }

  return { sent: result.ok, error: result.error };
}
