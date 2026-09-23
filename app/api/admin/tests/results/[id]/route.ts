import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/access";
import { getSession } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { TestAttempt, FormSubmission } from "@/lib/models";
import { gradeForTaker, normalizeTestSettings, reviewedGrade } from "@/lib/form-test";
import { sendTestResultEmail } from "@/lib/email";

async function refreshBestResult(sourceId: string) {
  const summary = await FormSubmission.findById(sourceId).lean<any>();
  if (!summary) return "";
  const best = await TestAttempt.findOne({ sourceSubmissionId: sourceId, gradingStatus: "graded" }).sort({ "grade.percent": -1, createdAt: -1 }).lean<any>();
  await FormSubmission.updateOne({ _id: sourceId, updatedAt: summary.updatedAt }, best
    ? { $set: { grade: best.grade, data: best.data, fields: best.fields, sitting: best.sitting } }
    : { $unset: { grade: 1 } });
  return best ? String(best._id) : "";
}

function refreshPages(formId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/admin/tests/results/${formId}`);
  revalidatePath("/admin/tests/results");
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !(await checkPermission(session, "tests.results"))) return Response.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid result" }, { status: 400 });
  await connectDB();
  let attempt = await TestAttempt.findById(id).lean<any>();
  const legacy = !attempt;
  if (!attempt) attempt = await FormSubmission.findOne({ _id: id, grade: { $exists: true } }).lean<any>();
  if (!attempt) return Response.json({ error: "Result not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (body?.version !== new Date(attempt.updatedAt).toISOString())
    return Response.json({ error: "This result has changed. Reload the page before grading." }, { status: 409 });
  if (body.action === "reopen") {
    if (!attempt.grade?.questions?.length) return Response.json({ error: "This result has no saved question details to grade." }, { status: 400 });
    if (!legacy && attempt.gradingStatus !== "graded") return Response.json({ error: "This result is already awaiting review." }, { status: 409 });
    let reopened;
    if (legacy) {
      try {
        reopened = (await TestAttempt.create({ ...attempt, sourceSubmissionId: id, gradingStatus: "pending", updatedAt: new Date() })).toObject();
      } catch (error) {
        if ((error as { code?: number }).code === 11000) return Response.json({ error: "This result has already been reopened. Reload the page." }, { status: 409 });
        throw error;
      }
    } else reopened = await TestAttempt.findOneAndUpdate({ _id: id, gradingStatus: "graded", updatedAt: attempt.updatedAt }, { $set: { gradingStatus: "pending" } }, { new: true }).lean<any>();
    if (!reopened) return Response.json({ error: "This result has changed. Reload the page." }, { status: 409 });
    await refreshBestResult(reopened.sourceSubmissionId);
    refreshPages(attempt.formId);
    return Response.json({ grade: reopened.grade, gradingStatus: "pending", legacy: false, version: new Date(reopened.updatedAt).toISOString() });
  }
  if (legacy || attempt.gradingStatus !== "pending") return Response.json({ error: "Reopen the result before changing its grade." }, { status: 409 });
  const passMark = body.passMark === undefined ? attempt.grade.passMark : body.passMark;
  if (typeof passMark !== "number" || !Number.isFinite(passMark) || passMark < 0 || passMark > 100)
    return Response.json({ error: "Pass mark must be between 0 and 100." }, { status: 400 });
  let grade;
  try { grade = reviewedGrade({ ...attempt.grade, passMark }, body?.awards); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const updated = await TestAttempt.findOneAndUpdate({ _id: id, gradingStatus: "pending", updatedAt: attempt.updatedAt },
    { $set: { grade, gradingStatus: "graded", gradedAt: new Date(), gradedBy: session.userId } }, { new: true }).lean<any>();
  if (!updated) return Response.json({ error: "This result has already been graded." }, { status: 409 });
  const bestId = await refreshBestResult(attempt.sourceSubmissionId);
  const settings = normalizeTestSettings(attempt.resultSettings);
  await sendTestResultEmail({ testTitle: attempt.formTitle, takerName: attempt.userName, grade,
    markers: settings.resultEmails, taker: settings.emailTaker && attempt.userEmail ? { email: attempt.userEmail, grade: gradeForTaker(grade, settings.resultMode) } : null,
    attempts: attempt.attempts, kept: bestId === id });
  refreshPages(attempt.formId);
  return Response.json({ grade, gradingStatus: "graded", version: new Date(updated.updatedAt).toISOString() });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !(await checkPermission(session, "tests.results"))) return Response.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid result" }, { status: 400 });
  await connectDB();
  const deleted = await TestAttempt.findByIdAndDelete(id).lean<any>();
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  const remaining = await TestAttempt.find({ sourceSubmissionId: deleted.sourceSubmissionId }).sort({ "grade.percent": -1 }).lean<any[]>();
  const best = remaining.find(row => row.gradingStatus === "graded");
  if (!remaining.length) await FormSubmission.deleteOne({ _id: deleted.sourceSubmissionId });
  else await FormSubmission.updateOne({ _id: deleted.sourceSubmissionId }, {
    $set: { attempts: remaining.length, ...(best ? { grade: best.grade, fields: best.fields, data: best.data, sitting: best.sitting } : {}) },
    ...(!best ? { $unset: { grade: 1 } } : {}),
  });
  revalidatePath("/dashboard");
  revalidatePath("/admin/tests/results");
  return Response.json({ ok: true });
}
