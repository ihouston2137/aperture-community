"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { Presentation, Zine } from "@/lib/models";
import { normalizeDeck } from "@/lib/presentation";
import { createPresentation, syncPresentationMedia } from "@/lib/presentation-storage";
import { publicationHref } from "@/lib/publication-layout";
import { uniqueSlug } from "@/lib/slug";

export async function savePresentation(input: {
  id?: string; version: number; deck: unknown; view?: string; slug?: string;
  intent?: "draft" | "publish" | "unpublish";
}) {
  await requirePermission("publications.manage");
  await connectDB();
  try {
    if (input.intent && !["draft", "publish", "unpublish"].includes(input.intent)) throw new Error("Invalid save action.");
    const deck = normalizeDeck(input.deck);
    if (!deck.title) throw new Error("Enter a presentation title.");
    if (input.id && !/^[a-f0-9]{24}$/i.test(input.id)) throw new Error("Invalid presentation ID.");
    const id = input.id || await createPresentation(deck);
    const [identity, current] = await Promise.all([
      Zine.findById(id).lean<any>(), Presentation.findById(id).lean<any>(),
    ]);
    if (!identity || identity.deletedAt || !current || current.active === false) throw new Error("This presentation is unavailable or in the bin.");
    if (input.id && current.version !== input.version) throw new Error("This presentation changed in another window. Reload before saving.");
    const slug = input.slug === undefined ? identity.slug : await uniqueSlug(Zine, input.slug, deck.title, id);
    const variants = { ...current.variants };
    const view = input.view || current.defaultView;
    if (view && !Object.hasOwn(variants, view)) throw new Error("Unknown presentation variant.");
    if (view) variants[view] = deck;
    const main = !view || view === current.defaultView ? deck : current.deck;
    const changes = input.intent === "unpublish"
      ? { deck: main, variants, published: null, publishedVariants: {} }
      : { deck: main, variants, ...(input.intent === "publish" ? { published: main, publishedVariants: variants } : {}) };
    const saved = await Presentation.findOneAndUpdate(
      { _id: id, version: current.version, active: { $ne: false } },
      { $set: changes, $inc: { version: 1 } }, { returnDocument: "after" },
    ).lean<any>();
    if (!saved) throw new Error("This presentation changed in another window. Reload before saving.");
    const status = input.intent === "publish" ? "published" : input.intent === "unpublish" ? "draft" : identity.status;
    await Zine.updateOne({ _id: id, deletedAt: null }, { $set: {
      slug,
      title: status === "published" && input.intent !== "publish" ? identity.title : main.title, status,
      ...(input.intent === "publish" ? { publishedAt: new Date() } : input.intent === "unpublish" ? { publishedAt: null } : {}),
    } });
    let message = "Presentation saved.";
    try { await syncPresentationMedia(id); } catch { message = "Saved. Media tracking needs a retry; save again to refresh it."; }
    revalidatePath("/admin/presentations");
    revalidatePath("/admin/publications");
    revalidatePath(publicationHref(identity.kind, identity.slug));
    revalidatePath(publicationHref(identity.kind, slug));
    revalidatePath(`/presentations/${id}`);
    return { id, slug: slug as string, version: saved.version as number, status: status as "draft" | "published", message };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not save. Your edits are still here." };
  }
}
