/**
 * Where a visit came from.
 *
 * Two signals, in priority order. An explicit campaign parameter on the URL is
 * what the person sharing the link *said*, so it wins; the referring host is
 * what the browser *observed*, and is the fallback. A visit with neither is
 * direct — someone typing the address, or a client that strips referrers.
 *
 * The medium matters as much as the name: an editor wants to know whether the
 * month's traffic came from social, search or email before they care which
 * network in particular.
 */

export const ANALYTICS_MEDIUMS = [
  "direct",
  "social",
  "search",
  "email",
  "referral",
  "campaign",
] as const;

export type AnalyticsMedium = (typeof ANALYTICS_MEDIUMS)[number];

export type TrafficSource = {
  /** Network or site name, lowercase: `facebook`, `google`, `direct`. */
  source: string;
  medium: AnalyticsMedium;
  /** From `utm_campaign`, when the link carried one. */
  campaign: string;
};

export const DIRECT_SOURCE: TrafficSource = {
  source: "direct",
  medium: "direct",
  campaign: "",
};

/**
 * Hosts that identify a network, matched on the registrable part so every
 * regional and shortener variant lands on the same name — `m.facebook.com`,
 * `facebook.co.uk` and `fb.me` are all Facebook to a report.
 */
const SOCIAL_HOSTS: [RegExp, string][] = [
  [/(^|\.)facebook\.[a-z.]+$/, "facebook"],
  [/(^|\.)fb\.(me|com)$/, "facebook"],
  [/(^|\.)messenger\.com$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)l\.instagram\.com$/, "instagram"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)(twitter|x)\.com$/, "x"],
  [/(^|\.)t\.co$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)lnkd\.in$/, "linkedin"],
  [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"],
  [/(^|\.)pin\.it$/, "pinterest"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)redd\.it$/, "reddit"],
  [/(^|\.)youtube\.com$/, "youtube"],
  [/(^|\.)youtu\.be$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
  [/(^|\.)whatsapp\.com$/, "whatsapp"],
  [/(^|\.)telegram\.(org|me)$/, "telegram"],
  [/(^|\.)t\.me$/, "telegram"],
  [/(^|\.)discord\.(com|gg)$/, "discord"],
  [/(^|\.)tumblr\.com$/, "tumblr"],
  [/(^|\.)nextdoor\.com$/, "nextdoor"],
  [/(^|\.)vimeo\.com$/, "vimeo"],
  [/(^|\.)mastodon\.[a-z.]+$/, "mastodon"],
  [/(^|\.)bsky\.app$/, "bluesky"],
];

const SEARCH_HOSTS: [RegExp, string][] = [
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)bing\.com$/, "bing"],
  [/(^|\.)duckduckgo\.com$/, "duckduckgo"],
  [/(^|\.)search\.yahoo\.[a-z.]+$/, "yahoo"],
  [/(^|\.)ecosia\.org$/, "ecosia"],
  [/(^|\.)baidu\.com$/, "baidu"],
  [/(^|\.)yandex\.[a-z.]+$/, "yandex"],
  [/(^|\.)brave\.com$/, "brave"],
  [/(^|\.)startpage\.com$/, "startpage"],
];

const EMAIL_HOSTS: [RegExp, string][] = [
  [/(^|\.)mail\.google\.com$/, "gmail"],
  [/(^|\.)outlook\.(com|live\.com|office\.com)$/, "outlook"],
  [/(^|\.)mail\.yahoo\.[a-z.]+$/, "yahoo-mail"],
];

/**
 * Click identifiers the networks append themselves. Present even when nobody
 * added a `utm_source`, and often the only signal left once a browser has
 * stripped the referrer — which most now do on cross-site navigation.
 */
const CLICK_IDS: [string, string, AnalyticsMedium][] = [
  ["fbclid", "facebook", "social"],
  ["igshid", "instagram", "social"],
  ["twclid", "x", "social"],
  ["ttclid", "tiktok", "social"],
  ["li_fat_id", "linkedin", "social"],
  ["epik", "pinterest", "social"],
  ["gclid", "google", "search"],
  ["gbraid", "google", "search"],
  ["wbraid", "google", "search"],
  ["msclkid", "bing", "search"],
  ["yclid", "yandex", "search"],
];

function matchHost(host: string, table: [RegExp, string][]): string {
  for (const [pattern, name] of table) {
    if (pattern.test(host)) return name;
  }
  return "";
}

/** `utm_medium` values map onto our own shorter vocabulary. */
function mediumFromUtm(value: string): AnalyticsMedium | null {
  const medium = value.toLowerCase();
  if (!medium) return null;
  if (medium.includes("social") || medium === "sm") return "social";
  if (medium.includes("cpc") || medium.includes("ppc") || medium.includes("organic")) {
    return "search";
  }
  if (medium.includes("email") || medium.includes("newsletter")) return "email";
  if (medium.includes("referral")) return "referral";
  return "campaign";
}

/**
 * Reads a source out of the landing URL's query and the referring URL.
 *
 * @param url the address the visitor landed on, carrying any campaign params
 * @param referrer the referring document, empty when there was none
 * @param siteHost this site's own host, so internal navigation is not a referral
 */
export function classifySource(
  url: string,
  referrer: string,
  siteHost: string
): TrafficSource {
  const params = safeParams(url);

  const utmSource = (params.get("utm_source") ?? "").trim().toLowerCase();
  const utmMedium = (params.get("utm_medium") ?? "").trim().toLowerCase();
  const campaign = (params.get("utm_campaign") ?? "").trim().toLowerCase().slice(0, 120);

  if (utmSource) {
    // A tagged link is an explicit statement of origin. Where the tagger named
    // a network we recognise, its medium is more reliable than a hand-typed
    // `utm_medium`, which is where these get mistyped.
    const known =
      matchHost(`${utmSource}.com`, SOCIAL_HOSTS) ||
      matchHost(utmSource, SOCIAL_HOSTS);
    const medium = known
      ? "social"
      : mediumFromUtm(utmMedium) ?? "campaign";
    return { source: known || utmSource.slice(0, 60), medium, campaign };
  }

  for (const [param, source, medium] of CLICK_IDS) {
    if (params.get(param)) return { source, medium, campaign };
  }

  const referrerHost = hostOf(referrer);
  if (!referrerHost) return { ...DIRECT_SOURCE, campaign };

  // Moving between pages of this site is not a new source; the visit keeps
  // whatever brought it here.
  if (siteHost && sameSite(referrerHost, siteHost)) {
    return { ...DIRECT_SOURCE, campaign };
  }

  // Webmail is checked first: a link opened in Gmail refers from
  // `mail.google.com`, which the search table's Google pattern would otherwise
  // claim — and a newsletter click is not a search.
  const email = matchHost(referrerHost, EMAIL_HOSTS);
  if (email) return { source: email, medium: "email", campaign };

  const social = matchHost(referrerHost, SOCIAL_HOSTS);
  if (social) return { source: social, medium: "social", campaign };

  const search = matchHost(referrerHost, SEARCH_HOSTS);
  if (search) return { source: search, medium: "search", campaign };

  return { source: referrerHost.slice(0, 60), medium: "referral", campaign };
}

function safeParams(url: string): URLSearchParams {
  try {
    return new URL(url, "http://localhost").searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/** Lowercase host with any `www.` dropped, or empty when unparseable. */
export function hostOf(url: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sameSite(a: string, b: string): boolean {
  const left = a.replace(/^www\./, "");
  const right = b.toLowerCase().replace(/^www\./, "");
  return left === right || left.endsWith(`.${right}`);
}
