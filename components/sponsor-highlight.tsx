import type { CSSProperties } from "react";

import { styleSlotProps } from "@/lib/display-templates";
import type { HighlightField, SponsorHighlightSettings } from "@/lib/page-layout";
import type { FeaturedSponsorView } from "@/lib/page-source-types";

import { sponsorFieldNode } from "./featured-sponsor";

/**
 * One sponsor down one column.
 *
 * The same fields a featured sponsor sets beside its logo, with the logo among
 * them rather than in a column of its own — which is the whole difference
 * between the two blocks. Down one column the logo is one more thing in the
 * order, and an author may well want it under the name rather than over it.
 *
 * A server component: the sponsor is already chosen and there is nothing here
 * to interact with.
 */
export function SponsorHighlight({
  settings,
  sponsor,
  container,
  designTime = false,
}: {
  settings: SponsorHighlightSettings;
  sponsor: FeaturedSponsorView | undefined;
  /** The box around the lot, resolved by the caller. */
  container: { className: string; style: CSSProperties | undefined };
  designTime?: boolean;
}) {
  if (!sponsor) {
    return designTime ? (
      <div className="sponsor-highlight is-empty">
        <span>
          {settings.source === "one"
            ? "No sponsor chosen yet."
            : "No sponsor at these recognition levels yet."}
        </span>
      </div>
    ) : null;
  }

  const rows = settings.fields
    .map((field) => ({ field, node: nodeFor(field, sponsor, settings) }))
    .filter((row) => row.node !== null);

  return (
    <div
      className={`sponsor-highlight ${container.className}`.trim()}
      // How tall the logo is drawn, where the list holds one. Spread after the
      // container's own style so a stylesheet cannot take the setting away.
      style={
        {
          ...container.style,
          "--highlight-logo-height": `${settings.logoHeight}rem`,
        } as CSSProperties
      }
    >
      {rows.map((row) => {
        // Each field's own look. A field nobody has styled resolves to nothing
        // and wears whatever the block sits in.
        const own = styleSlotProps(settings.fieldStyles[row.field]);
        return (
          <div
            key={row.field}
            className={`sponsor-highlight-field ${own.className}`.trim()}
            style={own.style}
            data-field={row.field}
          >
            {row.node}
          </div>
        );
      })}
    </div>
  );
}

/** The logo is this block's own; every other field is the shared renderer. */
function nodeFor(
  field: HighlightField,
  sponsor: FeaturedSponsorView,
  settings: SponsorHighlightSettings
) {
  if (field !== "logo") {
    return sponsorFieldNode(field, sponsor, settings.websiteText);
  }

  // Nothing at all rather than a gap: a sponsor with no artwork has their name
  // in the list already, and a placeholder where a mark should be reads as
  // something that failed to load.
  if (!sponsor.logoSrc) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="sponsor-highlight-logo" src={sponsor.logoSrc} alt={sponsor.name} />
  );
}
