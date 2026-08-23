import Link from "next/link";

import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { getSafeMode } from "@/lib/safe-mode";
import {
  getAppearance,
  getSiteContent,
  type AppearanceValues,
  type SiteContentValues,
} from "@/lib/site-settings";
import { isMenuLabel } from "@/lib/site-values";

import { SafeModeToggle } from "./safe-mode-toggle";
import { SiteNav, SiteNavMenu } from "./site-nav";

function SiteHeader({
  content,
  appearance,
}: {
  content: SiteContentValues;
  appearance: AppearanceValues;
}) {
  const logo = protectedMediaUrl(content.logoUrl);

  return (
    <header className={`site-header${appearance.headerSticky ? " is-sticky" : ""}`}>
      <div className="site-header-inner" data-nav-align={appearance.headerNavAlign}>
        <Link href={content.headerBrandHref || "/"} className="site-brand">
          {content.showLogo && logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logo}
              alt={content.headerBrandText || "Logo"}
              style={{ height: `${content.logoHeight || 40}px` }}
            />
          ) : null}
          {content.showBrandText !== false ? (
            <span>{content.headerBrandText}</span>
          ) : null}
        </Link>

        {content.headerTagline ? (
          <span className="site-tagline">{content.headerTagline}</span>
        ) : null}

        <SiteNav>
          {content.menuLinks.map((link, index) =>
            isMenuLabel(link) ? (
              <SiteNavMenu
                key={`${link.label}-${index}`}
                label={link.label}
                showCaret={link.showCaret !== false}
              >
                {(link.children ?? []).map((child, childIndex) => (
                  <Link
                    key={`${child.href}-${childIndex}`}
                    href={child.href || "/"}
                    target={child.newTab ? "_blank" : undefined}
                    rel={child.newTab ? "noreferrer" : undefined}
                  >
                    {child.label}
                  </Link>
                ))}
              </SiteNavMenu>
            ) : (
              <Link
                key={`${link.href}-${index}`}
                href={link.href || "/"}
                target={link.newTab ? "_blank" : undefined}
                rel={link.newTab ? "noreferrer" : undefined}
              >
                {link.label}
              </Link>
            )
          )}
          {content.availabilityEnabled && content.availabilityLabel ? (
            <Link href={content.availabilityHref || "#"} className="site-cta">
              {content.availabilityLabel}
            </Link>
          ) : null}
        </SiteNav>
      </div>
    </header>
  );
}

function SiteFooter({
  content,
  appearance,
  safeMode,
}: {
  content: SiteContentValues;
  appearance: AppearanceValues;
  safeMode: boolean;
}) {
  const footerLogo = content.showFooterLogo ? protectedMediaUrl(content.footerLogoUrl) : "";

  return (
    <footer className="site-footer">
      <div className="site-footer-inner" data-footer-align={appearance.footerAlign}>
        {/* Brand, footer text and social links hold their three columns even
            when empty, so the middle one stays centred on the footer. */}
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
            {/* Classed rather than inline-styled so the Appearance screen's
                text styles can override them. */}
            {content.footerText ? (
              <p className="site-footer-text">{content.footerText}</p>
            ) : null}
          </div>

          <div className="site-footer-cell site-social" data-cell="end">
            {content.socialLinks.map((social, index) => (
              <a
                key={`${social.href}-${index}`}
                href={social.href}
                target="_blank"
                rel="noreferrer"
              >
                {social.label || social.platform}
              </a>
            ))}
          </div>
        </div>

        {content.copyright || NSFW_FEATURES_ENABLED ? (
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
                <SafeModeToggle enabled={safeMode} />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}

export async function SiteChrome({
  children,
  contentStyle,
}: {
  children: React.ReactNode;
  /**
   * The page's own `--content-*` overrides, from `colorOverrideStyle`.
   *
   * Set here rather than only on the layout inside, because the layout is only
   * as tall as its content: a short page would paint its background down to the
   * last line and leave the site colour in the band beneath it. The content area
   * already fills the height between header and footer, so declaring the
   * variables on it colours the whole of what a reader sees as the page.
   */
  contentStyle?: React.CSSProperties;
}) {
  const [content, appearance] = await Promise.all([getSiteContent(), getAppearance()]);
  const safeMode = await getSafeMode(content.safeModeDefault);

  return (
    <div className="site-shell">
      <SiteHeader content={content} appearance={appearance} />
      <main className="site-main" style={contentStyle}>
        {children}
      </main>
      <SiteFooter content={content} appearance={appearance} safeMode={safeMode} />
    </div>
  );
}
