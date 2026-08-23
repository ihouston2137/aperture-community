import type { NextRequest } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { FormSubmission } from "@/lib/models";
import { getSession } from "@/lib/session";

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
