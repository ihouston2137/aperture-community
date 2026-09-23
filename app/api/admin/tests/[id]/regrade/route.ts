import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { checkPermission } from "@/lib/access";
import { getSession } from "@/lib/session";
import { connectDB } from "@/lib/db";
import { FormDefinition, FormSubmission, TestAttempt } from "@/lib/models";
import { normalizeTestSettings } from "@/lib/form-test";
import { testResults } from "@/lib/test-results";
import { regradeSubmission } from "@/lib/test-regrading";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !(await checkPermission(session, "tests.results"))) return Response.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  if (!/^[a-f\d]{24}$/i.test(id)) return Response.json({ error: "Invalid test" }, { status: 400 });
  await connectDB();
  const definition = await FormDefinition.findById(id).lean<any>();
  if (definition?.kind !== "test") return Response.json({ error: "Test not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!["preview", "apply"].includes(body?.action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  const records = (await testResults({ formId: id })).sort((a, b) => String(a._id).localeCompare(String(b._id)));
  const test = normalizeTestSettings(definition.test);
  const token = createHash("sha256").update(JSON.stringify([definition.updatedAt, test, records.map(row => [String(row._id), row.updatedAt, row.grade, row.gradingStatus])])).digest("hex");
  const changes = records.map(row => ({ row, ...regradeSubmission(test, row) }));
  if (body.action === "preview") return Response.json({ token, changes: changes.map(({ row, grade, recalculated, preserved, skipped }) => ({
    id: String(row._id), name: row.userName || "Not recorded", attempt: row.attempts ?? 1, status: row.gradingStatus,
    before: row.grade.percent, after: grade.percent, recalculated, preserved, skipped,
    changed: JSON.stringify(row.grade) !== JSON.stringify(grade),
  })) });
  if (body.token !== token) return Response.json({ error: "The answer key or submissions changed. Preview again before applying." }, { status: 409 });
  let updated = 0, conflicts = 0;
  const summaries = new Set<string>();
  for (const { row, grade } of changes) {
    if (JSON.stringify(row.grade) === JSON.stringify(grade)) continue;
    const model = row.legacy ? FormSubmission : TestAttempt;
    // Never set gradingStatus, gradedAt, or gradedBy: pending remains pending.
    const result = await model.updateOne({ _id: row._id, updatedAt: row.updatedAt }, { $set: { grade } });
    if (!result.matchedCount) { conflicts++; continue; }
    updated++;
    if (!row.legacy && row.sourceSubmissionId) summaries.add(row.sourceSubmissionId);
  }
  for (const sourceId of summaries) {
    const summary = await FormSubmission.findById(sourceId).lean<any>();
    if (!summary) continue;
    const best = await TestAttempt.findOne({ sourceSubmissionId: sourceId, gradingStatus: "graded" }).sort({ "grade.percent": -1, createdAt: -1 }).lean<any>();
    await FormSubmission.updateOne({ _id: sourceId, updatedAt: summary.updatedAt }, best
      ? { $set: { grade: best.grade, fields: best.fields, data: best.data, sitting: best.sitting } }
      : { $unset: { grade: 1 } });
  }
  revalidatePath("/dashboard"); revalidatePath("/admin/tests/results"); revalidatePath(`/admin/tests/results/${id}`);
  return Response.json({ updated, conflicts });
}
