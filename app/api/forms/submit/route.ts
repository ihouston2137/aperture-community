import type { NextRequest } from "next/server";

import { connectDB } from "@/lib/db";
import { sendFormSubmissionNotification } from "@/lib/email";
import { collectFormFields, normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import {
  gradeForTaker,
  gradeSitting,
  normalizeTestSettings,
  type SittingRef,
} from "@/lib/form-test";
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

  const settings = normalizeFormSettings(form.settings);
  const isTest = form.kind === "test";
  const test = normalizeTestSettings(form.test);

  /*
   * A test's questions are not in its layout, and which of them were asked is
   * not the same from one sitting to the next — so the fields it is graded
   * against are the ones the client says it was served, checked back against
   * the stored test rather than taken on trust. The key is never sent to the
   * browser; only the shape of the paper comes back.
   */
  const sitting: SittingRef[] = isTest
    ? (Array.isArray(body.sitting) ? body.sitting : [])
        .map((entry: any) => ({
          questionId: String(entry?.questionId ?? ""),
          variantId: String(entry?.variantId ?? ""),
        }))
        .filter((ref: SittingRef) =>
          test.questions.some(
            (question) =>
              question.id === ref.questionId &&
              question.variants.some((variant) => variant.id === ref.variantId)
          )
        )
    : [];

  const layout = isTest ? [] : normalizeFormLayout(form.layout);
  const definedFields = isTest
    ? sitting
        .map((ref) => {
          const question = test.questions.find((entry) => entry.id === ref.questionId);
          return question?.variants.find((entry) => entry.id === ref.variantId)?.block;
        })
        .filter(Boolean)
        .map((block) => block!)
    : collectFormFields(layout);

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

  /*
   * Marked here and stored, never recomputed later: the key can be edited
   * afterwards, and a grade that silently changes when somebody fixes a typo
   * in an answer is not a record of anything.
   */
  const grade = isTest
    ? gradeSitting(
        test,
        sitting,
        Object.fromEntries(definedFields.map((field) => [field.id, submitted.get(field.id) ?? ""]))
      )
    : null;

  await FormSubmission.create({
    formId: String(form._id),
    formTitle: form.title ?? "",
    data,
    fields,
    status: "new",
    ...(grade ? { grade, sitting } : {}),
  });

  // A failed notification must not fail the submission — it is already stored.
  const notification = await sendFormSubmissionNotification({
    formTitle: form.title ?? "",
    fields,
    extraRecipients: settings.notifyEmails,
    grade,
  });

  return Response.json({
    ok: true,
    message: settings.successMessage,
    notified: notification.sent,
    // Shaped by the test's own setting: the whole marking, the percentage
    // alone, or nothing at all.
    grade: grade ? gradeForTaker(grade, test.resultMode) : undefined,
  });
}
