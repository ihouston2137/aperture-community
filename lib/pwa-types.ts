/**
 * The web app manifest: what this site is called, and how it behaves, once
 * somebody has put it on a home screen.
 *
 * A manifest is a small set of promises made to the device — a name that fits
 * under an icon, a colour to paint the window while the first page loads, a
 * page to open at. They are settings rather than code because the community
 * running the site is the one who knows what the app should be called, and
 * because an icon is a picture somebody uploads.
 *
 * Free of database imports: the settings form is a client component and reads
 * these types and helpers, and importing a value from a module that reaches
 * Mongoose would drag the driver into the browser bundle.
 */

import { protectedMediaUrl } from "./protected-media-url";

/* --------------------------------------------------------------- Vocabulary */

/**
 * How the window is dressed when the app is opened from a home screen.
 *
 * `browser` is the one that opts out: a device that reads it keeps the app in
 * an ordinary tab, which is also what a site with no manifest gets.
 */
export const PWA_DISPLAY_MODES = [
  "standalone",
  "fullscreen",
  "minimal-ui",
  "browser",
] as const;

export type PwaDisplay = (typeof PWA_DISPLAY_MODES)[number];

export const PWA_DISPLAY_LABELS: Record<PwaDisplay, string> = {
  standalone: "Its own window",
  fullscreen: "Full screen",
  "minimal-ui": "Its own window, with the basic controls",
  browser: "An ordinary browser tab",
};

export const PWA_DISPLAY_HELP: Record<PwaDisplay, string> = {
  standalone: "Like an app: no address bar, no browser tabs.",
  fullscreen: "Everything the screen has, with the system bars hidden too.",
  "minimal-ui": "Its own window, keeping back, forward and reload.",
  browser: "No app window at all — it opens the way a link does.",
};

export const PWA_ORIENTATIONS = ["any", "portrait", "landscape"] as const;

export type PwaOrientation = (typeof PWA_ORIENTATIONS)[number];

export const PWA_ORIENTATION_LABELS: Record<PwaOrientation, string> = {
  any: "However the device is held",
  portrait: "Portrait",
  landscape: "Landscape",
};

/**
 * What an icon is for.
 *
 * `maskable` is the one worth understanding: Android crops icons to whatever
 * shape the launcher uses, so a maskable icon is drawn with its artwork inside
 * a safe circle and padding it can afford to lose. An `any` icon put in its
 * place comes out with the edges cut off.
 */
export const PWA_ICON_PURPOSES = ["any", "maskable", "monochrome"] as const;

export type PwaIconPurpose = (typeof PWA_ICON_PURPOSES)[number];

export const PWA_ICON_PURPOSE_LABELS: Record<PwaIconPurpose, string> = {
  any: "Used as it is",
  maskable: "Cropped to the device's shape",
  monochrome: "A single-colour silhouette",
};

export const PWA_ICON_PURPOSE_HELP: Record<PwaIconPurpose, string> = {
  any: "Shown whole. Give it the background it should have.",
  maskable:
    "Keep the artwork within the middle four fifths — the rest may be cut off.",
  monochrome: "For badges and notifications, where the device recolours it.",
};

export const APPLE_STATUS_BAR_STYLES = [
  "default",
  "black",
  "black-translucent",
] as const;

export type AppleStatusBarStyle = (typeof APPLE_STATUS_BAR_STYLES)[number];

export const APPLE_STATUS_BAR_LABELS: Record<AppleStatusBarStyle, string> = {
  default: "Light, with the bar over its own background",
  black: "Black bar",
  "black-translucent": "The page runs under the bar",
};

/* ----------------------------------------------------------------- Settings */

export type PwaIcon = {
  /** The stored media path, as uploaded. Rewritten when it is served. */
  url: string;
  /** The library asset it came from, so media usage can be traced. */
  mediaId: string;
  /** `512x512`, or `any` for something that scales — an SVG. */
  sizes: string;
  /** The MIME type, worked out from the file unless it is stated. */
  type: string;
  purpose: PwaIconPurpose;
};

export type PwaValues = {
  /**
   * Whether this site offers itself as an app at all.
   *
   * The manifest is always served — a file convention cannot be taken away at
   * runtime — so turning this off serves one that asks for nothing: an
   * ordinary tab, and no icons to install with.
   */
  isEnabled: boolean;
  /** Shown on the install prompt and the splash screen. */
  name: string;
  /** Shown under the icon, where roughly twelve characters fit. */
  shortName: string;
  description: string;
  /** The page the app opens at. */
  startUrl: string;
  /** How much of the site stays inside the app window. */
  scope: string;
  /** Painted behind the splash screen before the first page has drawn. */
  backgroundColor: string;
  /** The window furniture: the title bar on Android, the tab strip elsewhere. */
  themeColor: string;
  display: PwaDisplay;
  orientation: PwaOrientation;
  /** BCP 47, as `lang` on the root element. */
  lang: string;
  /** Hints for the stores and launchers that read them. */
  categories: string[];
  /** iOS reads its own tags rather than the manifest; this is for those. */
  appleStatusBarStyle: AppleStatusBarStyle;
  icons: PwaIcon[];
};

