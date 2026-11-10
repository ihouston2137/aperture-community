/** Parse an HTTP(S) origin without accepting credentials or opaque origins. */
function httpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.origin : null;
  } catch { return null; }
}

/**
 * A proxy may expose a different public origin from request.url. Trust the
 * configured site URL, not arbitrary client-supplied forwarded host headers.
 * Requests without Origin retain support for authenticated non-browser clients.
 */
export function isAllowedRequestOrigin(request: Request, publicSiteUrl?: string): boolean {
  const header = request.headers.get("origin");
  if (header === null) return true;
  const origin = httpOrigin(header);
  // Origin must contain only an origin, not a path, query, or fragment.
  if (!origin || header !== origin) return false;
  return origin === httpOrigin(request.url)
    || (!!publicSiteUrl && origin === httpOrigin(publicSiteUrl));
}
