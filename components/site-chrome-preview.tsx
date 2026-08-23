"use client";

import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import {
  appearanceCssDeclarations,
  isMenuLabel,
  siteTextStyleCss,
  type AppearanceValues,
  type SiteContentValues,
} from "@/lib/site-values";

import { SiteNav, SiteNavMenu } from "./site-nav";

/**
 * Non-interactive previews of the public header and footer.
 *
 * Used by the Appearance screen and by the page builder canvas so an editor can
 * see a page in its real chrome. The markup, class names and generated CSS are
 * the same ones `components/site-chrome.tsx` and the live stylesheet use, so
 * there is no second implementation to keep in step.
 */

/** Scopes the appearance variables and text styles to a container. */
export function ChromeStyle({
  appearance,
  scope,
}: {
  appearance: AppearanceValues;
  /** A CSS selector, e.g. `.builder-canvas`. */
  scope: string;
}) {
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: [
          `${scope} {\n${appearanceCssDeclarations(appearance)}\n}`,
          siteTextStyleCss(appearance.textStyles, `${scope} `),
        ]
          .filter(Boolean)
          .join("\n\n"),
      }}
    />
  );
}

export function PreviewHeader({
  appearance,
  content,
}: {
  appearance: AppearanceValues;
  content: SiteContentValues;
}) {
  const logo = protectedMediaUrl(content.logoUrl);

  return (
    <header className="site-header">
      <div className="site-header-inner" data-nav-align={appearance.headerNavAlign}>
        {/* Anchors, matching the real chrome, so selectors like `.site-nav a`
            apply here too. Clicks are disabled in CSS. */}
        <a className="site-brand">
          {content.showLogo && logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" style={{ height: `${content.logoHeight || 40}px` }} />
          ) : null}
          {content.showBrandText !== false ? (
            <span>{content.headerBrandText || "Brand"}</span>
          ) : null}
        </a>

        {content.headerTagline ? (
          <span className="site-tagline">{content.headerTagline}</span>
        ) : null}

        <SiteNav>
          {(content.menuLinks.length > 0
            ? content.menuLinks
            : [
                { label: "Work", href: "#" },
                { label: "Stories", href: "#" },
                { label: "About", href: "#" },
              ]
          ).map((link, index) =>
            isMenuLabel(link) ? (
              // The same shell as the live header, so opening it here shows the
              // real panel and child-link styles.
              <SiteNavMenu
                key={`${link.label}-${index}`}
                label={link.label}
                showCaret={link.showCaret !== false}
              >
                {(link.children ?? []).map((child, childIndex) => (
                  <a key={`${child.label}-${childIndex}`}>{child.label}</a>
                ))}
              </SiteNavMenu>
            ) : (
              <a key={`${link.label}-${index}`}>{link.label}</a>
            )
          )}

          {content.availabilityEnabled && content.availabilityLabel ? (
            <a className="site-cta">{content.availabilityLabel}</a>
          ) : null}
        </SiteNav>
      </div>
    </header>
  );
}

export function PreviewFooter({
  appearance,
  content,
}: {
  appearance: AppearanceValues;
  content: SiteContentValues;
}) {
  const footerLogo = content.showFooterLogo ? protectedMediaUrl(content.footerLogoUrl) : "";

  return (
    <footer className="site-footer">
      <div className="site-footer-inner" data-footer-align={appearance.footerAlign}>
        <div className="site-footer-row site-footer-main">
          <div className="site-footer-cell" data-cell="start">
            {footerLogo || content.footerBrandText ? (
              <div className="site-footer-brand">
                {footerLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={footerLogo}
                    alt={content.footerBrandText || "Logo"}
                    style={{ height: `${content.footerLogoHeight || 32}px` }}
                  />
                ) : null}
                {content.footerBrandText ? <strong>{content.footerBrandText}</strong> : null}
              </div>
            ) : null}
          </div>

          <div className="site-footer-cell" data-cell="center">
            {content.footerText ? (
              <p className="site-footer-text">{content.footerText}</p>
            ) : (
              // Stands in for an empty footer so the row is not a blank band.
              <span style={{ opacity: 0.7 }}>Footer text</span>
            )}
          </div>

          <div className="site-footer-cell site-social" data-cell="end">
            {(content.socialLinks.length > 0
              ? content.socialLinks
              : [{ platform: "social", label: "Social", href: "#" }]
            ).map((social, index) => (
              <a key={`${social.label}-${index}`}>{social.label || social.platform}</a>
            ))}
          </div>
        </div>

        <div
          className="site-footer-row site-footer-legal"
          data-columns={NSFW_FEATURES_ENABLED ? "2" : "1"}
        >
          <div className="site-footer-cell" data-cell="start">
            {content.copyright ? (
              <p className="site-footer-copyright">{content.copyright}</p>
            ) : null}
          </div>
          {NSFW_FEATURES_ENABLED ? (
            <div className="site-footer-cell" data-cell="end">
              <label className="safe-mode-toggle">
                <input type="checkbox" readOnly checked={content.safeModeDefault} /> Safe mode
              </label>
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
