import type { NextRequest } from "next/server";

import { getSession } from "@/lib/session";

import { writeHit, type HitKind, type HitRecord } from "./log";
import { getAnalyticsSettings } from "./settings";
import { classifySource, DIRECT_SOURCE, type TrafficSource } from "./source";
import { dayKeyOf } from "./time";
import { VISITOR_COOKIE, VISIT_COOKIE, resolveIdentity } from "./visitor";

/**
 * Writing one hit, from whichever route observed it.
 *
 * Two routes do: the beacon, for page and image views, and the media route, for
 * downloads. They share this so the identity handling, the bot rule and the
 * day boundary cannot drift apart between them — the failure mode where
 * downloads quietly file under a different day than the views that led to them.
 */

const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|semrush|ahrefs|screaming frog/i;

const MAX_UA = 400;
const MAX_LABEL = 200;

export function isBot(userAgent: string): boolean {
  return !userAgent || BOT_PATTERN.test(userAgent);
}

/**
 * The client address.
 *
 * Behind a proxy the socket address is the proxy's, so the forwarded chain is
 * checked first and its leftmost entry — the original client — is taken.
 */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    ""
  ).slice(0, 64);
}

export type RecordedCookie = { name: string; value: string; maxAge: number };

/**
 * Records a hit and reports back any identity cookies the caller should set.
 *
 * @param mintIdentity when false, an unknown visitor is logged with the ids it
 * already has and no new ones are issued. The media route passes false: its
 * responses are cached, and a `Set-Cookie` on a cacheable response would hand
 * one visitor's id to the next reader of the same file.
 */
export async function recordHit(
  request: NextRequest,
  input: {
    kind: HitKind;
    /** Path the event belongs to, for context. */
    path: string;
    /** Landing URL, for campaign parameters. Defaults to the request's own. */
    url?: string;
    referrer?: string;
    /** Display name for image and download events. */
    label?: string;
  }
): Promise<{ recorded: boolean; cookies: RecordedCookie[] }> {
  const none = { recorded: false, cookies: [] as RecordedCookie[] };

  const settings = await getAnalyticsSettings();
  if (!settings.enabled) return none;

  const userAgent = request.headers.get("user-agent") ?? "";
  if (isBot(userAgent)) return none;

  /*
   * What the request reveals about the client, for when the cookie does not
   * come back. The user agent joins the address so that a household or an
   * office behind one address is not collapsed into a single visitor whenever
   * its browsers differ — which, between phones and desktops, they usually do.
   */
  const ip = clientIp(request);
  const fallbackSeed = ip || userAgent ? `${ip}|${userAgent}` : "";

  const { identity, cookies } = await resolveIdentity(
    {
      visitor: request.cookies.get(VISITOR_COOKIE)?.value,
      visit: request.cookies.get(VISIT_COOKIE)?.value,
    },
    fallbackSeed
  );

  // An image view or a download happens inside a visit that a page view already
  // classified, so re-deriving a source from an in-page action would overwrite
  // it with "direct". Only a page view carries a source.
  const source: TrafficSource =
    input.kind === "page"
      ? classifySource(
          input.url ?? request.nextUrl.href,
          input.referrer ?? "",
          request.nextUrl.hostname
        )
      : DIRECT_SOURCE;

  // Read from the session cookie, never from the request body: this is what
  // decides whether the hit can be filtered out, so the client cannot claim it.
  const session = await getSession().catch(() => null);

  const now = new Date();
  const hit: HitRecord = {
    t: now.toISOString(),
    v: identity.visitorId,
    s: identity.visitId,
    p: input.path,
    r: input.referrer ?? "",
    src: source.source,
    med: source.medium,
    cmp: source.campaign,
    ip,
    ua: userAgent.slice(0, MAX_UA),
    k: input.kind,
  };

  if (input.label) hit.lbl = input.label.slice(0, MAX_LABEL);
  if (session?.userId) hit.u = session.userId;
  if (identity.usedFallback) hit.f = 1;

  await writeHit(dayKeyOf(now, settings.timezone), hit);

  return { recorded: true, cookies };
}
