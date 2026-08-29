/**
 * The shapes and pure helpers behind sponsorships.
 *
 * Split from `lib/sponsorships.ts` because the client components that render
 * them import from here, and that module reaches the database — importing it
 * from the browser bundle would drag Mongoose in with it.
 */

import { normalizePhone } from "./member-types";
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
  "Accounting and investing",
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
  /** The least a sponsor must have given to qualify. Zero for no figure. */
  thresholdCents: number;
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
  /** When true, no member is put down as looking after them. */
  isUnassignable: boolean;
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
/**
 * Whether this sponsor is still being worked on this campaign.
 *
 * Not the same as the campaign's own status, and not the same as whether they
 * have given: a sponsor can have paid in full and still be open because there
 * is a second ask outstanding, and can be closed having given nothing at all
 * because they said no. It is the state of the conversation.
 */
export const ASSIGNMENT_STATUSES = ["open", "closed"] as const;

export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const ASSIGNMENT_STATUS_LABELS: Record<AssignmentStatus, string> = {
  open: "Open",
  closed: "Closed",
};

export function assignmentStatus(value: unknown): AssignmentStatus {
  // Anything unsaid is open: an assignment nobody has closed is one still
  // being worked, and every assignment made before this existed was.
  return value === "closed" ? "closed" : "open";
}

export type CampaignAssignment = {
  sponsorId: string;
  memberIds: string[];
  /** Whether the conversation with them is still being worked. */
  status: AssignmentStatus;
};

/**
 * Something the campaign would go on to do, if it passes what it asked for.
 *
 * The amount is additional: above the goal, and above the tier before it. A
 * manager thinks in what the next push is worth — "another two thousand and we
 * can re-glaze the darkroom" — rather than in running totals, and the running
 * totals are the one thing that can be worked out from the steps.
 */
export type StretchGoal = {
  /** Stable for the life of the tier, so a donation can be applied to it. */
  id: string;
  /** What the extra money is for. Without one there is nothing to aim at. */
  description: string;
  /**
   * Whole cents. What it means depends on which kind of goal this is: a step
   * above the tier before it, or the whole target of a separate effort.
   */
  amountCents: number;
  /**
   * A goal of its own, raised alongside the campaign rather than out of it.
   *
   * Money given to one of these is kept out of the campaign's total — that is
   * the whole difference between the two kinds. A stacked tier says "if we
   * pass the goal by this much"; a separate one says "and also, this".
   */
  isSeparate: boolean;
};

/** Drops tiers somebody started and left empty, and keeps the order given. */
export function normalizeStretchGoals(value: unknown): StretchGoal[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => ({
      // Tiers saved before ids existed fall back to their position, which is
      // stable for as long as nobody reorders them — and the next save writes
      // the id back, after which position stops mattering.
      id: String((entry as any)?.id ?? "").trim() || `tier-${index + 1}`,
      description: String((entry as any)?.description ?? "")
        .trim()
        .slice(0, 300),
      amountCents: Math.max(
        0,
        Math.round(Number((entry as any)?.amountCents ?? 0) || 0)
      ),
      isSeparate: Boolean((entry as any)?.isSeparate),
    }))
    .filter((goal) => goal.amountCents > 0)
    .slice(0, 12);
}

export type CampaignSummary = {
  _id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  /** ISO dates, or empty for a campaign with no fixed start or end. */
  startDate: string;
  endDate: string;
  goalCents: number;
  /** Above the goal, in order. Empty for a campaign with one target. */
  stretchGoals: StretchGoal[];
  assignments: CampaignAssignment[];
};

/* --------------------------------------------------------------- Donations */

/**
 * Where a donation has got to.
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

/** A cancelled donation never happened, so it is left out of every total. */
export function countsTowardTotals(status: DonationStatus): boolean {
  return status !== "cancelled";
}

