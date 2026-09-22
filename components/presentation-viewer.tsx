"use client";
import type { Deck } from "@/lib/presentation";
import type { PublicationSources } from "./publication-blocks";
import { PresentationPlayer } from "@/app/admin/presentations/presentation-player";
import { PresentationSources, PresentationShapes, type PresentationShape } from "@/app/admin/presentations/slide-surface";
import "@/app/admin/presentations/presentations.css";
export function PresentationViewer({ deck, sources, shapes }: { deck: Deck; sources: PublicationSources; shapes: PresentationShape[] }) {
  return <PresentationSources.Provider value={sources}><PresentationShapes.Provider value={shapes}><PresentationPlayer deck={deck} /></PresentationShapes.Provider></PresentationSources.Provider>;
}
