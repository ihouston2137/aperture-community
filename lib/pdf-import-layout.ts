import { newSlide, newSlideBlock, slideDimensions, type Deck, type Slide } from "./presentation";

export const PDF_PAGE_SIZES = {
  original: "Match PDF proportions (1920 px longest edge)",
  "16:9": "16:9 HD — 1920 × 1080 px",
  "16:9-4k": "16:9 4K — 3840 × 2160 px",
  "9:16": "9:16 HD — 1080 × 1920 px",
  "9:16-4k": "9:16 4K — 2160 × 3840 px",
  "4:3": "4:3 — 1600 × 1200 px",
  "3:4": "3:4 — 1200 × 1600 px",
} as const;
export type PdfPageSize = keyof typeof PDF_PAGE_SIZES;

export function pdfDeckSize(choice: PdfPageSize, first: { width: number; height: number }): Pick<Deck, "aspect" | "pageUnit" | "resolution" | "customWidth" | "customHeight"> {
  if (choice === "original") {
    const scale = 1920 / Math.max(first.width, first.height);
    return { aspect: "custom", pageUnit: "px", customWidth: Math.max(1, Math.round(first.width * scale)), customHeight: Math.max(1, Math.round(first.height * scale)) };
  }
  return { aspect: choice.replace("-4k", "") as Deck["aspect"], pageUnit: "px", resolution: choice.endsWith("-4k") ? "4k" : "hd" };
}

export function pdfPageSlide(page: { number: number; width: number; height: number }, size: Parameters<typeof slideDimensions>[0], media: { url: string; id: string; alt: string }): Slide {
  const frame = slideDimensions(size);
  const scale = Math.min(frame.width / page.width, frame.height / page.height);
  const width = page.width * scale, height = page.height * scale;
  return { ...newSlide(), name: `Page ${page.number}`, objects: [{
    ...newSlideBlock("image"), x: (frame.width - width) / 2, y: (frame.height - height) / 2,
    width, height, mediaUrl: media.url, mediaId: media.id, alt: media.alt,
    imageFit: "contain", imageRatio: page.width / page.height, locked: true,
  }] };
}
