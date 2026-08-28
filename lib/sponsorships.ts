import { connectDB } from "./db";
import {
  Donation,
  RecognitionLevel,
  Sponsor,
  SponsorBenefit,
  SponsorCategory,
  SponsorshipCampaign,
} from "./models";
import {
  campaignStatus,
  countsTowardTotals,
  donationKind,
  donationStatus,
  isRealised,
  isoDate,
  normalizeAssignments,
  normalizeContacts,
  normalizeLinks,
  normalizeLogos,
  normalizeStretchGoals,
  sponsorSize,
  sponsorType,
  uniqueIds,
  sortRecognitionLevels,
  type CampaignSummary,
  type DonationStatus,
  type DonationSummary,
  type RecognitionLevelSummary,
  type SponsorBenefitSummary,
  type SponsorCategorySummary,
  type SponsorSummary,
} from "./sponsorship-types";

export * from "./sponsorship-types";

export function toSponsorSummary(record: any): SponsorSummary {
  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    type: sponsorType(record.type),
    description: String(record.description ?? ""),
    industry: String(record.industry ?? ""),
    size: sponsorSize(record.size),
    email: String(record.email ?? ""),
    phone: String(record.phone ?? ""),
    address: String(record.address ?? ""),
    website: String(record.website ?? ""),
    links: normalizeLinks(record.links),
    logos: normalizeLogos(record.logos),
    contacts: normalizeContacts(record.contacts),
    notes: String(record.notes ?? ""),
    isUnassignable: Boolean(record.isUnassignable),
    recognitionLevelId: record.recognitionLevelId
      ? String(record.recognitionLevelId)
      : "",
    categoryIds: uniqueIds((record.categoryIds ?? []).map(String)),
  };
}

export function toCategorySummary(record: any): SponsorCategorySummary {
  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
  };
}

export async function getSponsorCategories(): Promise<SponsorCategorySummary[]> {
  await connectDB();
  const records = await SponsorCategory.find().sort({ name: 1 }).lean<any[]>();
  return records.map(toCategorySummary);
}

export function toRecognitionLevelSummary(record: any): RecognitionLevelSummary {
  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
    rank: Number(record.rank ?? 0) || 0,
    thresholdCents: Math.max(0, Number(record.thresholdCents ?? 0) || 0),
    benefitIds: uniqueIds((record.benefitIds ?? []).map(String)),
    isAnonymous: Boolean(record.isAnonymous),
  };
}

export function toBenefitSummary(record: any): SponsorBenefitSummary {
  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
  };
}

export async function getSponsorBenefits(): Promise<SponsorBenefitSummary[]> {
  await connectDB();
  const records = await SponsorBenefit.find().sort({ name: 1 }).lean<any[]>();
  return records.map(toBenefitSummary);
}

export async function getRecognitionLevels(): Promise<RecognitionLevelSummary[]> {
  await connectDB();
  const records = await RecognitionLevel.find().lean<any[]>();
  return sortRecognitionLevels(records.map(toRecognitionLevelSummary));
}

export function toCampaignSummary(record: any): CampaignSummary {
  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
    status: campaignStatus(record.status),
    startDate: isoDate(record.startDate),
    endDate: isoDate(record.endDate),
    goalCents: Number(record.goalCents ?? 0) || 0,
    stretchGoals: normalizeStretchGoals(record.stretchGoals),
    assignments: normalizeAssignments(record.assignments),
  };
}

export function toDonationSummary(record: any): DonationSummary {
  return {
    _id: String(record._id),
    campaignId: String(record.campaignId ?? ""),
    sponsorId: String(record.sponsorId ?? ""),
    kind: donationKind(record.kind),
    status: donationStatus(record.status),
    date: isoDate(record.date),
    valueCents: Number(record.valueCents ?? 0) || 0,
    // Absent on everything recorded before the flag existed, and those were
    // all counted at the time, so the absence has to read as true.
    isCounted: record.isCounted !== false,
    stretchGoalId: String(record.stretchGoalId ?? ""),
    description: String(record.description ?? ""),
    memberIds: uniqueIds((record.memberIds ?? []).map(String)),
  };
}

export async function getSponsors(): Promise<SponsorSummary[]> {
  await connectDB();
  const records = await Sponsor.find().sort({ name: 1 }).lean<any[]>();
  return records.map(toSponsorSummary);
}

export async function getCampaigns(): Promise<CampaignSummary[]> {
  await connectDB();
  // Active first, then newest: the one being worked on now is the one being
  // looked for.
  const records = await SponsorshipCampaign.find()
    .sort({ status: 1, startDate: -1, name: 1 })
    .lean<any[]>();
  return records.map(toCampaignSummary);
}

export async function getDonations(): Promise<DonationSummary[]> {
  await connectDB();
  const records = await Donation.find().sort({ date: -1 }).lean<any[]>();
  return records.map(toDonationSummary);
}

/**
 * What each campaign has taken, and what is still being worked on.
 *
 * Cancelled gifts are left out entirely — they never happened. The rest are
 * split, because a pledge that has not arrived is worth knowing about but is
 * not the same as money in hand.
 */
export type CampaignTotals = {
  /** Everything not cancelled. */
  totalCents: number;
  /** Complete only: what has actually arrived. */
  realisedCents: number;
  /** Proposed and in progress: what is still being worked on. */
  pendingCents: number;
  monetaryCents: number;
  inKindCents: number;
  count: number;
  sponsorCount: number;
};

