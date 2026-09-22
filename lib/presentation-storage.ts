import { Types } from "mongoose";
import { connectDB } from "./db";
import { Presentation, Zine } from "./models";
import { normalizeDeck, type Deck } from "./presentation";
import { slugify, uniqueSlug } from "./slug";
import { syncMediaUsage } from "./media-usage-sync";

export async function createPresentation(deck: Deck, id = String(new Types.ObjectId())) {
  await connectDB();
  const normalized = normalizeDeck(deck);
  const slug = await uniqueSlug(Zine, slugify(deck.title), deck.title);
  // Identity first: an orphan slide document can never become publicly accessible.
  await Zine.create({ _id: id, title: deck.title, slug, kind: "presentation", status: "draft" });
  try {
    await Presentation.create({ _id: id, deck: normalized, version: 1 });
  } catch (error) {
    await Zine.deleteOne({ _id: id });
    throw error;
  }
  return id;
}

export async function syncPresentationMedia(id: string) {
  const [identity, presentation] = await Promise.all([
    Zine.findById(id).lean<any>(), Presentation.findById(id).lean<any>(),
  ]);
  if (identity) await syncMediaUsage(id, identity.title, [
    { kind: "publication", source: [identity, presentation] },
  ]);
}