export const defaultPwa: PwaValues = {
  isEnabled: false,
  name: "",
  shortName: "",
  description: "",
  startUrl: "/",
  scope: "/",
  backgroundColor: "#ffffff",
  themeColor: "#000000",
  display: "standalone",
  orientation: "any",
  lang: "en",
  categories: [],
  appleStatusBarStyle: "default",
  icons: [],
};

/* ----------------------------------------------------------------- Tidying */

const NAME_LIMIT = 90;
const SHORT_NAME_LIMIT = 30;
const DESCRIPTION_LIMIT = 500;

export function pwaDisplay(value: unknown): PwaDisplay {
  return PWA_DISPLAY_MODES.includes(value as PwaDisplay)
    ? (value as PwaDisplay)
    : "standalone";
}

export function pwaOrientation(value: unknown): PwaOrientation {
  return PWA_ORIENTATIONS.includes(value as PwaOrientation)
    ? (value as PwaOrientation)
    : "any";
}

export function pwaIconPurpose(value: unknown): PwaIconPurpose {
  return PWA_ICON_PURPOSES.includes(value as PwaIconPurpose)
    ? (value as PwaIconPurpose)
    : "any";
}

export function appleStatusBarStyle(value: unknown): AppleStatusBarStyle {
  return APPLE_STATUS_BAR_STYLES.includes(value as AppleStatusBarStyle)
    ? (value as AppleStatusBarStyle)
    : "default";
}

/**
 * A path within this site, and nothing else.
 *
 * `start_url` and `scope` are resolved against the manifest, so an absolute URL
 * somewhere else is either ignored or makes the whole manifest invalid. Keeping
 * them to a leading slash means a mistyped setting can only ever be a wrong
 * page on this site.
 */
export function sitePath(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  if (!text || text.includes("..") || /^[a-z]+:/i.test(text)) return fallback;
  return (text.startsWith("/") ? text : `/${text}`).slice(0, 300);
}

/** `#rrggbb`, because that is what the devices and the colour inputs agree on. */
export function pwaColor(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(text)) {
    const [, r, g, b] = text.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

/** The MIME type an icon will be served as, read from its extension. */
export function iconTypeFor(url: string): string {
  const extension = String(url ?? "")
    .split("?")[0]
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/)?.[1];
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    default:
      return "";
  }
}

/**
 * The `sizes` an uploaded picture deserves.
 *
 * Square is what a launcher wants, and an oblong one is described honestly
 * rather than rounded to a square it is not — the device decides what to do
 * about it, and a lie here is a stretched icon.
 */
export function iconSizesFor(width?: number, height?: number): string {
  if (!width || !height) return "";
  return `${Math.round(width)}x${Math.round(height)}`;
}

/** `512x512` as a number, for sorting and for finding the Apple-sized one. */
export function iconPixels(icon: PwaIcon): number {
  const match = icon.sizes.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return 0;
  return Math.min(Number(match[1]), Number(match[2]));
}

export function normalizeIcons(value: unknown): PwaIcon[] {
  if (!Array.isArray(value)) return [];

  const icons: PwaIcon[] = [];
  const seen = new Set<string>();

  for (const raw of value.slice(0, 20)) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const url = String(row.url ?? "").trim();
    // An icon with no picture is a row somebody started and left; nothing can
    // be installed with it.
    if (!url) continue;

    const purpose = pwaIconPurpose(row.purpose);
    const sizes = String(row.sizes ?? "").trim().slice(0, 40) || "any";
    // The same picture at the same size and purpose twice is one icon said
    // twice, and devices pick between them arbitrarily.
    const key = `${url}|${sizes}|${purpose}`;
    if (seen.has(key)) continue;
    seen.add(key);

    icons.push({
      url,
      mediaId: String(row.mediaId ?? "").trim(),
      sizes,
      type: String(row.type ?? "").trim() || iconTypeFor(url),
      purpose,
    });
  }

  return icons;
}

export function normalizeCategories(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(",")
        .map((entry) => entry.trim());
  return [
    ...new Set(
      list
        .map((entry) => String(entry ?? "").trim().toLowerCase().slice(0, 40))
        .filter(Boolean)
    ),
  ].slice(0, 12);
}

