import { connectDB } from "./db";
import { MemberRelationship } from "./models";

/** A relationship reduced to what every caller needs, safe for a client component. */
export type RelationshipSummary = {
  _id: string;
  memberId: string;
  /** How the related members are listed on the subject's entry. */
  label: string;
  /** How the subject is listed on each related member's entry. */
  reverseLabel: string;
  relatedIds: string[];
};

/**
 * One line on a directory entry: what the relationship is called from this
 * member's side, and everybody on the other end of it.
 *
 * Both directions produce the same shape, because a relationship is one fact
 * seen from two ends rather than two different kinds of thing.
 */
export type MemberLink = { label: string; people: string[] };

export function toRelationshipSummary(record: any): RelationshipSummary {
  return {
    _id: String(record._id),
    memberId: String(record.memberId ?? ""),
    label: String(record.label ?? ""),
    reverseLabel: String(record.reverseLabel ?? ""),
    relatedIds: (record.relatedIds ?? []).map(String).filter(Boolean),
  };
}

export async function getRelationships(): Promise<RelationshipSummary[]> {
  await connectDB();
  const records = await MemberRelationship.find().sort({ label: 1 }).lean<any[]>();
  return records.map(toRelationshipSummary);
}

/** Cleans a submitted relationship: no blanks, no duplicates, nobody twice. */
export function normalizeRelatedIds(
  memberId: string,
  relatedIds: string[]
): string[] {
  const seen = new Set<string>();
  for (const id of relatedIds) {
    const value = String(id ?? "").trim();
    // Relating somebody to themselves says nothing.
    if (value && value !== memberId) seen.add(value);
  }
  return [...seen];
}

/**
 * Indexes every relationship by the members it touches, from both ends, so a
 * directory can render one entry without searching the whole list again.
 *
 * `nameOf` returns an empty string for an account that has since gone, and
 * those are dropped rather than shown as a gap.
 */
export function linksByMember(
  relationships: RelationshipSummary[],
  nameOf: (memberId: string) => string
): Map<string, MemberLink[]> {
  const links = new Map<string, MemberLink[]>();

  const add = (memberId: string, link: MemberLink) => {
    const existing = links.get(memberId);
    if (existing) existing.push(link);
    else links.set(memberId, [link]);
  };

  for (const relationship of relationships) {
    const subject = nameOf(relationship.memberId);
    if (!subject) continue;

    const present = relationship.relatedIds.filter((id) => nameOf(id));
    if (present.length === 0) continue;

    add(relationship.memberId, {
      label: relationship.label,
      people: present.map(nameOf).sort((a, b) => a.localeCompare(b)),
    });

    // A record saved before relationships read both ways has no wording for
    // this end; naming the other end is better than saying nothing.
    const reverse = relationship.reverseLabel.trim() || `In ${subject}'s "${relationship.label}"`;

    for (const relatedId of present) {
      add(relatedId, { label: reverse, people: [subject] });
    }
  }

  for (const list of links.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  return links;
}
