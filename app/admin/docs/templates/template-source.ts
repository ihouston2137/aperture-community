import { loadBuilderSources } from "@/lib/builder-sources";
import { connectDB } from "@/lib/db";
import { docTree, listDocSets, listDocs, toDocView } from "@/lib/docs";
import { DocPage } from "@/lib/models";

/** What a doc-template canvas needs: builder pickers plus a document to show. */
export async function loadDocTemplateSource() {
  await connectDB();

  // The canvas previews a real document, so it needs one from whichever set has
  // any — a template is shared across sets, so the first is as good as another.
  const [sources, sets] = await Promise.all([loadBuilderSources(), listDocSets()]);

  const docs: { _id: string; title: string; setId: string }[] = [];
  for (const set of sets) {
    for (const entry of await listDocs(set._id)) {
      docs.push({ _id: entry._id, title: `${set.title} · ${entry.title}`, setId: set._id });
    }
  }

  const first = docs[0];
  const firstSet = first ? sets.find((set) => set._id === first.setId) : undefined;
  const firstDoc = first ? await DocPage.findById(first._id).lean<any>() : null;

  return {
    sources,
    docs: docs.map((entry) => ({ _id: entry._id, title: entry.title })),
    tree: firstSet ? await docTree(firstSet._id, false) : [],
    initialDoc: firstDoc && firstSet ? await toDocView(firstDoc, firstSet) : null,
  };
}
