import type { CSSProperties } from "react";

import type { SponsorScrollSettings } from "@/lib/page-layout";

export type SponsorLogo = { id: string; name: string; src: string };

/**
 * A slow horizontal run of sponsor logos.
 *
 * The height is the whole of the geometry: it is the band the logos travel
 * through and, minus the padding, the size each one is drawn at. Width is left
 * to the artwork — a logo is as wide as it needs to be at that height, which
 * is the only way a row of a tall crest and a long wordmark reads evenly.
 *
 * The run is printed twice and the animation moves it exactly half its own
 * width, so the second copy is where the first was when the loop restarts and
 * the seam falls on a frame nobody can pick out. Duplicating is what makes it
 * continuous: an animation that ran the list once and jumped back would show
 * the jump, and one that measured and repositioned in JavaScript would do the
 * same work every frame for the same result.
 *
 * A server component. There is nothing here to interact with — the movement is
 * CSS and the logos are already resolved — so none of it needs to reach the
 * browser as script.
 */
export function SponsorScroll({
  settings,
  logos,
  className,
  style,
  /** True on the builder canvas, where a still block is easier to place. */
  designTime = false,
  height,
}: {
  settings: SponsorScrollSettings;
  logos: SponsorLogo[];
  className?: string;
  style?: CSSProperties;
  designTime?: boolean;
  /**
   * The band's height as a CSS length, where something else decides it.
   *
   * A publication block is a box somebody drew on a canvas, and its own height
   * is the band — asking for a second height in rem would be two settings that
   * could disagree. Passed as a length rather than left to a percentage, so
   * the sizing stays free of the percentage chains Safari mishandles.
   */
  height?: string;
}) {
  const band = height ?? `${settings.height}rem`;

  if (logos.length === 0) {
    return designTime ? (
      <div
        className={`sponsor-scroll is-empty ${className ?? ""}`.trim()}
        style={{ ...style, height: band }}
      >
        <span>No sponsor logos match these recognition levels yet.</span>
      </div>
    ) : null;
  }

  /*
   * One lap is one logo's travel times the number of logos, so adding a
   * sponsor lengthens the run rather than speeding everything up to keep the
   * lap the same. Linear, because a conveyor that eased in and out would read
   * as broken rather than as gentle.
   */
  const seconds = Math.max(1, settings.secondsPerLogo * logos.length);

  const vars = {
    "--sponsor-scroll-height": band,
    "--sponsor-scroll-seconds": `${seconds}s`,
  } as CSSProperties;

  return (
    <div
      className={`sponsor-scroll ${className ?? ""}`.trim()}
      style={{ ...style, ...vars }}
      data-direction={settings.direction}
      data-paused={designTime ? "true" : undefined}
      data-pause-on-hover={settings.pauseOnHover ? "true" : undefined}
    >
      <div className="sponsor-scroll-track">
        {/* Twice, so the loop has somewhere to land. The copy is hidden from
            assistive technology: it is the same list said again, and a screen
            reader should hear each sponsor once. */}
        {[0, 1].map((copy) => (
          <ul
            key={copy}
            className="sponsor-scroll-run"
            aria-hidden={copy === 1 ? "true" : undefined}
          >
            {logos.map((logo) => (
              <li key={`${copy}-${logo.id}`} className="sponsor-scroll-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.src} alt={copy === 0 ? logo.name : ""} loading="lazy" />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
