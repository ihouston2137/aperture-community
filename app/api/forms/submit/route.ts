import type { NextRequest } from "next/server";

import { connectDB } from "@/lib/db";
import { sendFormSubmissionNotification } from "@/lib/email";
import { collectFormFields, normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import { FormDefinition, FormSubmission } from "@/lib/models";

const MAX_VALUE_LENGTH = 20_000;

function clamp(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, MAX_VALUE_LENGTH);
  if (Array.isArray(value)) return value.slice(0, 50).map(clamp);
  return value;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.formId) {
    return Response.json({ error: "Missing form." }, { status: 400 });
  }

  await connectDB();
  const form = await FormDefinition.findById(body.formId).lean<any>();
  if (!form || form.status !== "published") {
    return Response.json({ error: "This form is not accepting submissions." }, { status: 404 });
  }

  const layout = normalizeFormLayout(form.layout);
  const settings = normalizeFormSettings(form.settings);
  const definedFields = collectFormFields(layout);

  // Trust the stored definition, not the client, for which fields exist and
  // which are required.
  const submitted = new Map<string, unknown>();
  for (const field of Array.isArray(body.fields) ? body.fields : []) {
    if (field?.id) submitted.set(String(field.id), clamp(field.value));
  }

  const data: Record<string, unknown> = {};
  const fields = [];

  for (const field of definedFields) {
    const value = submitted.get(field.id) ?? "";
    const isEmpty =
      value === "" || value === null || (Array.isArray(value) && value.length === 0);

    if (field.required && isEmpty) {
      return Response.json(
        { error: `“${field.label}” is required.` },
        { status: 400 }
      );
    }

    data[field.name ?? field.id] = value;
    fields.push({
      id: field.id,
      name: field.name,
      label: field.label,
      type: field.type,
      value,
    });
  }

  await FormSubmission.create({
    formId: String(form._id),
    formTitle: form.title ?? "",
    data,
    fields,
    status: "new",
  });

  // A failed notification must not fail the submission — it is already stored.
  const notification = await sendFormSubmissionNotification({
    formTitle: form.title ?? "",
    fields,
    extraRecipients: settings.notifyEmails,
  });

  return Response.json({
    ok: true,
    message: settings.successMessage,
    notified: notification.sent,
  });
}