/** Money in hand, as opposed to a donation still being worked on. */
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
 * What a set of donations amounts to, split by status and by kind.
 *
 * Rows worth nothing are left out entirely: a campaign that has taken no in-kind
 * donations should not carry a line saying so.
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
 * cheque promised is the whole question. An in-kind donation is not money and never
 * will be, so it is read only as arrived or not: dark for what has come, light
 * for what is still coming. A cancelled donation stays red either way.
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
 * Cancelled donations are left out: this is a record of what somebody has actually
 * given, and a cancelled donation is not part of it.
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
 * How a campaign's goal is being filled, in monetary donations only.
 *
 * An in-kind donation is worth having and worth recording, but a goal is money to
 * be raised — counting a lent projector towards it would say the money had come
 * in when it had not. Cancelled donations are ignored for the same reason they are
 * ignored everywhere else, and so is a donation recorded as not counting.
 */
export type ProgressSegment = {
  status: DonationStatus;
  cents: number;
  /** Percent of the bar's full width, which is `scaleCents`. */
  percent: number;
  /** Percent of the goal alone, for a bar that shows only the goal. */
  goalSharePercent: number;
};

/** One stretch goal, placed against what the campaign has actually raised. */
export type StretchTier = {
  id: string;
  /** 1 for the first tier above the goal. */
  step: number;
  description: string;
  /** The step itself: what this tier asks for beyond the one before. */
  amountCents: number;
  /** The campaign total at which this tier is reached. */
  thresholdCents: number;
  /** Where the tier sits along the bar, as a percent of its full width. */
  markerPercent: number;
  /** This tier's share of a track holding the stretch goals alone. */
  trackPercent: number;
  /** How full this tier's own share of that track is, 0–100. */
  fillPercent: number;
  isMet: boolean;
  /*
   * Given for this tier by name.
   *
   * An earmark, not a separate pot: the money fills the campaign wherever it
   * was aimed, and a tier is reached by the campaign total like any other. This
   * says how much of what came in was given with this tier in mind.
   */
  earmarkedCents: number;
  earmarkedCount: number;
};

/**
 * A goal raised alongside the campaign rather than out of it.
 *
 * It has no threshold, because it is not a point along the campaign's own
 * run: it fills only from the donations given to it by name, and the campaign's
 * total never includes them.
 */
export type SecondaryGoal = {
  id: string;
  description: string;
  /** What this effort is asking for, on its own. */
  targetCents: number;
  /** Given to it by name: counted, monetary, not cancelled. */
  raisedCents: number;
  donationCount: number;
  /** Of its target, capped — for the width of its bar. */
  fillPercent: number;
  /** Of its target, uncapped — for the figure beside it. */
  percent: number;
  isMet: boolean;
};

export type MonetaryProgress = {
  segments: ProgressSegment[];
  /** Counted, monetary, not cancelled. */
  totalCents: number;
  /** Of the goal itself, and deliberately not capped: passing it is the point
      of having stretch tiers, and a bar reading 100% would hide that. */
  percent: number;
  /** What the full width of the bar stands for. */
  scaleCents: number;
  /** Where the goal itself falls along the bar, once tiers widen it. */
  goalPercent: number;
  /** The tiers stacked above the goal. Separate goals are not among them. */
  tiers: StretchTier[];
  /** The efforts raised alongside, whose donations stay out of every figure above. */
  secondary: SecondaryGoal[];
  /** Given to those efforts, and so deliberately absent from `totalCents`. */
  secondaryCents: number;
  /** Every tier added up: what the stretch goals ask for beyond the goal. */
  stretchCents: number;
  /** How much has been raised beyond the goal, for the stretch track. */
  intoStretchCents: number;
  /** The goal alone, filled and capped — a goal cannot be more than met. */
  goalFillPercent: number;
  /** The furthest tier reached, or null while the goal itself is unmet. */
  reached: StretchTier | null;
  /** The next one to aim at, or null once every tier is met. */
  next: StretchTier | null;
  /** Monetary and not cancelled, but recorded as not counting. */
  uncountedCents: number;
};

