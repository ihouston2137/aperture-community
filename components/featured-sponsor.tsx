import type { CSSProperties, ReactNode } from "react";

import { sanitizeLinkUrl } from "@/lib/calendar";
import { styleSlotProps } from "@/lib/display-templates";
import type { FeaturedSponsorSettings, SponsorField } from "@/lib/page-layout";
import type { FeaturedSponsorView } from "@/lib/page-source-types";

/**
 * One sponsor across the page: the logo, and what is worth saying about them.
 *
 * Two columns, because a logo and a paragraph want different things — a mark
 * wants room around it and centring in both directions, and words want a left
 * edge to run from. Stacked on a phone, where two columns of anything are one
 * narrow column of two things.
 *
 * A server component: the sponsor is already chosen and there is nothing here
 * to interact with.
 */
export function FeaturedSponsor({
  settings,
  sponsor,
  logoColumn,
  detailColumn,
  designTime = false,
}: {
  settings: FeaturedSponsorSettings;
  sponsor: FeaturedSponsorView | undefined;
  /** The style each column wears, resolved by the caller. */
  logoColumn: { className: string; style: CSSProperties | undefined };
  detailColumn: { className: string; style: CSSProperties | undefined };
  designTime?: boolean;
}) {
  if (!sponsor) {
    return designTime ? (
      <div className="featured-sponsor is-empty">
        <span>
          {settings.source === "one"
            ? "No sponsor chosen yet."
            : "No sponsor at these recognition levels yet."}
        </span>
      </div>
    ) : null;
  }

  const rows = settings.fields
    .map((field) => ({ field, node: fieldNode(field, sponsor, settings) }))
    .filter((row) => row.node !== null);

  return (
    <div
      className="featured-sponsor"
      data-logo-side={settings.logoSide}
      // The share the logo takes and the space between the columns, written as
      // custom properties so the column rules can use them and the stacked
      // layout can ignore the first.
      style={
        {
          "--featured-logo-width": `${settings.logoWidth}%`,
          "--featured-column-gap": `${settings.columnGap}rem`,
        } as CSSProperties
      }
    >
      <div
        className={`featured-sponsor-logo ${logoColumn.className}`.trim()}
        style={logoColumn.style}
      >
        {sponsor.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sponsor.logoSrc} alt={sponsor.name} />
        ) : (
          // Their name, set large, rather than a gap where a mark would be.
          <span className="featured-sponsor-wordmark">{sponsor.name}</span>
        )}
      </div>

      <div
        className={`featured-sponsor-detail ${detailColumn.className}`.trim()}
        style={detailColumn.style}
      >
        {rows.map((row) => {
          // Each field's own look, laid over the column's. A field nobody has
          // styled resolves to nothing and simply wears the column.
          const own = styleSlotProps(settings.fieldStyles[row.field]);
          return (
            <div
              key={row.field}
              className={`featured-sponsor-field ${own.className}`.trim()}
              style={own.style}
              data-field={row.field}
            >
              {row.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One field, drawn as the kind of thing it is.
 *
 * An address is lines, a website is a link, a name is a heading — printing
 * every one as a paragraph of text would be less work and would read as a
 * database record rather than as an introduction.
 *
 * Returns `null` for a field the sponsor has nothing in, so an empty phone
 * number does not leave a blank row somebody has to explain.
 */
function fieldNode(
  field: SponsorField,
  sponsor: FeaturedSponsorView,
  settings: FeaturedSponsorSettings
): ReactNode {
  switch (field) {
    case "name":
      return sponsor.name ? (
        <span className="featured-sponsor-name">{sponsor.name}</span>
      ) : null;

    case "description":
      return sponsor.description ? <p>{sponsor.description}</p> : null;

    case "recognitionLevel":
      return sponsor.recognitionLevel ? (
        <span className="featured-sponsor-level">{sponsor.recognitionLevel}</span>
      ) : null;

    case "industry":
      return sponsor.industry ? <span>{sponsor.industry}</span> : null;

    case "website": {
      const href = sanitizeLinkUrl(sponsor.website);
      if (!href) return null;

      /*
       * Whatever the block was told to say, else the address itself without
       * its scheme — nobody reads "https://" and it takes up the width of a
       * word that would have meant something.
       */
      const text =
        settings.websiteText.trim() ||
        sponsor.website.replace(/^https?:\/\//i, "").replace(/\/$/, "");

      return (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {text}
        </a>
      );
    }

    case "email":
      return sponsor.email ? (
        <a href={`mailto:${sponsor.email}`}>{sponsor.email}</a>
      ) : null;

    case "phone":
      return sponsor.phone ? <span>{sponsor.phone}</span> : null;

    case "address":
      // Kept as written, line breaks and all — an address is a shape as much
      // as it is a string, and running it together loses the shape.
      return sponsor.address ? (
        <span className="featured-sponsor-address">{sponsor.address}</span>
      ) : null;

    case "links": {
      const links = sponsor.links
        .map((link) => ({ label: link.label, href: sanitizeLinkUrl(link.url) }))
        .filter((link) => link.href);
      if (links.length === 0) return null;

      return (
        <span className="featured-sponsor-links">
          {links.map((link) => (
            <a key={link.href} href={link.href} target="_blank" rel="noreferrer noopener">
              {link.label || link.href}
            </a>
          ))}
        </span>
      );
    }

    default:
      return null;
  }
}
