import {
  normalizeStyleValues,
  styleValuesToDeclarations,
  type StyleValues,
} from "./style-values";

/**
 * Appearance and site-content value shapes, their defaults, and the CSS custom
 * properties they produce.
 *
 * Split out of `lib/site-settings.ts` (which talks to MongoDB) so the admin's
 * live preview can import the exact same generator without pulling the database
 * layer into the browser bundle. Preview and published site therefore resolve
 * through identical CSS.
 */

/**
 * Named content widths for the header and footer. `full` spans the viewport;
 * the rest cap the inner content so it lines up with the page body.
 */
export const CONTENT_WIDTHS = ["full", "wide", "standard", "narrow"] as const;
export type ContentWidth = (typeof CONTENT_WIDTHS)[number];

export const CONTENT_WIDTH_VALUES: Record<ContentWidth, string> = {
  full: "100%",
  wide: "90rem",
  standard: "76rem",
  narrow: "60rem",
};

export const CONTENT_WIDTH_LABELS: Record<ContentWidth, string> = {
  full: "Full width",
  wide: "Wide",
  standard: "Standard",
  narrow: "Narrow",
};

/**
 * Text elements of the public chrome that can be styled from the Appearance
 * screen. Each maps to a selector in `app/globals.css`, so the generated rules
 * apply to the live site and to the admin preview alike.
 */
/** Where the signed-out link is offered. */
export const SIGN_IN_PLACEMENTS = ["header", "footer", "both"] as const;

export type SignInPlacement = (typeof SIGN_IN_PLACEMENTS)[number];

export const SIGN_IN_PLACEMENT_LABELS: Record<SignInPlacement, string> = {
  header: "Header",
  footer: "Footer",
  both: "Header and footer",
};

export function signInPlacement(value: unknown): SignInPlacement {
  return SIGN_IN_PLACEMENTS.includes(value as SignInPlacement)
    ? (value as SignInPlacement)
    : "header";
}

export const SITE_TEXT_ELEMENTS = [
  { key: "headerBrand", group: "Header", label: "Brand text", selector: ".site-brand" },
  { key: "headerTagline", group: "Header", label: "Tagline", selector: ".site-tagline" },
  // The call to action also lives in the nav, so it is excluded here and gets
  // its own rule — otherwise nav styling would silently override it.
  // A dropdown label is a button, not an anchor, but it reads as a nav item, so
  // it is styled by the same entry.
  {
    key: "headerNav",
    group: "Header",
    label: "Navigation links",
    selector: ".site-nav a:not(.site-cta), .site-nav .site-nav-label",
  },
  // The hamburger panel, keyed on the open state rather than a media query so
  // the page builder's mobile viewport picks these up too. Listed after the
  // navigation entry so that, at equal specificity, these win inside the panel.
  {
    key: "headerMobileLabel",
    group: "Header",
    label: "Mobile menu labels",
    selector: '.site-nav[data-open="true"] .site-nav-label',
  },
  {
    // Direct children only: links inside a dropdown keep their own entry below.
    key: "headerMobileLink",
    group: "Header",
    label: "Mobile menu links",
    selector: '.site-nav[data-open="true"] > a:not(.site-cta)',
  },
  { key: "headerCta", group: "Header", label: "Call to action", selector: ".site-cta" },
  // One entry for both placements: it is the same link wherever it is put, and
  // styling it twice would only let the two drift apart.
  {
    key: "signIn",
    group: "Header",
    label: "Sign in link",
    selector: ".site-account-signin, .site-footer-signin",
  },
  {
    key: "headerMenuPanel",
    group: "Header",
    label: "Dropdown panel",
    selector: ".site-nav-panel",
  },
  {
    key: "headerMenuChild",
    group: "Header",
    label: "Dropdown links",
    selector: ".site-nav-panel a",
  },

  {
    key: "pageHeading",
    group: "Page",
    label: "Headings",
    selector: ".page-shell h1, .page-shell h2, .page-shell h3",
  },
  {
    key: "pageBody",
    group: "Page",
    label: "Body text",
    selector: ".page-shell p, .page-shell li",
  },
  { key: "pageLink", group: "Page", label: "Links", selector: ".page-shell a" },

  {
    key: "footerBrand",
    group: "Footer",
    label: "Brand text",
    selector: ".site-footer-inner strong",
  },
  { key: "footerText", group: "Footer", label: "Footer text", selector: ".site-footer-text" },
  {
    key: "footerCopyright",
    group: "Footer",
    label: "Copyright",
    selector: ".site-footer-copyright",
  },
  { key: "footerSocial", group: "Footer", label: "Social links", selector: ".site-social a" },
] as const;

export type SiteTextElementKey = (typeof SITE_TEXT_ELEMENTS)[number]["key"];