/**
 * The bar, its bands, and the stretch tiers marked along it.
 *
 * With stretch goals the bar stops standing for the goal alone: its full width
 * is the goal plus every tier, so a campaign at its target reads as part-way
 * along rather than as finished. The headline percentage still answers "how
 * much of the goal", which is the figure people quote.
 */
export function monetaryProgress(
  donations: {
    status: DonationStatus;
    kind: DonationKind;
    valueCents: number;
    isCounted?: boolean;
    stretchGoalId?: string;
  }[],
  goalCents: number,
  stretchGoals: StretchGoal[] = []
): MonetaryProgress {
  // Which ids belong to an effort of its own, so a donation to one can be kept
  // out of the campaign's total rather than counted twice over.
  const separateIds = new Set(
    stretchGoals.filter((goal) => goal.isSeparate).map((goal) => goal.id)
  );

  const byStatus = new Map<DonationStatus, number>();
  const earmarked = new Map<string, { cents: number; count: number }>();
  let uncountedCents = 0;
  let secondaryCents = 0;

  for (const donation of donations) {
    if (donation.kind !== "monetary") continue;
    if (donation.status === "cancelled") continue;
    // Recorded, and deliberately left out of the goal: see `isCounted`. Older
    // records predate the flag and are counted, as they always were.
    if (donation.isCounted === false) {
      uncountedCents += donation.valueCents;
      continue;
    }

    if (donation.stretchGoalId) {
      const held = earmarked.get(donation.stretchGoalId) ?? { cents: 0, count: 0 };
      held.cents += donation.valueCents;
      held.count += 1;
      earmarked.set(donation.stretchGoalId, held);
    }

    // Given to a separate effort: it fills that goal and nothing else. The
    // campaign has not raised it, and a bar that said otherwise would be
    // counting money that is already spoken for.
    if (donation.stretchGoalId && separateIds.has(donation.stretchGoalId)) {
      secondaryCents += donation.valueCents;
      continue;
    }

    byStatus.set(
      donation.status,
      (byStatus.get(donation.status) ?? 0) + donation.valueCents
    );
  }

  // Complete first, so the bar fills from what is certain towards what is not.
  const banded: { status: DonationStatus; cents: number }[] = [];
  let totalCents = 0;

  for (const status of DONATION_STATUS_ORDER) {
    if (status === "cancelled") continue;
    const cents = byStatus.get(status) ?? 0;
    if (cents <= 0) continue;

    totalCents += cents;
    banded.push({ status, cents });
  }

  // Only the stacked tiers widen the campaign's own run. A separate effort is
  // not further along it.
  const stacked = stretchGoals.filter((goal) => !goal.isSeparate);
  const stretchCents = stacked.reduce((sum, goal) => sum + goal.amountCents, 0);
  // The bar has to hold whatever is actually there: a campaign that has passed
  // its last tier still needs a width its own segments fit inside.
  const scaleCents = Math.max(goalCents + stretchCents, totalCents, 0);

  const segments: ProgressSegment[] = banded.map(({ status, cents }) => ({
    status,
    cents,
    percent: scaleCents ? (cents / scaleCents) * 100 : 0,
    goalSharePercent: goalCents ? (cents / goalCents) * 100 : 0,
  }));

  const tiers: StretchTier[] = [];
  let thresholdCents = goalCents;

  for (const [index, goal] of stacked.entries()) {
    const opensAtCents = thresholdCents;
    thresholdCents += goal.amountCents;
    const given = earmarked.get(goal.id);
    // How far into this tier alone the money has come. Each tier is read as
    // its own run, so a part-filled one shows as part-filled rather than as
    // a share of a total nobody is thinking about.
    const intoTier = Math.min(
      goal.amountCents,
      Math.max(0, totalCents - opensAtCents)
    );

    tiers.push({
      id: goal.id,
      step: index + 1,
      description: goal.description,
      amountCents: goal.amountCents,
      thresholdCents,
      markerPercent: scaleCents ? (thresholdCents / scaleCents) * 100 : 0,
      trackPercent: stretchCents ? (goal.amountCents / stretchCents) * 100 : 0,
      fillPercent: goal.amountCents ? (intoTier / goal.amountCents) * 100 : 0,
      isMet: thresholdCents > 0 && totalCents >= thresholdCents,
      earmarkedCents: given?.cents ?? 0,
      earmarkedCount: given?.count ?? 0,
    });
  }

  const secondary: SecondaryGoal[] = stretchGoals
    .filter((goal) => goal.isSeparate)
    .map((goal) => {
      const given = earmarked.get(goal.id);
      const raisedCents = given?.cents ?? 0;
      return {
        id: goal.id,
        description: goal.description,
        targetCents: goal.amountCents,
        raisedCents,
        donationCount: given?.count ?? 0,
        fillPercent: goal.amountCents
          ? Math.min(100, (raisedCents / goal.amountCents) * 100)
          : 0,
        percent: goal.amountCents
          ? Math.round((raisedCents / goal.amountCents) * 100)
          : 0,
        isMet: goal.amountCents > 0 && raisedCents >= goal.amountCents,
      };
    });

  const met = tiers.filter((tier) => tier.isMet);

  return {
    segments,
    totalCents,
    percent: goalCents ? Math.round((totalCents / goalCents) * 100) : 0,
    scaleCents,
    goalPercent: scaleCents ? (goalCents / scaleCents) * 100 : 0,
    tiers,
    secondary,
    secondaryCents,
    stretchCents,
    intoStretchCents: Math.max(0, totalCents - goalCents),
    goalFillPercent: goalCents
      ? Math.min(100, (totalCents / goalCents) * 100)
      : 0,
    reached: met.length > 0 ? met[met.length - 1] : null,
    next: tiers.find((tier) => !tier.isMet) ?? null,
    uncountedCents,
  };
}

