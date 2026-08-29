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
  type SponsorLogo,
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
    categoryIds: uniqueIds((record.categoryIds ?? []).map(String)),
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
 * Cancelled donations are left out entirely — they never happened. The rest are
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
 * shared donation in full for everybody on it. This one asks "how do the members
 * compare", which only means something if the shares add up to the whole — so a
 * donation credited to three people is a third each.
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
    // A cancelled donation is nobody's credit, and neither is one recorded as not
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
    // A donation that was cancelled is nobody's credit, nor is one recorded as not
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

/* ------------------------------------------------------- Recognition report */

/**
 * One sponsor, against what they have given to the campaigns now running.
 *
 * Money and in-kind are held apart, as they are everywhere else — a donated
 * venue is not a cheque — but they are ranked together, because a sponsor who
 * lent a hall worth thousands has not given less than one who sent a small
 * cheque, and an order that said so would put the wrong people at the top of a
 * list whose whole purpose is deciding who to thank.
 */
export type RecognitionRow = {
  _id: string;
  name: string;
  logos: SponsorLogo[];
  /** Empty when nobody has put them at a level. */
  recognitionLevelId: string;
  monetaryCents: number;
  inKindCents: number;
  /** The two added, for ordering only. Never shown as one figure. */
  rankCents: number;
  count: number;
  /** The running campaigns they have given to. */
  campaignCount: number;
};

/**
 * Who is being recognised, and who has given without being.
 *
 * The second list is the point of the report: a sponsor who has paid for a
 * campaign and appears nowhere on the site is an oversight nobody notices,
 * because nothing about the donation record says it is missing. Asked only of
 * the campaigns now running — last year's sponsors were recognised, or were
 * not, and it is too late to be told about it here.
 */
export type RecognitionReport = {
  /** At a level, ordered by what they have given to running campaigns. */
  recognised: RecognitionRow[];
  /** Gave to a running campaign, at no level. Ordered the same way. */
  unrecognised: RecognitionRow[];
  /** Every sponsor at a level, whether or not they have given lately. */
  recognisedCount: number;
  /** Money given to running campaigns by sponsors at a level. */
  recognisedCents: number;
  /** And by sponsors at none — the figure that is going unthanked. */
  unrecognisedCents: number;
  /** The campaign that started most recently, of those running. */
  latest: CampaignSummary | null;
  latestCents: number;
  latestCount: number;
};

export function recognitionReport(
  sponsors: SponsorSummary[],
  campaigns: CampaignSummary[],
  donations: DonationSummary[]
): RecognitionReport {
  const active = campaigns.filter((campaign) => campaign.status === "active");
  const activeIds = new Set(active.map((campaign) => campaign._id));

  // The one started most recently. A campaign with no start date has no claim
  // to being the latest, so it only wins when nothing else is running.
  const latest =
    [...active].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;

  const rows = new Map<string, RecognitionRow>();
  const campaignsSeen = new Map<string, Set<string>>();
  let latestCents = 0;
  let latestCount = 0;

  for (const donation of donations) {
    // Cancelled never happened, here as everywhere. A donation marked as not
    // counting towards the goal is still something the sponsor gave, and is
    // still a reason to thank them, so it is counted here.
    if (!countsTowardTotals(donation.status)) continue;
    if (!activeIds.has(donation.campaignId)) continue;

    if (latest && donation.campaignId === latest._id) {
      latestCents += donation.valueCents;
      latestCount += 1;
    }

    const sponsor = sponsors.find((entry) => entry._id === donation.sponsorId);
    if (!sponsor) continue;

    const row = rows.get(sponsor._id) ?? {
      _id: sponsor._id,
      name: sponsor.name,
      logos: sponsor.logos,
      recognitionLevelId: sponsor.recognitionLevelId,
      monetaryCents: 0,
      inKindCents: 0,
      rankCents: 0,
      count: 0,
      campaignCount: 0,
    };

    if (donation.kind === "in-kind") row.inKindCents += donation.valueCents;
    else row.monetaryCents += donation.valueCents;
    row.rankCents += donation.valueCents;
    row.count += 1;
    rows.set(sponsor._id, row);

    const seen = campaignsSeen.get(sponsor._id) ?? new Set<string>();
    seen.add(donation.campaignId);
    campaignsSeen.set(sponsor._id, seen);
  }

  for (const [sponsorId, row] of rows) {
    row.campaignCount = campaignsSeen.get(sponsorId)?.size ?? 0;
  }

  const byGiven = (a: RecognitionRow, b: RecognitionRow) =>
    b.rankCents - a.rankCents || a.name.localeCompare(b.name);

  /*
   * A recognised sponsor belongs on the first list whether or not they have
   * given this year: the list answers "who is on the site", and a sponsor
   * recognised through a quiet year is still on it.
   */
  const recognised = sponsors
    .filter((sponsor) => sponsor.recognitionLevelId)
    .map(
      (sponsor) =>
        rows.get(sponsor._id) ?? {
          _id: sponsor._id,
          name: sponsor.name,
          logos: sponsor.logos,
          recognitionLevelId: sponsor.recognitionLevelId,
          monetaryCents: 0,
          inKindCents: 0,
          rankCents: 0,
          count: 0,
          campaignCount: 0,
        }
    )
    .sort(byGiven);

  const unrecognised = [...rows.values()]
    .filter((row) => !row.recognitionLevelId)
    .sort(byGiven);

  const sum = (list: RecognitionRow[]) =>
    list.reduce((total, row) => total + row.rankCents, 0);

  return {
    recognised,
    unrecognised,
    recognisedCount: recognised.length,
    recognisedCents: sum(recognised),
    unrecognisedCents: sum(unrecognised),
    latest,
    latestCents,
    latestCount,
  };
}

