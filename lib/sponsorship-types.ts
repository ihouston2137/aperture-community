/**
 * The shapes and pure helpers behind sponsorships.
 *
 * Split from `lib/sponsorships.ts` because the client components that render
 * them import from here, and that module reaches the database — importing it
 * from the browser bundle would drag Mongoose in with it.
 */

import {
  protectedMediaUrl,
  sanitizeMediaPath,
} from "./protected-media-url";

/* ------------------------------------------------------------------ Money */

/**
 * Amounts are held in whole cents.
 *
 * A donation total is added up and reported, and adding floating-point dollars
 * loses a cent here and there once there are enough of them. Cents are integers
 * and stay exact; dollars are only ever a way of showing them.
 */
export function dollarsToCents(value: unknown): number {
  const text = String(value ?? "")
    .replace(/[$,\s]/g, "")
    .trim();
  if (!text) return 0;

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

export function centsToDollarInput(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2);
}

export function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

/* ---------------------------------------------------------------- Sponsors */

export const SPONSOR_TYPES = [
  "business",
  "person",
  "school",
  "nonprofit",
  "government",
  "foundation",
  "other",
] as const;

export type SponsorType = (typeof SPONSOR_TYPES)[number];

export const SPONSOR_TYPE_LABELS: Record<SponsorType, string> = {
  business: "Business",
  person: "Person",
  school: "School",
  nonprofit: "Non-profit",
  government: "Government",
  foundation: "Foundation",
  other: "Other",
};

export function sponsorType(value: unknown): SponsorType {
  return SPONSOR_TYPES.includes(value as SponsorType)
    ? (value as SponsorType)
    : "business";
}

/**
 * The industries offered in the picker.
 *
 * Deliberately broad and in plain English rather than a standard classification
 * code: this is read by whoever is filling the form in, and "Trades and home
 * services" tells them more than "NAICS 23". Anything stored that is not on the
 * list is kept and shown, so a value typed before the list existed is never
 * quietly dropped.
 */
export const SPONSOR_INDUSTRIES = [
  "Accounting",
  "Advertising and marketing",
  "Agriculture",
  "Architecture",
  "Arts and culture",
  "Automotive",
  "Banking and finance",
  "Construction",
  "Consulting",
  "Education",
  "Energy and utilities",
  "Engineering",
  "Entertainment and media",
  "Food and beverage",
  "Government",
  "Healthcare",
  "Hospitality and tourism",
  "Insurance",
  "Legal",
  "Logistics and transport",
  "Manufacturing",
  "Non-profit",
  "Pharmaceuticals",
  "Property and real estate",
  "Retail",
  "Sport and recreation",
  "Technology",
  "Telecommunications",
  "Trades and home services",
  "Other",
] as const;

/** Rough scale, in the terms a sponsor would describe itself. */
export const SPONSOR_SIZES = [
  "",
  "1-10",
  "11-50",
  "51-200",
  "201-1000",
  "1001+",
] as const;

export type SponsorSize = (typeof SPONSOR_SIZES)[number];

export const SPONSOR_SIZE_LABELS: Record<SponsorSize, string> = {
  "": "Not recorded",
  "1-10": "1–10 people",
  "11-50": "11–50 people",
  "51-200": "51–200 people",
  "201-1000": "201–1,000 people",
  "1001+": "Over 1,000 people",
};

export function sponsorSize(value: unknown): SponsorSize {
  return SPONSOR_SIZES.includes(value as SponsorSize) ? (value as SponsorSize) : "";
}

/**
 * A label a site puts on its sponsors — "Local business", "Alumni-owned",
 * "Season partner".
 *
 * A sponsor can carry several: these are how a community groups the people who
 * give to it, and one sponsor is often more than one thing at once. Separate
 * from `type` and `industry`, which describe what a sponsor *is* rather than
 * how this community thinks of them.
 */
export type SponsorCategorySummary = {
  _id: string;
  name: string;
  description: string;
};

export type SponsorLink = { label: string; href: string };

