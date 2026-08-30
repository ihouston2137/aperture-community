import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormSubmission } from "@/lib/models";
import { getSession } from "@/lib/session";

const STATUSES = ["new", "read", "archived"];

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
  if (!(await checkPermission(session, "forms.submissions"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const status = String((body as any)?.status ?? "");
  if (!STATUSES.includes(status)) {
    return Response.json({ error: "Unknown status" }, { status: 400 });
  }

  const { id } = await params;
  await connectDB();

  const updated = await FormSubmission.findByIdAndUpdate(id, { status });
  if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true, status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!(await checkPermission(session, "forms.submissions"))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const deleted = await FormSubmission.findByIdAndDelete(id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ ok: true });
}
