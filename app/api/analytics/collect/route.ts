import type { NextRequest } from "next/server";

import { resolveImageLabel } from "@/lib/analytics/image-label";
import { recordHit, type RecordedCookie } from "@/lib/analytics/record";

/**
 * The collection endpoint.
 *
 * A beacon rather than a server-side hook, for two reasons: the referrer and
 * the landing query live in the browser and are gone by the time a cached page
 * renders, and a request that never reaches React is a request that never
 * counted a crawler as a reader.
 *
 * Nothing here is allowed to fail loudly. A visit is worth recording, but never
 * at the cost of the page the visitor is trying to read, so every branch ends
 * in a 204.
 */

/** Kept out of the summaries; none of them are a visitor reading the site. */
const IGNORED_PREFIXES = ["/admin", "/api", "/login", "/_next"];

const MAX_PATH = 512;
const MAX_REFERRER = 1024;

function noContent(cookies: RecordedCookie[] = []) {
  const headers = new Headers();
  const secure = process.env.NODE_ENV === "production";

  for (const cookie of cookies) {
    headers.append(
      "set-cookie",
      [
        `${cookie.name}=${cookie.value}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${cookie.maxAge}`,
        secure ? "Secure" : "",
      ]
        .filter(Boolean)
        .join("; ")
    );
  }

  return new Response(null, { status: 204, headers });
}

export async function POST(request: NextRequest) {
  try {
    // `sendBeacon` cannot set a content type, so the body is read as text and
    // parsed here rather than through `request.json()`.
    const raw = await request.text();
    let body: {
      url?: unknown;
      referrer?: unknown;
      kind?: unknown;
      collectionId?: unknown;
      mediaId?: unknown;
    };
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return noContent();
    }

    const landing = String(body.url ?? "").slice(0, MAX_PATH + 512);
    const referrer = String(body.referrer ?? "").slice(0, MAX_REFERRER);
    if (!landing) return noContent();

    let pathname: string;
    try {
      pathname = new URL(landing, request.nextUrl.origin).pathname.slice(0, MAX_PATH);
    } catch {
      return noContent();
    }

    if (IGNORED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return noContent();
    }

    if (body.kind === "image") {
      const label = await resolveImageLabel(
        String(body.collectionId ?? ""),
        String(body.mediaId ?? "")
      );
      // An image we cannot name is one we cannot report, so it is dropped
      // rather than counted under a blank row.
      if (!label) return noContent();

      const { cookies } = await recordHit(request, {
        kind: "image",
        path: pathname,
        label,
      });
      return noContent(cookies);
    }

    const { cookies } = await recordHit(request, {
      kind: "page",
      path: pathname,
      url: landing,
      referrer,
    });

    return noContent(cookies);
  } catch {
    return noContent();
  }
}