export function totalsByCampaign(
  donations: DonationSummary[]
): Map<string, CampaignTotals> {
  const totals = new Map<string, CampaignTotals>();
  const sponsorsSeen = new Map<string, Set<string>>();

  for (const donation of donations) {
    if (!countsTowardTotals(donation.status)) continue;

    const entry = totals.get(donation.campaignId) ?? {
      totalCents: 0,
      realisedCents: 0,
      pendingCents: 0,
      monetaryCents: 0,
      inKindCents: 0,
      count: 0,
      sponsorCount: 0,
    };

    entry.totalCents += donation.valueCents;
    if (isRealised(donation.status)) entry.realisedCents += donation.valueCents;
    else entry.pendingCents += donation.valueCents;
    if (donation.kind === "in-kind") entry.inKindCents += donation.valueCents;
    else entry.monetaryCents += donation.valueCents;
    entry.count += 1;

    totals.set(donation.campaignId, entry);

    const seen = sponsorsSeen.get(donation.campaignId) ?? new Set<string>();
    seen.add(donation.sponsorId);
    sponsorsSeen.set(donation.campaignId, seen);
  }

  for (const [campaignId, entry] of totals) {
    entry.sponsorCount = sponsorsSeen.get(campaignId)?.size ?? 0;
  }

  return totals;
}

/**
 * The share of each donation attributable to each member credited with it.
 *
 * Deliberately a different question from `creditByMember`, and deliberately a
 * different answer. That one asks "what did this member bring in", and counts a
 * shared gift in full for everybody on it. This one asks "how do the members
 * compare", which only means something if the shares add up to the whole — so a
 * gift credited to three people is a third each.
 *
 * Split in whole cents, with the remainder going to the first named. Three
 * people sharing a dollar get 34, 33 and 33 rather than 33 each and a cent lost
 * from the total.
 */
/** One member's share, of one kind of giving. */
export type CreditTotals = {
  completeCents: number;
  inProgressCents: number;
  proposedCents: number;
};

export type MemberCredit = {
  memberId: string;
  /** Money and in-kind kept apart: they are not the same thing and do not add. */
  monetary: CreditTotals;
  inKind: CreditTotals;
  /** Donations they are named on, however many others are named too. */
  count: number;
};

function emptyTotals(): CreditTotals {
  return { completeCents: 0, inProgressCents: 0, proposedCents: 0 };
}

function addTo(totals: CreditTotals, status: DonationStatus, cents: number) {
  if (status === "complete") totals.completeCents += cents;
  else if (status === "in-progress") totals.inProgressCents += cents;
  else totals.proposedCents += cents;
}

export function splitCreditByMember(
  donations: DonationSummary[]
): MemberCredit[] {
  const credit = new Map<string, MemberCredit>();

  for (const donation of donations) {
    // A cancelled gift is nobody's credit, and neither is one recorded as not
    // counting — the board and the goal answer to the same flag.
    if (!countsTowardTotals(donation.status)) continue;
    if (!donation.isCounted) continue;
    if (donation.memberIds.length === 0 || donation.valueCents <= 0) continue;

    const share = Math.floor(donation.valueCents / donation.memberIds.length);
    const remainder = donation.valueCents - share * donation.memberIds.length;

    donation.memberIds.forEach((memberId, index) => {
      const entry = credit.get(memberId) ?? {
        memberId,
        monetary: emptyTotals(),
        inKind: emptyTotals(),
        count: 0,
      };

      const amount = share + (index < remainder ? 1 : 0);
      addTo(
        donation.kind === "in-kind" ? entry.inKind : entry.monetary,
        donation.status,
        amount
      );

      entry.count += 1;
      credit.set(memberId, entry);
    });
  }

  /*
   * Ordered on everything that has actually arrived, money and in-kind
   * together.
   *
   * The two are shown apart because they are not the same thing — but a member
   * who secured a donated venue worth thousands has not done less than one who
   * banked a small cheque, and ranking on money alone would say they had.
   */
  const arrived = (entry: MemberCredit) =>
    entry.monetary.completeCents + entry.inKind.completeCents;
  const promised = (entry: MemberCredit) =>
    entry.monetary.inProgressCents +
    entry.monetary.proposedCents +
    entry.inKind.inProgressCents +
    entry.inKind.proposedCents;

  return [...credit.values()].sort(
    (a, b) => arrived(b) - arrived(a) || promised(b) - promised(a) || b.count - a.count
  );
}

/**
 * What each member is credited with bringing in.
 *
 * A donation credited to three people counts in full for each of them: the
 * figure answers "what did this member bring in", not "what share of the total
 * is theirs", and splitting it would make those two questions indistinguishable.
 */
export function creditByMember(
  donations: DonationSummary[]
): Map<string, { totalCents: number; count: number }> {
  const credit = new Map<string, { totalCents: number; count: number }>();

  for (const donation of donations) {
    // A gift that was cancelled is nobody's credit, nor is one recorded as not
    // counting towards the goal and the board.
    if (!countsTowardTotals(donation.status)) continue;
    if (!donation.isCounted) continue;

    for (const memberId of donation.memberIds) {
      const entry = credit.get(memberId) ?? { totalCents: 0, count: 0 };
      entry.totalCents += donation.valueCents;
      entry.count += 1;
      credit.set(memberId, entry);
    }
  }

  return credit;
}