/** A logo cleared for use, so nobody has to ask again before printing one. */
export type SponsorLogo = {
  label: string;
  url: string;
  mediaId: string;
  /** The one to show on the site. At most one per sponsor. */
  isPrimary: boolean;
};

export type SponsorContact = {
  name: string;
  title: string;
  email: string;
  phone: string;
};

/**
 * A named tier a sponsor is recognised at — Gold, Silver, Partner.
 *
 * Set by hand rather than worked out from what has been given: recognition is a
 * decision somebody makes, and a sponsor is often held at a level through a
 * quiet year.
 */
export type RecognitionLevelSummary = {
  _id: string;
  name: string;
  description: string;
  /** Highest first when sorted; ties fall back to the name. */
  rank: number;
  /** What a sponsor at this level receives. */
  benefitIds: string[];
  /**
   * A level given quietly.
   *
   * Sponsors recognised at it are not named on the website or anywhere else
   * outside the signed-in pages where sponsorships are managed. Some people
   * give on the condition that nobody is told.
   */
  isAnonymous: boolean;
};

/** Something a sponsor receives for being recognised at a level. */
export type SponsorBenefitSummary = {
  _id: string;
  name: string;
  description: string;
};

/**
 * Whether a sponsor may be named outside the admin.
 *
 * The one place that decision is made, so a page added later cannot forget to
 * ask. A sponsor with no level is not anonymous — anonymity is something a
 * level carries, not a default.
 */
export function isPubliclyNamed(
  sponsor: { recognitionLevelId: string },
  levels: RecognitionLevelSummary[]
): boolean {
  if (!sponsor.recognitionLevelId) return true;
  const level = levels.find((entry) => entry._id === sponsor.recognitionLevelId);
  return !level?.isAnonymous;
}

export function sortRecognitionLevels(
  levels: RecognitionLevelSummary[]
): RecognitionLevelSummary[] {
  return [...levels].sort(
    (a, b) => b.rank - a.rank || a.name.localeCompare(b.name)
  );
}

export type SponsorSummary = {
  _id: string;
  name: string;
  type: SponsorType;
  /** Who they are, in the site's own words. */
  description: string;
  industry: string;
  size: SponsorSize;
  email: string;
  phone: string;
  address: string;
  website: string;
  links: SponsorLink[];
  logos: SponsorLogo[];
  contacts: SponsorContact[];
  notes: string;
  /** Empty when the sponsor is not recognised at any level. */
  recognitionLevelId: string;
  categoryIds: string[];
};

/* --------------------------------------------------------------- Campaigns */

/**
 * Whether a campaign is still being worked on.
 *
 * Closing one changes nothing about what it raised — the record stands. It
 * says only that nobody is chasing it any more, so it can be kept out of the
 * way without being deleted.
 */
export const CAMPAIGN_STATUSES = ["active", "closed"] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: "Active",
  closed: "Closed",
};

export function campaignStatus(value: unknown): CampaignStatus {
  return value === "closed" ? "closed" : "active";
}

/**
 * Who looks after one sponsor for one campaign.
 *
 * Held on the campaign rather than on the sponsor: the same sponsor can be
 * looked after by different people from one year's campaign to the next.
 */
export type CampaignAssignment = {
  sponsorId: string;
  memberIds: string[];
};

export type CampaignSummary = {
  _id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  /** ISO dates, or empty for a campaign with no fixed start or end. */
  startDate: string;
  endDate: string;
  goalCents: number;
  assignments: CampaignAssignment[];
};

/* --------------------------------------------------------------- Donations */

/**
 * Where a gift has got to.
 *
 * A pledge that has not arrived is worth recording — it is what the next
 * conversation is about — but it is not the same as money in hand, so the two
 * are counted apart wherever a total is shown.
 */
export const DONATION_STATUSES = [
  "proposed",
  "in-progress",
  "complete",
  "cancelled",
] as const;

export type DonationStatus = (typeof DONATION_STATUSES)[number];

