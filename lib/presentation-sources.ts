import { CustomShape, FontFamily } from "./models";
import { loadPublicationSources } from "./publication-sources";
import type { Deck } from "./presentation";
import type { PublicationBlock } from "./publication-layout";

export async function presentationSources(deck: Deck) {
  const blocks: PublicationBlock[] = [];
  const visit = (block: PublicationBlock) => {
    blocks.push(block);
    for (const row of block.table?.cells || []) for (const cell of row) visit(cell.block);
  };
  for (const slide of [...deck.slides, ...(deck.layouts || []).map(layout => layout.slide)])
    for (const object of slide.objects) if (object.publication) visit(object.publication);
  const [sources, shapes, fonts] = await Promise.all([
    loadPublicationSources([], blocks),
    CustomShape.find().select("name slug viewBox paths -_id").lean<any[]>(),
    FontFamily.find().select("family -_id").lean<any[]>(),
  ]);
  return { sources, shapes: JSON.parse(JSON.stringify(shapes)), fonts: fonts.map(font => font.family) as string[] };
}
