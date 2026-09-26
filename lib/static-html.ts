export const MAX_STATIC_HTML_BYTES = 5 * 1024 * 1024;
export const STATIC_HTML_PREFIXES = ["project", "report", "special"] as const;

export function staticHtmlSlug(filename: string): string {
  if (!/\.html?$/i.test(filename) || /[/\\\x00]/.test(filename)) {
    throw new Error("Choose an .html or .htm file.");
  }
  const slug = filename.replace(/\.html?$/i, "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || slug.length > 120) {
    throw new Error("Use a filename that produces a slug of 1–120 letters, numbers or hyphens.");
  }
  return slug;
}

export function validStaticHtmlSlug(slug: string): boolean {
  return slug.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export async function readStaticHtml(file: File) {
  const slug = staticHtmlSlug(file.name);
  if (!file.size || file.size > MAX_STATIC_HTML_BYTES) {
    throw new Error("Choose a nonempty HTML file no larger than 5 MB.");
  }
  let html: string;
  try {
    html = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error("Save the HTML file using UTF-8 encoding.");
  }
  if (!html.trim() || html.includes("\0")) throw new Error("Choose a valid HTML text file.");
  return { slug, html, originalName: file.name, size: file.size };
}

export function staticHtmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      // Inline scripts work, but uploaded documents never inherit the app's origin.
      "Content-Security-Policy": "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; font-src data: blob:; media-src data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
