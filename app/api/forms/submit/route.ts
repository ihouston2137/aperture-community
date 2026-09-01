import type { NextRequest } from "next/server";

import { connectDB } from "@/lib/db";
import { fullName } from "@/lib/member-types";
import { getSession } from "@/lib/session";
import { sendFormSubmissionNotification, sendTestResultEmail } from "@/lib/email";
import { collectFormFields, normalizeFormLayout, normalizeFormSettings } from "@/lib/form-layout";
import {
  gradeForTaker,
  gradeSitting,
  normalizeTestSettings,
  type SittingRef,
} from "@/lib/form-test";
import { FormDefinition, FormSubmission, User } from "@/lib/models";

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
   * A test is sat by somebody.
   *
   * A form may be answered by anyone who can open it; a result nobody is
   * attached to is not a result, and an attempt limit nobody is identified
   * against is not a limit. So a test refuses an anonymous sitting outright
   * rather than recording one it cannot own.
   */
  let taker: { id: string; name: string; email: string } | null = null;
  if (isTest) {
    const session = await getSession();
    if (!session) {
      return Response.json(
        { error: "Sign in to take this test." },
        { status: 401 }
      );
    }

    const user = await User.findById(session.userId)
      .select("firstName lastName name email")
      .lean<any>();
    if (!user) {
      return Response.json({ error: "Sign in to take this test." }, { status: 401 });
    }

    taker = {
      id: session.userId,
      name: fullName(user),
      email: typeof user.email === "string" ? user.email : "",
    };
  }

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

  /*
   * Which attempt this was, and whether it is the one being kept.
   *
   * Read out of the branch below so the letter can say so. Somebody marking a
   * retake needs to know they are looking at attempt three and whether the
   * list will now show this paper or the earlier, better one.
   */
  let attemptNumber = 1;
  let keptThis = true;

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

    /*
     * The keyed bag, without one field standing on another.
     *
     * A field's name comes from its label, so two questions worded the same —
     * and every radio question starts life as "Choose one" — would write to one
     * key and only the last would survive. The ordered `fields` list below is
     * unaffected, and the marking reads answers by block id, so this only ever
     * cost the lookup copy; it cost it silently, which is worse.
     */
    const key = field.name && !(field.name in data) ? field.name : field.id;
    data[key] = value;
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

  if (isTest && taker) {
    /*
     * One row per person per test, holding their best result.
     *
     * Retaking is not a second result — it is the same person trying again,
     * and what is wanted from the list is how well they can do it. A tie goes
     * to the later attempt, since the more recent answer is the one that
     * reflects where they are now.
     *
     * The count is of attempts and survives whichever paper is kept, so a
     * limit still means what it says after a retake that scored worse.
     */
    const previous = await FormSubmission.findOne({
      formId: String(form._id),
      userId: taker.id,
    }).lean<any>();

    const attempts = (previous?.attempts ?? 0) + 1;
    attemptNumber = attempts;

    if (test.attemptLimit > 0 && attempts > test.attemptLimit) {
      return Response.json(
        {
          error:
            test.attemptLimit === 1
              ? "You have already taken this test."
              : `You have taken this test ${test.attemptLimit} times.`,
        },
        { status: 403 }
      );
    }

    const better =
      !previous?.grade ||
      (grade?.percent ?? 0) >= (previous.grade.percent ?? 0);
    keptThis = better;

    await FormSubmission.findOneAndUpdate(
      { formId: String(form._id), userId: taker.id },
      {
        $set: {
          formTitle: form.title ?? "",
          userName: taker.name,
          attempts,
          // Only the kept paper's answers, so the row is one whole attempt
          // rather than this attempt's grade against another's answers.
          ...(better
            ? { data, fields, grade, sitting, status: "new", createdAt: new Date() }
            : {}),
        },
      },
      { upsert: true }
    );
  } else {
    await FormSubmission.create({
      formId: String(form._id),
      formTitle: form.title ?? "",
      data,
      fields,
      status: "new",
      ...(grade ? { grade, sitting } : {}),
    });
  }

  /*
   * The marked paper, posted.
   *
   * After the record is written and never in place of it: a mail server being
   * slow or unreachable must not cost somebody the test they just took. The
   * result of the send is not reported back to the page either — the candidate
   * has no use for whether an administrator's inbox accepted it.
   */
  if (isTest && grade && taker) {
    const posted = await sendTestResultEmail({
      testTitle: form.title ?? "",
      takerName: taker.name,
      grade,
      markers: test.resultEmails,
      taker: test.emailTaker && taker.email
        ? { email: taker.email, grade: gradeForTaker(grade, test.resultMode) }
        : null,
      attempts: attemptNumber,
      kept: keptThis,
    });

    /*
     * Why nothing was posted, when nothing was posted.
     *
     * Named recipients and a taker asked for but neither sent is a mail server
     * saying no, which `sendTestResultEmail` has already logged. Nobody named
     * and nobody asked for is the test not being configured to post anything —
     * which looks identical from outside and is worth being able to tell apart
     * without reading the record.
     */
    if (posted.markerCount === 0 && !posted.takerAsked) {
      console.info(
        `Test "${form.title}" submitted by ${taker.name}: no result email is configured.`
      );
    }
  }

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
