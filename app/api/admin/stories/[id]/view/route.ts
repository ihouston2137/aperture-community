import type { NextRequest } from "next/server";

import { getUserPermissions } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Story } from "@/lib/models";
import { getSession } from "@/lib/session";
import { toStoryView } from "@/lib/stories";

/**
 * The rendered view of one story, for a builder canvas.
 *
 * The template builder previews a template against a real story, and the page
 * builder previews story-bound containers the same way. This is the shape the
 * public page renders from — media metadata resolved, story images already
 * woven into the content — so neither canvas can drift from the result.
 *
 * `latest` stands in for the most recently published story, matching what a
 * container bound to "the latest story" resolves to when the page is served.
 */
const ALLOWED = ["storyTemplates.manage", "pages.manage"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const permissions = session ? await getUserPermissions(session.userId) : [];
  if (!ALLOWED.some((permission) => permissions.includes(permission))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  await connectDB();

  const story =
    id === "latest"
      ? await Story.findOne({ status: "published" }).sort({ publishDate: -1 }).lean<any>()
      : // Guarded because an id from a stale layout would otherwise cast-error.
        /^[a-f0-9]{24}$/i.test(id)
        ? await Story.findById(id).lean<any>()
        : null;

  if (!story) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ view: await toStoryView(story) });
}
