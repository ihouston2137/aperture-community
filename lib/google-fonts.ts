export type GoogleFontCategory =
  | "sans-serif"
  | "serif"
  | "display"
  | "handwriting"
  | "monospace";

export type GoogleFontMeta = {
  family: string;
  category: GoogleFontCategory;
  variants: string[];
  /** Google's own rank, 1 being the most used. Lower sorts first. */
  popularity?: number;
};

export type GoogleFontSearchResult = {
  fonts: GoogleFontMeta[];
  /** How many families matched before the limit was applied. */
  total: number;
  /** False when the search ran against the bundled shortlist, not the catalogue. */
  complete: boolean;
};

/**
 * The shortlist the search falls back to when the Google Fonts catalogue cannot
 * be reached — a handful of families per category so the design library still
 * works offline. The real search runs against all ~1,900 families; see
 * `loadGoogleFonts`.
 */
const FALLBACK_FONTS: GoogleFontMeta[] = [
  { family: "Inter", category: "sans-serif", variants: ["300", "400", "500", "600", "700", "800"] },
  { family: "Roboto", category: "sans-serif", variants: ["300", "400", "500", "700", "900"] },
  { family: "Open Sans", category: "sans-serif", variants: ["300", "400", "600", "700", "800"] },
  { family: "Lato", category: "sans-serif", variants: ["300", "400", "700", "900"] },
  { family: "Montserrat", category: "sans-serif", variants: ["300", "400", "500", "600", "700", "800"] },
  { family: "Poppins", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Raleway", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Nunito", category: "sans-serif", variants: ["300", "400", "600", "700", "800"] },
  { family: "Work Sans", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "DM Sans", category: "sans-serif", variants: ["400", "500", "700"] },
  { family: "Manrope", category: "sans-serif", variants: ["300", "400", "500", "600", "700", "800"] },
  { family: "Rubik", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Karla", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Mulish", category: "sans-serif", variants: ["300", "400", "600", "700", "800"] },
  { family: "Barlow", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Source Sans 3", category: "sans-serif", variants: ["300", "400", "600", "700"] },
  { family: "Figtree", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Outfit", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Space Grotesk", category: "sans-serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Archivo", category: "sans-serif", variants: ["400", "500", "600", "700"] },

  { family: "Playfair Display", category: "serif", variants: ["400", "500", "600", "700", "800"] },
  { family: "Merriweather", category: "serif", variants: ["300", "400", "700", "900"] },
  { family: "Lora", category: "serif", variants: ["400", "500", "600", "700"] },
  { family: "PT Serif", category: "serif", variants: ["400", "700"] },
  { family: "Libre Baskerville", category: "serif", variants: ["400", "700"] },
  { family: "Crimson Text", category: "serif", variants: ["400", "600", "700"] },
  { family: "EB Garamond", category: "serif", variants: ["400", "500", "600", "700"] },
  { family: "Cormorant Garamond", category: "serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Source Serif 4", category: "serif", variants: ["300", "400", "600", "700"] },
  { family: "Spectral", category: "serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Bitter", category: "serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Noto Serif", category: "serif", variants: ["400", "500", "600", "700"] },
  { family: "Newsreader", category: "serif", variants: ["300", "400", "500", "600", "700"] },
  { family: "Fraunces", category: "serif", variants: ["300", "400", "500", "600", "700"] },

  { family: "Oswald", category: "display", variants: ["300", "400", "500", "600", "700"] },
  { family: "Bebas Neue", category: "display", variants: ["400"] },
  { family: "Anton", category: "display", variants: ["400"] },
  { family: "Abril Fatface", category: "display", variants: ["400"] },
  { family: "Righteous", category: "display", variants: ["400"] },
  { family: "Alfa Slab One", category: "display", variants: ["400"] },
  { family: "Archivo Black", category: "display", variants: ["400"] },
  { family: "Chivo", category: "display", variants: ["400", "700", "900"] },

  { family: "Dancing Script", category: "handwriting", variants: ["400", "500", "600", "700"] },
  { family: "Pacifico", category: "handwriting", variants: ["400"] },
  { family: "Caveat", category: "handwriting", variants: ["400", "500", "600", "700"] },
  { family: "Satisfy", category: "handwriting", variants: ["400"] },
  { family: "Great Vibes", category: "handwriting", variants: ["400"] },

  { family: "JetBrains Mono", category: "monospace", variants: ["300", "400", "500", "600", "700"] },
  { family: "Fira Code", category: "monospace", variants: ["300", "400", "500", "600", "700"] },
  { family: "IBM Plex Mono", category: "monospace", variants: ["300", "400", "500", "600", "700"] },
  { family: "Space Mono", category: "monospace", variants: ["400", "700"] },
  { family: "Source Code Pro", category: "monospace", variants: ["300", "400", "500", "600", "700"] },
];

/**
 * Google publishes the catalogue that fonts.google.com itself browses, with no
 * API key. It is fetched once and held for a day: the search runs on every
 * keystroke and the payload is a few megabytes.
 */
const CATALOGUE_URL = "https://fonts.google.com/metadata/fonts";
const CATALOGUE_TTL_MS = 24 * 60 * 60 * 1000;
const CATALOGUE_TIMEOUT_MS = 10_000;

type Catalogue = { fonts: GoogleFontMeta[]; complete: boolean };

let cached: { at: number; value: Catalogue } | null = null;
let inFlight: Promise<Catalogue> | null = null;

const CATEGORIES: Record<string, GoogleFontCategory> = {
  "sans serif": "sans-serif",
  "sans-serif": "sans-serif",
  serif: "serif",
  display: "display",
  handwriting: "handwriting",
  monospace: "monospace",
};

function toCategory(raw: unknown): GoogleFontCategory {
  return CATEGORIES[String(raw ?? "").trim().toLowerCase()] ?? "sans-serif";
}

/**
 * One catalogue entry reduced to what the design library needs. Weights arrive
 * as the keys of a `fonts` map — "400", "700i" and, on variable families,
 * anything from "1" to "1000". The italics are dropped: the stylesheet builder
 * asks for upright weights only.
 */
function toMeta(entry: any): GoogleFontMeta | null {
  const family = typeof entry?.family === "string" ? entry.family.trim() : "";
  if (!family) return null;

  const weights = Object.keys(entry?.fonts ?? {})
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b));

  return {
    family,
    category: toCategory(entry?.category),
    // A family with nothing but italics still has a regular to load.
    variants: weights.length ? weights : ["400"],
    popularity: Number(entry?.popularity) || Number.MAX_SAFE_INTEGER,
  };
}

