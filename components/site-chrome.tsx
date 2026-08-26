import Link from "next/link";

import { getAccountHeaderData } from "@/lib/account-header";
import { ensureSiteMenu, getMenuViewer, loadMenuFor, type MenuItem } from "@/lib/menus";
import { NSFW_FEATURES_ENABLED } from "@/lib/nsfw";
import { protectedMediaUrl } from "@/lib/protected-media-url";
import { getSafeMode } from "@/lib/safe-mode";
import {
  getAppearance,
  getSiteContent,
  type AppearanceValues,
  type SiteContentValues,
} from "@/lib/site-settings";


import { AccountMenu, SignInLink, type AccountUser } from "./account-menu";
import type { RegistrationOptions } from "./auth-dialog";
import { SafeModeToggle } from "./safe-mode-toggle";
import { SiteNav, SiteNavMenu } from "./site-nav";

function SiteHeader({
  content,
  appearance,
  account,
  menu,
}: {
  content: SiteContentValues;
  appearance: AppearanceValues;
  account: { user: AccountUser | null; registration: RegistrationOptions };
  /** Already resolved and filtered to what this viewer may see. */
  menu: MenuItem[];
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
          {menu.map((item) =>
            item.kind === "label" ? (
              <SiteNavMenu
                key={item.id}
                label={item.label}
                showCaret={item.showCaret}
              >
                {item.children.map((child) => (
                  <Link
                    key={child.id}
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
                key={item.id}
                href={item.href || "/"}
                target={item.newTab ? "_blank" : undefined}
                rel={item.newTab ? "noreferrer" : undefined}
              >
                {item.label}
              </Link>
            )
          )}
          {content.availabilityEnabled && content.availabilityLabel ? (
            <Link href={content.availabilityHref || "#"} className="site-cta">
              {content.availabilityLabel}
            </Link>
          ) : null}
        </SiteNav>

        {/* After the nav, so it holds the corner — and outside it, so it stays
            there when the links collapse behind the hamburger. */}
        <AccountMenu
          user={account.user}
          registration={account.registration}
          showSignIn={
            content.signInEnabled && content.signInPlacement !== "footer"
          }
          signInLabel={content.signInLabel || "Sign in"}
        />
      </div>
    </header>
  );
}

function SiteFooter({
  content,
  appearance,
  safeMode,
  account,
}: {
  content: SiteContentValues;
  appearance: AppearanceValues;
  safeMode: boolean;
  account: { user: AccountUser | null; registration: RegistrationOptions };
}) {
  const footerLogo = content.showFooterLogo ? protectedMediaUrl(content.footerLogoUrl) : "";

  // Only ever offered to somebody signed out: once they are in, the way to
  // their account is the menu in the header, in the one place it always is.
  const showSignIn =
    !account.user &&
    content.signInEnabled &&
    content.signInPlacement !== "header";

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
            {showSignIn ? (
              <SignInLink
                registration={account.registration}
                label={content.signInLabel || "Sign in"}
              />
            ) : null}
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
  const [content, appearance, account, siteMenu, viewer] = await Promise.all([
    getSiteContent(),
    getAppearance(),
    getAccountHeaderData(),
    ensureSiteMenu(),
    getMenuViewer(),
  ]);
  const [safeMode, menu] = await Promise.all([
    getSafeMode(content.safeModeDefault),
    loadMenuFor(siteMenu, viewer),
  ]);

  return (
    <div className="site-shell">
      <SiteHeader
        content={content}
        appearance={appearance}
        account={account}
        menu={menu}
      />
      <main className="site-main" style={contentStyle}>
        {children}
      </main>
      <SiteFooter
        content={content}
        appearance={appearance}
        safeMode={safeMode}
        account={account}
      />
    </div>
  );
}
