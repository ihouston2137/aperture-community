import type { CSSProperties } from "react";

import type { SponsorCollectionSettings } from "@/lib/page-layout";
import type { FeaturedSponsorView } from "@/lib/page-source-types";

import { SponsorHighlight } from "./sponsor-highlight";

/**
 * A wall of sponsors, each card a sponsor highlight.
 *
 * Laid out in CSS columns rather than a grid. A grid gives every row the height
 * of its tallest cell, so one sponsor with a long name would put a band of
 * space under every card beside it; columns let each card be its own height and
 * the next one start where it ends, which is what makes a wall of logos read as
 * a wall rather than as a table.
 *
 * The column count follows from the width one card needs, so it thins to one on
 * a phone without a breakpoint having to guess where that happens.
 *
 * A server component: the sponsors are already chosen and ordered.
 */
export function SponsorCollection({
  settings,
  sponsors,
  container,
  card,
  designTime = false,
}: {
  settings: SponsorCollectionSettings;
  sponsors: FeaturedSponsorView[];
  /** The box around the wall, resolved by the caller. */
  container: { className: string; style: CSSProperties | undefined };
  /** The box around each card. */
  card: { className: string; style: CSSProperties | undefined };
  designTime?: boolean;
}) {
  if (sponsors.length === 0) {
    return designTime ? (
      <div className="sponsor-collection is-empty">
        <span>No sponsors at these recognition levels yet.</span>
      </div>
    ) : null;
  }

  const vars = {
    "--wall-column-width": `${settings.columnWidth}rem`,
    "--wall-max-columns": settings.maxColumns,
    "--wall-gap": `${settings.gap}rem`,
  } as CSSProperties;

  return (
    <div
      className={`sponsor-collection ${container.className}`.trim()}
      // Spread after the container's own style, so a stylesheet cannot take
      // the layout settings away from the block.
      style={{ ...container.style, ...vars }}
    >
      {sponsors.map((sponsor) => (
        <div
          key={sponsor.id}
          className={`sponsor-collection-card ${card.className}`.trim()}
          style={card.style}
        >
          {/* The card is a highlight, given no container of its own — the card
              box above is its container, and two would be one too many. */}
          <SponsorHighlight
            settings={settings.card}
            sponsor={sponsor}
            container={{ className: "", style: undefined }}
          />
        </div>
      ))}
    </div>
  );
}
