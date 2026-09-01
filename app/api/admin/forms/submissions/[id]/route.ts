import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormDefinition, FormSubmission } from "@/lib/models";
import { getSession } from "@/lib/session";

const STATUSES = ["new", "read", "archived"];

/**
 * Which permission this record answers to.
 *
 * A test result and a form submission live in one collection and are read on
 * two different grants, so the check has to follow the record rather than the
 * route: somebody trusted with a contact form has no business deleting a
 * mark, and somebody trusted with marks may not hold `forms.submissions` at
 * all. A record whose form has since been deleted is treated as a form's,
 * which is the older and narrower of the two.
 */
async function mayTouch(session: unknown, submissionId: string): Promise<boolean> {
  const submission = await FormSubmission.findById(submissionId)
    .select("formId")
    .lean<any>();
  if (!submission) return false;

  const form = await FormDefinition.findById(submission.formId)
    .select("kind")
    .lean<any>();

  return checkPermission(
    session as never,
    form?.kind === "test" ? "tests.results" : "forms.submissions"
  );
}

/**
 * Set a submission's status.
 *
 * The inbox counts what is unread, and a count that can only go up is not a
 * count of anything — opening an entry marks it read, which is what makes the
 * number on the dashboard mean "still to look at".
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const { id: patchId } = await params;
  await connectDB();

  if (!(await mayTouch(session, patchId))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const status = String((body as any)?.status ?? "");
  if (!STATUSES.includes(status)) {
    return Response.json({ error: "Unknown status" }, { status: 400 });
  }

  const updated = await FormSubmission.findByIdAndUpdate(patchId, { status });
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true, status });
}

/**
 * Delete one record.
 *
 * For a test, this is also how somebody is let back in: the attempt count
 * lives on the record, so removing it returns them to nought attempts. That is
 * the point rather than a side effect — a candidate who was cut off mid-test,
 * or sat the wrong paper, needs their result taken away and another go.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const { id } = await params;
  await connectDB();

  if (!(await mayTouch(session, id))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await FormSubmission.findByIdAndDelete(id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}