export type SiteTextStyle = {
  style?: StyleValues;
  hoverEnabled?: boolean;
  hoverStyle?: StyleValues;
  transitionDuration?: number;
};

export type SiteTextStyles = Partial<Record<SiteTextElementKey, SiteTextStyle>>;

/**
 * Turn the stored text styles into CSS.
 *
 * `scope` prefixes every selector so the admin preview can render the same
 * rules without leaking them into the rest of the admin.
 */
export function siteTextStyleCss(styles: SiteTextStyles | undefined, scope = ""): string {
  if (!styles) return "";

  const prefix = (selector: string, suffix = "") =>
    selector
      .split(",")
      .map((part) => `${scope}.site-shell ${part.trim()}${suffix}`)
      .join(", ");

  const blocks: string[] = [];

  for (const element of SITE_TEXT_ELEMENTS) {
    const entry = styles[element.key];
    if (!entry) continue;

    const base = styleValuesToDeclarations(normalizeStyleValues(entry.style));
    if (base.trim()) {
      const duration = entry.transitionDuration ?? 200;
      blocks.push(
        `${prefix(element.selector)} {
${base}
  transition: all ${duration}ms ease;
}`
      );
    }

    if (entry.hoverEnabled) {
      const hover = styleValuesToDeclarations(normalizeStyleValues(entry.hoverStyle));
      if (hover.trim()) {
        const hoverSelector = prefix(element.selector, ":hover");
        blocks.push(`${hoverSelector} {
${hover}
}`);
      }
    }
  }

  return blocks.join("\n\n");
}

export type SiteMenuChild = { label: string; href: string; newTab?: boolean };

/**
 * A header menu item: either a link, or a label that opens a dropdown of child
 * links. `kind` is optional so menus saved before dropdowns existed still read
 * as plain links.
 */
export type SiteMenuLink = SiteMenuChild & {
  kind?: "link" | "label";
  children?: SiteMenuChild[];
  /** Whether the label shows an arrow hinting at the dropdown. */
  showCaret?: boolean;
};

/** A label with nothing under it has no dropdown to open, so it stays a link. */
export function isMenuLabel(link: SiteMenuLink): boolean {
  return link.kind === "label" && (link.children?.length ?? 0) > 0;
}

export type AppearanceValues = {
  headerBackground: string;
  headerText: string;
  headerAccent: string;

  headerWidth: ContentWidth;
  headerPaddingY: number;
  headerSticky: boolean;
  headerBorderEnabled: boolean;
  headerBorderWidth: number;
  headerBorderColor: string;
  headerShadow: boolean;
  headerNavAlign: "left" | "center" | "right";
  headerNavSize: number;
  headerNavGap: number;
  adminBackground: string;
  adminPanel: string;
  adminText: string;
  adminAccent: string;
  contentBackground: string;
  contentText: string;
  contentAccent: string;
  footerBackground: string;
  footerText: string;

  footerWidth: ContentWidth;
  footerPaddingY: number;
  footerBorderEnabled: boolean;
  footerBorderWidth: number;
  footerBorderColor: string;
  footerAlign: "left" | "center" | "between";
  footerFontSize: number;
  /** Gap between the footer's columns and between its two rows, in rem. */
  footerColumnGap: number;
  footerRowGap: number;

  headingFont: string;
  bodyFont: string;
  faviconUrl: string;
  /** Per-element text styling for the header, page body and footer. */
  textStyles: SiteTextStyles;
};

export const defaultAppearance: AppearanceValues = {
  headerBackground: "#0f1115",
  headerText: "#f5f5f5",
  headerAccent: "#8ab4f8",

  headerWidth: "standard",
  headerPaddingY: 1,
  headerSticky: false,
  headerBorderEnabled: true,
  headerBorderWidth: 0.0625,
  headerBorderColor: "#262b33",
  headerShadow: false,
  headerNavAlign: "right",
  headerNavSize: 0.9375,
  headerNavGap: 1.25,
  adminBackground: "#101317",
  adminPanel: "#171b21",
  adminText: "#e8eaed",
  adminAccent: "#8ab4f8",
  contentBackground: "#ffffff",
  contentText: "#16181d",
  contentAccent: "#2b6cb0",
  footerBackground: "#0f1115",
  footerText: "#c9ced6",

  footerWidth: "standard",
  footerPaddingY: 2,
  footerBorderEnabled: false,
  footerBorderWidth: 0.0625,
  footerBorderColor: "#262b33",
  footerAlign: "between",
  footerFontSize: 0.875,
  footerColumnGap: 1.5,
  footerRowGap: 1.25,

  headingFont: "system-ui",
  bodyFont: "system-ui",
  faviconUrl: "",
  textStyles: {},
};

