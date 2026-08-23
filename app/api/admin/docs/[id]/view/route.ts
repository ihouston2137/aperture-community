import { NextResponse } from "next/server";

import { checkPermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getDocSetById, toDocView } from "@/lib/docs";
import { DocPage } from "@/lib/models";
import { getSession } from "@/lib/session";

/** The rendered view of one document, for the template builder's preview. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!(await checkPermission(session, "docs.manage"))) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const { id } = await params;
  await connectDB();

  const doc = await DocPage.findById(id).lean<any>();
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const set = await getDocSetById(String(doc.documentationId ?? ""));
  if (!set) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json({ view: await toDocView(doc, set) });
}
