import path from "node:path";
import { createRequire } from "node:module";
import type { Canvas, SKRSContext2D } from "@napi-rs/canvas";

export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 200;
const RENDER_EDGE = 2560;

export class PdfImportError extends Error {}

export type PdfSlidePage = {
  number: number;
  width: number;
  height: number;
  png: Buffer;
};

/** Render sequentially so a large PDF never holds all of its page bitmaps in RAM. */
export async function renderPdfSlides(
  data: Uint8Array,
  onPage: (page: PdfSlidePage) => Promise<void>,
  signal?: AbortSignal,
) {
  if (!data.length || data.length > MAX_PDF_BYTES)
    throw new PdfImportError("Choose a PDF smaller than 50 MB.");
  if (!Buffer.from(data.subarray(0, 1024)).includes(Buffer.from("%PDF-")))
    throw new PdfImportError("This file is not a PDF.");

  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfRequire = createRequire(path.join(process.cwd(), "package.json"));
  const root = path.dirname(pdfRequire.resolve("pdfjs-dist/package.json"));
  const resourcePath = (folder: string) => path.join(root, folder).replaceAll("\\", "/") + "/";
  const loading = getDocument({
    data,
    cMapUrl: resourcePath("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: resourcePath("standard_fonts"),
    wasmUrl: resourcePath("wasm"),
    useSystemFonts: false,
  });
  try {
    const pdf = await loading.promise.catch((error: unknown) => {
      if (error instanceof Error && error.name === "PasswordException")
        throw new PdfImportError("This PDF is password-protected. Import an unlocked copy.");
      throw new PdfImportError("This PDF could not be read. Try exporting a new copy.");
    });
    if (pdf.numPages < 1 || pdf.numPages > MAX_PDF_PAGES)
      throw new PdfImportError("A presentation can contain 1 to 200 PDF pages.");

    const factory = pdf.canvasFactory as {
      create: (width: number, height: number) => { canvas: Canvas; context: SKRSContext2D };
      destroy: (surface: { canvas: Canvas; context: SKRSContext2D }) => void;
    };
    for (let number = 1; number <= pdf.numPages; number++) {
      signal?.throwIfAborted();
      const page = await pdf.getPage(number);
      const natural = page.getViewport({ scale: 1 });
      if (![natural.width, natural.height].every((n) => Number.isFinite(n) && n > 0))
        throw new PdfImportError(`Page ${number} has an invalid size.`);
      const viewport = page.getViewport({ scale: RENDER_EDGE / Math.max(natural.width, natural.height) });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const surface = factory.create(width, height);
      try {
        const render = page.render({
          canvas: null,
          canvasContext: surface.context as unknown as CanvasRenderingContext2D,
          viewport,
          background: "rgb(255,255,255)",
        });
        const abort = () => render.cancel();
        signal?.addEventListener("abort", abort, { once: true });
        try { await render.promise; }
        finally { signal?.removeEventListener("abort", abort); }
        signal?.throwIfAborted();
        await onPage({ number, width, height, png: await surface.canvas.encode("png") });
      } finally {
        factory.destroy(surface);
        page.cleanup();
      }
    }
  } finally {
    await loading.destroy();
  }
}