/**
 * What was given in goods and services, rather than in money.
 *
 * Kept apart from every money figure on purpose — a donated venue does not fill
 * a money goal — but worth stating plainly, because a campaign that was lent a
 * hall and a projector has been given something real and a page that only
 * counts cash says it has not.
 */
export type InKindTotals = {
  /** Arrived. */
  completeCents: number;
  /** Proposed and in progress together: promised, not yet here. */
  pendingCents: number;
  count: number;
  /** How many sponsors it came from. */
  sponsorCount: number;
};

export function inKindTotals(
  donations: {
    kind: DonationKind;
    status: DonationStatus;
    valueCents: number;
    sponsorId: string;
  }[]
): InKindTotals {
  const sponsors = new Set<string>();
  let completeCents = 0;
  let pendingCents = 0;
  let count = 0;

  for (const donation of donations) {
    if (donation.kind !== "in-kind") continue;
    if (donation.status === "cancelled") continue;

    if (donation.status === "complete") completeCents += donation.valueCents;
    else pendingCents += donation.valueCents;
    count += 1;
    sponsors.add(donation.sponsorId);
  }

  return { completeCents, pendingCents, count, sponsorCount: sponsors.size };
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
  /** Whether it fills the goal and earns leaderboard credit. */
  isCounted: boolean;
  /** The stretch goal it was given for, or empty for the campaign at large. */
  stretchGoalId: string;
  /** What kind of donation this was, from the sponsor category list. */
  categoryIds: string[];
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
      phone: normalizePhone(String((entry as any)?.phone ?? "")),
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
    const status = assignmentStatus((entry as any)?.status);
    const existing = bySponsor.get(sponsorId);
    if (existing) {
      existing.memberIds = uniqueIds([...existing.memberIds, ...memberIds]);
      // Two rows for one sponsor disagreeing about the state of it: open
      // wins, because a conversation somebody says is still running is.
      if (status === "open") existing.status = "open";
    } else {
      bySponsor.set(sponsorId, { sponsorId, memberIds, status });
    }
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
