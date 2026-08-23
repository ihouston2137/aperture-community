import { connectDB } from "@/lib/db";
import { listDocs, type DocSummary } from "@/lib/docs";

/**
 * The parents a page may sit under, within its own set.
 *
 * A page cannot parent itself, and neither can its descendants — that would
 * knot the tree into a cycle no walk would terminate on.
 */
export async function loadDocEditorSource(documentationId: string, excludeId?: string) {
  await connectDB();
  const summaries = await listDocs(documentationId);

  const banned = new Set<string>();
  if (excludeId) {
    banned.add(excludeId);
    let grew = true;
    while (grew) {
      grew = false;
      for (const entry of summaries) {
        if (!banned.has(entry._id) && banned.has(entry.parentId)) {
          banned.add(entry._id);
          grew = true;
        }
      }
    }
  }

  const parents: DocSummary[] = summaries.filter((entry) => !banned.has(entry._id));
  return { parents };
}
