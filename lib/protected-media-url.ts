/**
 * Local media is never served straight from `/public`. Public URLs are rewritten
 * through `/api/media?i=<token>` so the route handler can apply safe-path
 * checks, range requests, ETags and cache headers.
 *
 * This module is imported by client components, so it must stay dependency-free.
 */

export const PROTECTED_MEDIA_ROOTS = ["/uploads/", "/images/"] as const;

export function isProtectedMediaPath(src: string): boolean {
  if (!src) return false;
  return PROTECTED_MEDIA_ROOTS.some((root) => src.startsWith(root));
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(value, "utf8").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

export function encodeMediaToken(path: string): string {
  return toBase64Url(path);
}

export function decodeMediaToken(token: string): string | null {
  try {
    const decoded = fromBase64Url(token);
    return decoded || null;
  } catch {
    return null;
  }
}

/** Rewrite a local media path through the protected media route. */
export function protectedMediaUrl(src: string | null | undefined): string {
  if (!src) return "";
  if (!isProtectedMediaPath(src)) return src;
  const [path] = src.split("?");
  return `/api/media?i=${encodeMediaToken(path)}`;
}

/** Strip anything that would escape the allowed media roots. */
export function sanitizeMediaPath(src: string | null | undefined): string {
  if (!src) return "";
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes("..")) return "";
  if (trimmed.startsWith("/api/media?i=")) {
    const token = trimmed.slice("/api/media?i=".length);
    const decoded = decodeMediaToken(token);
    return decoded && isProtectedMediaPath(decoded) ? decoded : "";
  }
  if (!trimmed.startsWith("/")) return "";
  return trimmed;
}
