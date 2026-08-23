import { SignJWT, jwtVerify } from "jose";

/**
 * The anonymous identity behind a hit.
 *
 * Two ids, because "visitors" and "visits" are different questions. The visitor
 * id is long-lived and answers "how many people"; the visit id expires after a
 * gap in activity and answers "how many times they came". Both are random —
 * they are derived from nothing about the person, and carry no claim beyond
 * their own value, so the pair identifies a browser and nothing else.
 *
 * They are signed rather than stored bare so a hand-written cookie cannot inject
 * an arbitrary id and inflate a report. The signature is the whole point of the
 * token; there is nothing secret inside it.
 */

export const VISITOR_COOKIE = "aperture_vid";
export const VISIT_COOKIE = "aperture_vsid";

/** Two years, the usual horizon for a returning-visitor count. */
export const VISITOR_MAX_AGE = 60 * 60 * 24 * 730;
/** Thirty minutes of inactivity ends a visit, the long-standing convention. */
export const VISIT_MAX_AGE = 60 * 30;

const ISSUER = "aperture/analytics";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Copy .env.example to .env.local.");
  }
  return new TextEncoder().encode(secret);
}

/** 128 bits of randomness: collision-free in practice, short in a cookie. */
function randomId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A stable id derived from what the request itself reveals.
 *
 * The fallback for a browser that does not give the cookie back. Keyed with the
 * session secret, so the address cannot be recovered from an id, and truncated
 * to the same shape a random id has — nothing downstream can tell them apart,
 * which is the point: one visitor is one visitor however it was recognised.
 */
/** `TextEncoder` yields a view that may sit on a shared buffer; WebCrypto wants its own. */
function toBuffer(input: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.byteLength);
  new Uint8Array(buffer).set(input);
  return buffer;
}

async function derivedId(seed: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    toBuffer(secretKey()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    toBuffer(new TextEncoder().encode(seed))
  );
  return Array.from(new Uint8Array(signature).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

/**
 * Which half hour a derived visit belongs to.
 *
 * A cookie-backed visit slides: every hit pushes its expiry out, so a long
 * sitting stays one visit. A derived one has nothing to slide, so the clock is
 * cut into fixed blocks instead. The cost is that a visit straddling a boundary
 * reads as two — an over-count of at most one per sitting, and the price of
 * being able to reach the same answer twice from the same log.
 */
function visitWindow(nowMs: number): string {
  return String(Math.floor(nowMs / (VISIT_MAX_AGE * 1000)));
}

async function signId(id: string, maxAge: number): Promise<string> {
  return new SignJWT({ aid: id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secretKey());
}

async function readId(token: string | undefined): Promise<string> {
  if (!token) return "";
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
    });
    const id = payload.aid;
    return typeof id === "string" && /^[0-9a-f]{32}$/.test(id) ? id : "";
  } catch {
    // Expired, tampered with, or signed under a rotated secret. All three mean
    // the same thing here: this browser needs a new id.
    return "";
  }
}

export type AnalyticsIdentity = {
  visitorId: string;
  visitId: string;
  /** True on the visitor's very first hit — the one that counts as new. */
  isNewVisitor: boolean;
  /** True on the first hit of a visit, including a returning visitor's. */
  isNewVisit: boolean;
  /**
   * True when either id had to be derived because no signed token came back.
   * Recorded on the hit so the reports can say how much of a period was
   * counted this way.
   */
  usedFallback: boolean;
};

export type IdentityCookie = {
  name: string;
  value: string;
  maxAge: number;
};

/**
 * Resolves both ids: from the signed cookies when they come back, and from the
 * request itself when they do not.
 *
 * A returned token is always authoritative. The fallback exists because a
 * browser that refuses cookies would otherwise be handed a fresh random id on
 * every single hit, and one reader would be counted as one visitor per page
 * they opened — an inflation with no upper bound, and worst exactly where the
 * numbers are least suspected of being wrong.
 *
 * The derived id is also what seeds the cookie, rather than a random value
 * alongside it. That is what makes the two paths agree: a browser that accepts
 * the cookie returns the same id the request would have derived anyway, so a
 * visitor is not counted twice for having taken the cookie on their second hit.
 *
 * The cost is that two people sharing an address and a browser version, both
 * arriving without a cookie, are one visitor until one of them keeps a cookie.
 * That is the usual trade for cookieless counting, and it is the direction that
 * under-counts rather than over-counts.
 *
 * @param fallbackSeed something stable about the request — address and user
 * agent. Empty when the request reveals neither, where a random id is all that
 * is left.
 */
export async function resolveIdentity(
  tokens: { visitor?: string; visit?: string },
  fallbackSeed = ""
): Promise<{ identity: AnalyticsIdentity; cookies: IdentityCookie[] }> {
  const existingVisitor = await readId(tokens.visitor);
  const existingVisit = await readId(tokens.visit);

  const canDerive = fallbackSeed.trim().length > 0;

  const visitorId =
    existingVisitor ||
    (canDerive ? await derivedId(`visitor:${fallbackSeed}`) : randomId());

  const visitId =
    existingVisit ||
    (canDerive
      ? await derivedId(`visit:${fallbackSeed}:${visitWindow(Date.now())}`)
      : randomId());

  const cookies: IdentityCookie[] = [
    {
      name: VISIT_COOKIE,
      value: await signId(visitId, VISIT_MAX_AGE),
      maxAge: VISIT_MAX_AGE,
    },
  ];

  // Only re-signed when new: rewriting it on every hit would push the two-year
  // expiry out indefinitely and re-sign a token that has not changed.
  if (!existingVisitor) {
    cookies.push({
      name: VISITOR_COOKIE,
      value: await signId(visitorId, VISITOR_MAX_AGE),
      maxAge: VISITOR_MAX_AGE,
    });
  }

  return {
    identity: {
      visitorId,
      visitId,
      isNewVisitor: !existingVisitor,
      isNewVisit: !existingVisit,
      usedFallback: canDerive && (!existingVisitor || !existingVisit),
    },
    cookies,
  };
}
