export type GoogleFontMeta = {
  family: string;
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
  variants: string[];
};

/**
 * Bundled metadata for the design library's font search. Kept local so the
 * admin never has to call the Google Fonts API at request time; the stylesheet
 * itself is still loaded from fonts.googleapis.com when a family is added.
 */
export const GOOGLE_FONTS: GoogleFontMeta[] = [
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

export function searchGoogleFonts(query: string, limit = 40): GoogleFontMeta[] {
  const term = query.trim().toLowerCase();
  const matches = term
    ? GOOGLE_FONTS.filter(
        (font) =>
          font.family.toLowerCase().includes(term) || font.category.includes(term)
      )
    : GOOGLE_FONTS;
  return matches.slice(0, limit);
}

/** Build the hosted stylesheet URL for a family and its selected weights. */
export function googleFontCssUrl(family: string, variants: string[]): string {
  const weights = [...new Set(variants.length ? variants : ["400"])].sort();
  const name = family.replace(/ /g, "+");
  return `https://fonts.googleapis.com/css2?family=${name}:wght@${weights.join(";")}&display=swap`;
}