async function fetchCatalogue(): Promise<Catalogue> {
  const response = await fetch(CATALOGUE_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
    next: { revalidate: CATALOGUE_TTL_MS / 1000 },
  });
  if (!response.ok) {
    throw new Error(`Google Fonts catalogue responded ${response.status}`);
  }

  // Google's JSON endpoints have historically carried an anti-hijacking prefix
  // ()]}') ahead of the body, so parse from the first brace rather than the
  // first character.
  const body = await response.text();
  const start = body.indexOf("{");
  const parsed = JSON.parse(start > 0 ? body.slice(start) : body);
  const list = Array.isArray(parsed?.familyMetadataList)
    ? parsed.familyMetadataList
    : [];

  const fonts = list
    .map(toMeta)
    .filter((font: GoogleFontMeta | null): font is GoogleFontMeta => font !== null);

  if (fonts.length === 0) throw new Error("Google Fonts catalogue was empty");
  return { fonts, complete: true };
}

/**
 * The whole catalogue, or the bundled shortlist if it cannot be had. A failure
 * is never cached, so the next search tries the network again.
 */
export async function loadGoogleFonts(): Promise<Catalogue> {
  if (cached && Date.now() - cached.at < CATALOGUE_TTL_MS) return cached.value;
  if (inFlight) return inFlight;

  inFlight = fetchCatalogue()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .catch((error) => {
      console.error("Google Fonts catalogue unavailable:", error);
      return { fonts: FALLBACK_FONTS, complete: false };
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/**
 * Ranks a family against the typed term. Lower is better, and `null` means it
 * does not match at all.
 */
function rank(font: GoogleFontMeta, term: string): number | null {
  const family = font.family.toLowerCase();

  if (family === term) return 0;
  if (family.startsWith(term)) return 1;
  // "sans" should find "Open Sans", not just families that begin with it.
  if (family.split(/[\s-]+/).some((word) => word.startsWith(term))) return 2;
  if (family.includes(term)) return 3;
  // A category is only worth matching once enough of it has been typed,
  // otherwise a single letter drags in most of the catalogue.
  if (term.length >= 3 && font.category.includes(term)) return 4;
  return null;
}

/**
 * Searches every family Google publishes. With no term, the most popular come
 * back, which is what the picker shows before anything is typed.
 */
export async function searchGoogleFonts(
  query: string,
  limit = 60
): Promise<GoogleFontSearchResult> {
  const { fonts, complete } = await loadGoogleFonts();
  const term = query.trim().toLowerCase();

  const byPopularity = (a: GoogleFontMeta, b: GoogleFontMeta) =>
    (a.popularity ?? Number.MAX_SAFE_INTEGER) -
      (b.popularity ?? Number.MAX_SAFE_INTEGER) ||
    a.family.localeCompare(b.family);

  if (!term) {
    return {
      fonts: [...fonts].sort(byPopularity).slice(0, limit),
      total: fonts.length,
      complete,
    };
  }

  const matches: { font: GoogleFontMeta; score: number }[] = [];
  for (const font of fonts) {
    const score = rank(font, term);
    if (score !== null) matches.push({ font, score });
  }

  matches.sort((a, b) => a.score - b.score || byPopularity(a.font, b.font));

  return {
    fonts: matches.slice(0, limit).map((match) => match.font),
    total: matches.length,
    complete,
  };
}

/** Build the hosted stylesheet URL for a family and its selected weights. */
export function googleFontCssUrl(family: string, variants: string[]): string {
  // css2 rejects a weight list that is not in ascending numeric order, and
  // variable families reach 1000 — so this cannot be a plain string sort.
  const weights = [...new Set(variants.length ? variants : ["400"])].sort(
    (a, b) => Number(a) - Number(b)
  );
  const name = family.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${weights.join(";")}&display=swap`;
}