export const DONATION_STATUS_LABELS: Record<DonationStatus, string> = {
  proposed: "Proposed",
  "in-progress": "In progress",
  complete: "Complete",
  cancelled: "Cancelled",
};

export function donationStatus(value: unknown): DonationStatus {
  return DONATION_STATUSES.includes(value as DonationStatus)
    ? (value as DonationStatus)
    : "proposed";
}

/** A cancelled gift never happened, so it is left out of every total. */
export function countsTowardTotals(status: DonationStatus): boolean {
  return status !== "cancelled";
}

/** Money in hand, as opposed to a gift still being worked on. */
export function isRealised(status: DonationStatus): boolean {
  return status === "complete";
}

export const DONATION_KINDS = ["monetary", "in-kind"] as const;

export type DonationKind = (typeof DONATION_KINDS)[number];

export const DONATION_KIND_LABELS: Record<DonationKind, string> = {
  monetary: "Monetary",
  "in-kind": "In-kind",
};

export function donationKind(value: unknown): DonationKind {
  return value === "in-kind" ? "in-kind" : "monetary";
}

/**
 * The order statuses are shown in, and the one place their colours are decided.
 *
 * Green for what has arrived, yellow for what is being worked on, blue for what
 * has only been proposed, red for what fell through — the same reading wherever
 * a status appears, so a colour never has to be looked up twice.
 */
export const DONATION_STATUS_ORDER: DonationStatus[] = [
  "complete",
  "in-progress",
  "proposed",
  "cancelled",
];

/** The class the colour hangs off. The status is the name; CSS holds the value. */
export function statusTone(status: DonationStatus): string {
  return `tone-${status}`;
}

/**
 * What a set of gifts amounts to, split by status and by kind.
 *
 * Rows worth nothing are left out entirely: a campaign that has taken no in-kind
 * gifts should not carry a line saying so.
 */
export type DonationBreakdownRow = {
  status: DonationStatus;
  kind: DonationKind;
  cents: number;
};

export function donationBreakdown(
  donations: { status: DonationStatus; kind: DonationKind; valueCents: number }[]
): DonationBreakdownRow[] {
  const totals = new Map<string, DonationBreakdownRow>();

  for (const donation of donations) {
    if (!donation.valueCents) continue;

    const key = `${donation.status}/${donation.kind}`;
    const row = totals.get(key) ?? {
      status: donation.status,
      kind: donation.kind,
      cents: 0,
    };
    row.cents += donation.valueCents;
    totals.set(key, row);
  }

  return [...totals.values()]
    .filter((row) => row.cents > 0)
    .sort(
      (a, b) =>
        DONATION_STATUS_ORDER.indexOf(a.status) -
          DONATION_STATUS_ORDER.indexOf(b.status) || a.kind.localeCompare(b.kind)
    );
}

/**
 * What one sponsor has given, as the chips shown on their row.
 *
 * Money is read by status, because the difference between a cheque banked and a
 * cheque promised is the whole question. An in-kind gift is not money and never
 * will be, so it is read only as arrived or not: dark for what has come, light
 * for what is still coming. A cancelled gift stays red either way.
 */
export type SponsorChip = {
  key: string;
  /** The class the colour hangs off. */
  tone: string;
  label: string;
  cents: number;
};

