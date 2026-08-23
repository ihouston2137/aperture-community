import type { NextRequest } from "next/server";

import { getUserPermissions } from "@/lib/access";
import { getCollectionById, resolveCollection } from "@/lib/collections";
import { connectDB } from "@/lib/db";
import { Collection } from "@/lib/models";
import { getSession } from "@/lib/session";

/**
 * One resolved collection, for a builder canvas.
 *
 * A container can be bound to a collection, and its slots render from the same
 * shape the public page uses — images sorted, feature image resolved, display
 * settings merged — so the canvas cannot drift from the result.
 *
 * `latest` stands in for the most recently made public collection, matching
 * what a container bound to "the latest collection" resolves to when served.
 */
const ALLOWED = ["pages.manage", "storyTemplates.manage", "collections.manage"];

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

  const collection =
    id === "latest"
      ? await resolveCollection(
          await Collection.findOne({ isPublic: true }).sort({ createdAt: -1 }).lean<any>()
        )
      : // Guarded because an id from a stale layout would otherwise cast-error.
        await getCollectionById(id);

  if (!collection) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ collection });
}
