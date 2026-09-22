import { requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { newSlide, normalizeDeck } from "@/lib/presentation";
import { presentationSources } from "@/lib/presentation-sources";
import { PresentationEditor } from "../presentation-editor";

export default async function NewPresentation() {
  await requirePermission("publications.manage");
  await connectDB();
  const deck = normalizeDeck({ title: "Untitled presentation", aspect: "16:9", pageUnit: "px", slides: [newSlide()] });
  const { shapes, fonts } = await presentationSources(deck);
  return <PresentationEditor initial={deck} shapes={shapes} fonts={fonts} />;
}