export function sponsorChips(
  donations: { status: DonationStatus; kind: DonationKind; valueCents: number }[]
): SponsorChip[] {
  const monetary = new Map<DonationStatus, number>();
  let inKindComplete = 0;
  let inKindPending = 0;
  let inKindCancelled = 0;

  for (const donation of donations) {
    if (!donation.valueCents) continue;

    if (donation.kind === "monetary") {
      monetary.set(
        donation.status,
        (monetary.get(donation.status) ?? 0) + donation.valueCents
      );
    } else if (donation.status === "complete") {
      inKindComplete += donation.valueCents;
    } else if (donation.status === "cancelled") {
      inKindCancelled += donation.valueCents;
    } else {
      // Proposed and in progress are one thing here: both mean not yet given.
      inKindPending += donation.valueCents;
    }
  }

  const chips: SponsorChip[] = [];

  for (const status of DONATION_STATUS_ORDER) {
    const cents = monetary.get(status) ?? 0;
    if (cents > 0) {
      chips.push({
        key: `monetary-${status}`,
        tone: statusTone(status),
        label: DONATION_STATUS_LABELS[status],
        cents,
      });
    }
  }

  if (inKindComplete > 0) {
    chips.push({
      key: "in-kind-complete",
      tone: "tone-in-kind",
      label: "In-kind",
      cents: inKindComplete,
    });
  }
  if (inKindPending > 0) {
    chips.push({
      key: "in-kind-pending",
      tone: "tone-in-kind-pending",
      label: "In-kind to come",
      cents: inKindPending,
    });
  }
  if (inKindCancelled > 0) {
    chips.push({
      key: "in-kind-cancelled",
      tone: statusTone("cancelled"),
      label: "In-kind cancelled",
      cents: inKindCancelled,
    });
  }

  return chips;
}

/**
 * One campaign's worth of a sponsor's giving, for the history at the foot of
 * their page.
 *
 * Cancelled gifts are left out: this is a record of what somebody has actually
 * given, and a cancelled gift is not part of it.
 */
export type ContributionRow = {
  campaignId: string;
  cents: number;
  chips: SponsorChip[];
};

export function contributionsByCampaign(
  donations: {
    campaignId: string;
    status: DonationStatus;
    kind: DonationKind;
    valueCents: number;
  }[]
): ContributionRow[] {
  const byCampaign = new Map<string, typeof donations>();

  for (const donation of donations) {
    if (donation.status === "cancelled" || !donation.valueCents) continue;
    const held = byCampaign.get(donation.campaignId) ?? [];
    held.push(donation);
    byCampaign.set(donation.campaignId, held);
  }

  return [...byCampaign.entries()]
    .map(([campaignId, rows]) => ({
      campaignId,
      cents: rows.reduce((sum, row) => sum + row.valueCents, 0),
      chips: sponsorChips(rows),
    }))
    .sort((a, b) => b.cents - a.cents);
}

/**
 * How a campaign's goal is being filled, in monetary gifts only.
 *
 * An in-kind gift is worth having and worth recording, but a goal is money to
 * be raised — counting a lent projector towards it would say the money had come
 * in when it had not. Cancelled gifts are ignored for the same reason they are
 * ignored everywhere else.
 */
export type ProgressSegment = {
  status: DonationStatus;
  cents: number;
  /** Percent of the goal, for the width of this segment. */
  percent: number;
};

export function monetaryProgress(
  donations: { status: DonationStatus; kind: DonationKind; valueCents: number }[],
  goalCents: number
): { segments: ProgressSegment[]; totalCents: number; percent: number } {
  const byStatus = new Map<DonationStatus, number>();

  for (const donation of donations) {
    if (donation.kind !== "monetary") continue;
    if (donation.status === "cancelled") continue;
    byStatus.set(
      donation.status,
      (byStatus.get(donation.status) ?? 0) + donation.valueCents
    );
  }

  const segments: ProgressSegment[] = [];
  let totalCents = 0;

  // Complete first, so the bar fills from what is certain towards what is not.
  for (const status of DONATION_STATUS_ORDER) {
    if (status === "cancelled") continue;
    const cents = byStatus.get(status) ?? 0;
    if (cents <= 0) continue;

    totalCents += cents;
    segments.push({
      status,
      cents,
      percent: goalCents ? (cents / goalCents) * 100 : 0,
    });
  }

  const percent = goalCents
    ? Math.min(100, Math.round((totalCents / goalCents) * 100))
    : 0;

  return { segments, totalCents, percent };
}

export type DonationSummary = {
  _id: string;
  campaignId: string;
  sponsorId: string;
  kind: DonationKind;
  status: DonationStatus;
  /** ISO date. */
  date: string;
  /** Whole cents. In-kind donations carry the value they stand in for. */
  valueCents: number;
  description: string;
  /** The members credited with bringing it in. */
  memberIds: string[];
};