export type SiteContentValues = {
  metaTitle: string;
  metaDescription: string;
  metaImageUrl: string;
  headerBrandText: string;
  headerBrandHref: string;
  headerTagline: string;
  logoUrl: string;
  logoMediaId: string;
  logoHeight: number;
  showLogo: boolean;
  showBrandText: boolean;
  menuLinks: SiteMenuLink[];
  availabilityEnabled: boolean;
  availabilityLabel: string;
  availabilityHref: string;

  /**
   * The way in for somebody who has not signed in. Only ever the signed-out
   * link: the menu a signed-in member sees is not configurable, so the corner
   * of the header means the same thing on every site.
   */
  signInEnabled: boolean;
  signInPlacement: SignInPlacement;
  signInLabel: string;
  socialLinks: { platform: string; label: string; href: string }[];
  footerBrandText: string;
  footerLogoUrl: string;
  footerLogoMediaId: string;
  footerLogoHeight: number;
  showFooterLogo: boolean;
  footerText: string;
  copyright: string;
  collectionTemplateDefaults: Record<string, unknown>;
  collectionDisplayDefaults: Record<string, unknown>;
  collectionStyleOverrides: Record<string, unknown>;
  safeModeDefault: boolean;
};

export const defaultSiteContent: SiteContentValues = {
  metaTitle: "Aperture",
  metaDescription: "",
  metaImageUrl: "",
  headerBrandText: "Aperture",
  headerBrandHref: "/",
  headerTagline: "",
  logoUrl: "",
  logoMediaId: "",
  logoHeight: 40,
  showLogo: false,
  showBrandText: true,
  menuLinks: [],
  availabilityEnabled: false,
  availabilityLabel: "",
  availabilityHref: "",

  signInEnabled: true,
  signInPlacement: "header",
  signInLabel: "Sign in",
  socialLinks: [],
  footerBrandText: "",
  footerLogoUrl: "",
  footerLogoMediaId: "",
  footerLogoHeight: 32,
  showFooterLogo: false,
  footerText: "",
  copyright: "",
  collectionTemplateDefaults: {},
  collectionDisplayDefaults: {},
  collectionStyleOverrides: {},
  safeModeDefault: true,
};

function fontStack(name: string): string {
  if (!name || name === "system-ui") {
    return 'system-ui, -apple-system, "Segoe UI", sans-serif';
  }
  return `"${name}", system-ui, sans-serif`;
}

/**
 * Appearance values as custom properties. The same declarations are emitted
 * into `:root` for the live site and onto a wrapper for the admin preview, so
 * both resolve through identical CSS.
 */
export function appearanceCssDeclarations(appearance: AppearanceValues): string {
  const width = (value: ContentWidth) =>
    CONTENT_WIDTH_VALUES[value] ?? CONTENT_WIDTH_VALUES.standard;

  return `  --header-bg: ${appearance.headerBackground};
  --header-text: ${appearance.headerText};
  --header-accent: ${appearance.headerAccent};
  --header-max: ${width(appearance.headerWidth)};
  --header-pad-y: ${appearance.headerPaddingY}rem;
  --header-border-color: ${
    appearance.headerBorderEnabled ? appearance.headerBorderColor : "transparent"
  };
  --header-border-width: ${
    appearance.headerBorderEnabled ? appearance.headerBorderWidth : 0
  }rem;
  --header-nav-size: ${appearance.headerNavSize}rem;
  --header-nav-gap: ${appearance.headerNavGap}rem;
  --header-shadow: ${
    appearance.headerShadow ? "0 0.25rem 1.25rem rgba(0, 0, 0, 0.28)" : "none"
  };

  --admin-bg: ${appearance.adminBackground};
  --admin-panel: ${appearance.adminPanel};
  --admin-text: ${appearance.adminText};
  --admin-accent: ${appearance.adminAccent};

  --content-bg: ${appearance.contentBackground};
  --content-text: ${appearance.contentText};
  --content-accent: ${appearance.contentAccent};

  --footer-bg: ${appearance.footerBackground};
  --footer-text: ${appearance.footerText};
  --footer-max: ${width(appearance.footerWidth)};
  --footer-pad-y: ${appearance.footerPaddingY}rem;
  --footer-font-size: ${appearance.footerFontSize}rem;
  --footer-col-gap: ${appearance.footerColumnGap ?? 1.5}rem;
  --footer-row-gap: ${appearance.footerRowGap ?? 1.25}rem;
  --footer-border-color: ${
    appearance.footerBorderEnabled ? appearance.footerBorderColor : "transparent"
  };
  --footer-border-width: ${
    appearance.footerBorderEnabled ? appearance.footerBorderWidth : 0
  }rem;

  --heading-font: ${fontStack(appearance.headingFont)};
  --body-font: ${fontStack(appearance.bodyFont)};`;
}

/** Appearance values as a `:root` custom-property block. */
export function appearanceCssVariables(appearance: AppearanceValues): string {
  return `:root {
${appearanceCssDeclarations(appearance)}
}`;
}