export function normalizePwa(value: unknown): PwaValues {
  const row = (value ?? {}) as Record<string, unknown>;
  return {
    isEnabled: Boolean(row.isEnabled),
    name: String(row.name ?? "").trim().slice(0, NAME_LIMIT),
    shortName: String(row.shortName ?? "").trim().slice(0, SHORT_NAME_LIMIT),
    description: String(row.description ?? "").trim().slice(0, DESCRIPTION_LIMIT),
    startUrl: sitePath(row.startUrl, defaultPwa.startUrl),
    scope: sitePath(row.scope, defaultPwa.scope),
    backgroundColor: pwaColor(row.backgroundColor, defaultPwa.backgroundColor),
    themeColor: pwaColor(row.themeColor, defaultPwa.themeColor),
    display: pwaDisplay(row.display),
    orientation: pwaOrientation(row.orientation),
    lang: String(row.lang ?? "").trim().slice(0, 12) || defaultPwa.lang,
    categories: normalizeCategories(row.categories),
    appleStatusBarStyle: appleStatusBarStyle(row.appleStatusBarStyle),
    icons: normalizeIcons(row.icons),
  };
}

/* --------------------------------------------------------- What is missing */

/**
 * The sizes a device actually asks for.
 *
 * 192 is the home screen, 512 is the splash screen and the install prompt, and
 * a maskable one keeps Android from cropping the artwork. Anything else is
 * welcome but nothing goes wrong without it, which is why these three are the
 * ones the settings page nags about.
 */
export const RECOMMENDED_ICONS: {
  sizes: string;
  purpose: PwaIconPurpose;
  why: string;
}[] = [
  { sizes: "192x192", purpose: "any", why: "the home screen icon" },
  { sizes: "512x512", purpose: "any", why: "the splash screen and the install prompt" },
  {
    sizes: "512x512",
    purpose: "maskable",
    why: "so Android does not crop the artwork",
  },
];

/** Which of the recommended icons have not been given. */
export function missingIcons(icons: PwaIcon[]): typeof RECOMMENDED_ICONS {
  return RECOMMENDED_ICONS.filter(
    (wanted) =>
      !icons.some(
        (icon) => icon.sizes === wanted.sizes && icon.purpose === wanted.purpose
      )
  );
}

/**
 * The icon iOS should use for the home screen.
 *
 * Apple reads a `link` tag rather than the manifest, wants 180 square, and
 * does not understand maskable icons — it would show the padding as artwork.
 * So: the closest ordinary icon at or above 180, or the largest there is.
 */
export function appleTouchIcon(icons: PwaIcon[]): PwaIcon | null {
  const usable = icons.filter((icon) => icon.purpose !== "monochrome");
  if (usable.length === 0) return null;

  const plain = usable.filter((icon) => icon.purpose === "any");
  const candidates = plain.length > 0 ? plain : usable;

  const atLeast = candidates
    .filter((icon) => iconPixels(icon) >= 180)
    .sort((left, right) => iconPixels(left) - iconPixels(right));
  if (atLeast.length > 0) return atLeast[0];

  return [...candidates].sort(
    (left, right) => iconPixels(right) - iconPixels(left)
  )[0];
}

/* ---------------------------------------------------------- The manifest */

/** One icon as a manifest entry, served through the protected media route. */
function manifestIcon(icon: PwaIcon) {
  return {
    src: protectedMediaUrl(icon.url),
    sizes: icon.sizes || "any",
    type: icon.type || undefined,
    purpose: icon.purpose,
  };
}

/**
 * What `/manifest.webmanifest` says.
 *
 * Kept here, beside the settings it is built from, so the route stays a matter
 * of reading the database and handing this the answer.
 *
 * A site that has not turned the app on still serves a manifest — the file
 * cannot be withdrawn at runtime — but it serves one that asks for nothing:
 * an ordinary tab and no icons, which is what a device does with a site that
 * has no manifest at all.
 */
export function manifestFrom(settings: PwaValues, fallbackName: string) {
  const name = settings.name || fallbackName || "App";
  const shortName = settings.shortName || name.slice(0, SHORT_NAME_LIMIT);

  if (!settings.isEnabled) {
    return {
      name,
      short_name: shortName,
      start_url: settings.startUrl,
      display: "browser" as const,
      icons: [],
    };
  }

  return {
    name,
    short_name: shortName,
    description: settings.description || undefined,
    start_url: settings.startUrl,
    scope: settings.scope,
    display: settings.display,
    orientation: settings.orientation,
    background_color: settings.backgroundColor,
    theme_color: settings.themeColor,
    lang: settings.lang,
    categories: settings.categories.length > 0 ? settings.categories : undefined,
    icons: settings.icons.map(manifestIcon),
  };
}