/* ----------------------------------------------------------------- Tidying */

/** Nobody blank, nobody twice; the order they were added is kept. */
export function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    const value = String(id ?? "").trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

/** Drops rows somebody started and left empty. */
export function normalizeContacts(value: unknown): SponsorContact[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => ({
      name: String((entry as any)?.name ?? "").trim().slice(0, 120),
      title: String((entry as any)?.title ?? "").trim().slice(0, 120),
      email: String((entry as any)?.email ?? "").trim().slice(0, 200),
      phone: String((entry as any)?.phone ?? "").trim().slice(0, 40),
    }))
    .filter((contact) => contact.name || contact.email || contact.phone)
    .slice(0, 25);
}

export function normalizeLinks(value: unknown): SponsorLink[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => ({
      label: String((entry as any)?.label ?? "").trim().slice(0, 60),
      href: String((entry as any)?.href ?? "").trim().slice(0, 500),
    }))
    .filter((link) => link.href)
    .slice(0, 25);
}

export function normalizeLogos(value: unknown): SponsorLogo[] {
  if (!Array.isArray(value)) return [];

  const logos = value
    .map((entry) => ({
      label: String((entry as any)?.label ?? "").trim().slice(0, 60),
      // Stored as the bare path the media library knows, so usage lookups can
      // still match the asset; the `/api/media` rewrite happens at render.
      url: sanitizeMediaPath(String((entry as any)?.url ?? "")),
      mediaId: String((entry as any)?.mediaId ?? "").trim(),
      isPrimary: Boolean((entry as any)?.isPrimary),
    }))
    .filter((logo) => logo.url)
    .slice(0, 25);

  // Exactly one primary, and only if there is a logo at all: two would leave
  // the site with no way to choose, and none would leave it with nothing to
  // show even though artwork exists.
  const chosen = logos.findIndex((logo) => logo.isPrimary);
  const primary = chosen === -1 ? 0 : chosen;
  return logos.map((logo, index) => ({ ...logo, isPrimary: index === primary }));
}

/** The logo the site should use, or nothing if the sponsor has none on file. */
export function primaryLogo(logos: SponsorLogo[]): SponsorLogo | null {
  return logos.find((logo) => logo.isPrimary) ?? logos[0] ?? null;
}

/**
 * The `src` for a sponsor logo, wherever one is shown.
 *
 * Uploaded artwork lives under `/uploads/` and is only served through
 * `/api/media`, so a page that renders the stored path straight into an `<img>`
 * shows a broken image. Every logo on screen goes through here.
 */
export function sponsorLogoSrc(logo: SponsorLogo | null | undefined): string {
  return protectedMediaUrl(logo?.url);
}

export function normalizeAssignments(value: unknown): CampaignAssignment[] {
  if (!Array.isArray(value)) return [];

  const bySponsor = new Map<string, CampaignAssignment>();
  for (const entry of value) {
    const sponsorId = String((entry as any)?.sponsorId ?? "").trim();
    if (!sponsorId) continue;

    // One row per sponsor: two rows for the same one would only disagree.
    const memberIds = uniqueIds(
      Array.isArray((entry as any)?.memberIds) ? (entry as any).memberIds : []
    );
    const existing = bySponsor.get(sponsorId);
    if (existing) existing.memberIds = uniqueIds([...existing.memberIds, ...memberIds]);
    else bySponsor.set(sponsorId, { sponsorId, memberIds });
  }

  return [...bySponsor.values()];
}

/** An ISO date, or empty. Anything unparseable is treated as not given. */
export function isoDate(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function formatDateLabel(iso: string): string {
  if (!iso) return "";
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString();
}

/** "1 Jan 2026 – 30 Jun 2026", or whichever end is known. */
export function dateRangeLabel(startDate: string, endDate: string): string {
  const start = formatDateLabel(startDate);
  const end = formatDateLabel(endDate);

  if (start && end) return `${start} – ${end}`;
  if (start) return `From ${start}`;
  if (end) return `Until ${end}`;
  return "No dates set";
}