/* ------------------------------------------------------------- Breakdowns */

/**
 * One line of a breakdown: a slice of what a campaign has taken.
 *
 * Money and in-kind are held apart, as they are everywhere else — a donated
 * venue is not a cheque — but the lines are ranked on the two together, since
 * the question a breakdown answers is "where did the support come from" and a
 * lent hall is support.
 */
export type BreakdownRow = {
  label: string;
  monetaryCents: number;
  inKindCents: number;
  /** The two added, for ordering and for the width of a line's bar only. */
  rankCents: number;
  count: number;
};

/**
 * Splits a campaign's donations by whatever the caller names them.
 *
 * The labeller returns as many labels as the donation belongs under, which is
 * what lets a donation carrying two categories count under both. Returning
 * none puts it under the fallback, because a breakdown that quietly dropped
 * the uncategorised would not add up to what the campaign raised.
 */
export function breakdown(
  donations: DonationSummary[],
  labeller: (donation: DonationSummary) => string[],
  fallback: string
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();

  for (const donation of donations) {
    // Cancelled never happened, here as everywhere.
    if (!countsTowardTotals(donation.status)) continue;

    const labels = labeller(donation);
    for (const label of labels.length > 0 ? labels : [fallback]) {
      const row = rows.get(label) ?? {
        label,
        monetaryCents: 0,
        inKindCents: 0,
        rankCents: 0,
        count: 0,
      };

      if (donation.kind === "in-kind") row.inKindCents += donation.valueCents;
      else row.monetaryCents += donation.valueCents;
      row.rankCents += donation.valueCents;
      row.count += 1;
      rows.set(label, row);
    }
  }

  return [...rows.values()].sort(
    (a, b) => b.rankCents - a.rankCents || a.label.localeCompare(b.label)
  );
}

/**
 * Keeps a breakdown to a readable number of lines.
 *
 * Past a handful, more slices stop telling anybody anything: the colours run
 * out of separation and the tail is a row of slivers. The ones that did not
 * make the cut are added into one line rather than dropped, so the parts still
 * come to the whole.
 */
export function foldTail(rows: BreakdownRow[], keep: number): BreakdownRow[] {
  if (rows.length <= keep) return rows;

  const head = rows.slice(0, keep - 1);
  const tail = rows.slice(keep - 1);

  return [
    ...head,
    {
      label: `${tail.length} more`,
      monetaryCents: tail.reduce((sum, row) => sum + row.monetaryCents, 0),
      inKindCents: tail.reduce((sum, row) => sum + row.inKindCents, 0),
      rankCents: tail.reduce((sum, row) => sum + row.rankCents, 0),
      count: tail.reduce((sum, row) => sum + row.count, 0),
    },
  ];
}
