import { Presentation } from "@/lib/models";
import { normalizeDeck } from "@/lib/presentation";
import { presentationSources } from "@/lib/presentation-sources";
import { PresentationViewer } from "./presentation-viewer";

export async function PresentationScreen({ id, view, preview = false }: { id: string; view?: string; preview?: boolean }) {
  const record = await Presentation.findById(id).lean<any>();
  if (!record || record.active === false) return null;
  const variants = preview ? record.variants : record.publishedVariants;
  const chosen = view || record.defaultView;
  const raw = chosen && Object.hasOwn(variants || {}, chosen) ? variants[chosen] : preview ? record.deck : record.published;
  if (!raw) return null;
  const deck = normalizeDeck(raw);
  const { sources, shapes } = await presentationSources(deck);
  if (!preview) { deck.slides = deck.slides.map(slide => ({ ...slide, notes: "" })); deck.layouts = []; }
  return <PresentationViewer deck={deck} sources={sources} shapes={shapes} />;
}
