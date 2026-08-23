import nodemailer, { type Transporter } from "nodemailer";

import { connectDB } from "./db";
import { EmailSettings } from "./models";
import { richTextToPlainText } from "./rich-text";

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
  lastVerifiedAt: null,
};

export async function getEmailSettings(): Promise<EmailSettingsValues> {
  await connectDB();
  const doc = await EmailSettings.findOne().lean<any>();
  if (!doc) return { ...defaultEmailSettings };

  return {
    ...defaultEmailSettings,
    ...doc,
    notificationRecipients: Array.isArray(doc.notificationRecipients)
      ? doc.notificationRecipients
      : [],
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

export async function verifyEmailSettings(): Promise<{ ok: boolean; error?: string }> {
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
    return { ok: false, error: error instanceof Error ? error.message : "Verification failed." };
  }
}

export async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getEmailSettings();
  const transport = createTransport(settings);
  if (!transport) return { ok: false, error: "SMTP is not configured." };

  try {
    await transport.sendMail({
      from: settings.fromName
        ? `"${settings.fromName}" <${settings.fromEmail}>`
        : settings.fromEmail,
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

  const transport = createTransport(settings);
  if (!transport) return { sent: false, error: "SMTP is not configured." };

  const lines = input.fields.map((field) => {
    const value = Array.isArray(field.value)
      ? field.value.join(", ")
      : richTextToPlainText(String(field.value ?? ""));
    return `${field.label || field.name}: ${value}`;
  });

  try {
    await transport.sendMail({
      from: settings.fromName
        ? `"${settings.fromName}" <${settings.fromEmail}>`
        : settings.fromEmail,
      to: [...new Set(recipients)].join(", "),
      replyTo: settings.replyTo || undefined,
      subject: `New submission: ${input.formTitle}`,
      text: `A new submission was received for “${input.formTitle}”.\n\n${lines.join("\n")}`,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "Send failed." };
  }
}
