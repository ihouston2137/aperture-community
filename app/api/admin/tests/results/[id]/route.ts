import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/access";
import { getSession } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { TestAttempt, FormSubmission } from "@/lib/models";
import { gradeForTaker, normalizeTestSettings, reviewedGrade } from "@/lib/form-test";
import { sendTestResultEmail } from "@/lib/email";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !(await checkPermission(session, "tests.results"))) return Response.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid result" }, { status: 400 });
  await connectDB();
  const attempt = await TestAttempt.findById(id).lean<any>();
  if (!attempt) return Response.json({ error: "Result not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (attempt.gradingStatus !== "pending" || body?.version !== new Date(attempt.updatedAt).toISOString())
    return Response.json({ error: "This result has changed. Reload the page before grading." }, { status: 409 });
  let grade;
  try { grade = reviewedGrade(attempt.grade, body?.awards); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
  const updated = await TestAttempt.findOneAndUpdate({ _id: id, gradingStatus: "pending", updatedAt: attempt.updatedAt },
    { $set: { grade, gradingStatus: "graded", gradedAt: new Date(), gradedBy: session.userId } }, { new: true }).lean<any>();
  if (!updated) return Response.json({ error: "This result has already been graded." }, { status: 409 });
  const summary = await FormSubmission.updateOne({ _id: attempt.sourceSubmissionId, $or: [{ grade: { $exists: false } }, { "grade.percent": { $lte: grade.percent } }] },
    { $set: { grade, data: attempt.data, fields: attempt.fields, sitting: attempt.sitting } });
  const settings = normalizeTestSettings(attempt.resultSettings);
  await sendTestResultEmail({ testTitle: attempt.formTitle, takerName: attempt.userName, grade,
    markers: settings.resultEmails, taker: settings.emailTaker && attempt.userEmail ? { email: attempt.userEmail, grade: gradeForTaker(grade, settings.resultMode) } : null,
    attempts: attempt.attempts, kept: summary.matchedCount > 0 });
  revalidatePath("/dashboard");
  revalidatePath(`/admin/tests/results/${attempt.formId}`);
  revalidatePath("/admin/tests/results");
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
