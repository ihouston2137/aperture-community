/**
 * Groups: what they hold, and how a member is named inside one.
 *
 * Kept free of database imports because the group manager is a client
 * component and reads these types and helpers — the same split
 * `lib/menu-types.ts` and `lib/page-source-types.ts` make, and for the same
 * reason: importing a *value* from a module that reaches Mongoose drags the
 * whole driver into the browser bundle.
 */

/**
 * One person's place in one group: who, and what they are in it.
 *
 * The title is the group's own — chair, treasurer, captain. It is not their
 * membership level, which says what they may reach across the site, and not
 * their profile title, which is theirs and follows them everywhere. Somebody
 * can chair one group and be an ordinary member of the next.
 */
export type GroupMember = {
  memberId: string;
  /** Empty means they hold no particular office in this group. */
  title: string;
};

/** A group reduced to what every caller needs, safe for a client component. */
export type MemberGroupSummary = {
  _id: string;
  name: string;
  description: string;
  members: GroupMember[];
  /**
   * Just the ids, in the same order.
   *
   * Derived rather than stored: most callers only ask who is in a group, and
   * making each of them dig the ids back out of `members` would be a worse
   * answer to a question the group can answer itself.
   */
  memberIds: string[];
};

const TITLE_LIMIT = 60;

function cleanTitle(value: unknown): string {
  return String(value ?? "").trim().slice(0, TITLE_LIMIT);
}

/**
 * Nobody blank, and nobody twice — the order they were added is kept.
 *
 * Where somebody appears twice the first entry wins, because that is the one
 * whose title was set first and the later one is the accident.
 */
export function normalizeGroupMembers(input: unknown): GroupMember[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const members: GroupMember[] = [];

  for (const raw of input.slice(0, 500)) {
    // Tolerates a bare id as well as a full entry, which is what makes the
    // pre-titles fallback in `toGroupSummary` a one-liner.
    const row = typeof raw === "string" ? { memberId: raw } : (raw ?? {});
    const memberId = String((row as Record<string, unknown>).memberId ?? "").trim();
    if (!memberId || seen.has(memberId)) continue;

    seen.add(memberId);
    members.push({
      memberId,
      title: cleanTitle((row as Record<string, unknown>).title),
    });
  }

  return members;
}

export function toGroupSummary(record: any): MemberGroupSummary {
  // A group saved before titles existed has `memberIds` and no `members`; its
  // people come back with empty titles, which is exactly what they had.
  const members = normalizeGroupMembers(
    Array.isArray(record.members) ? record.members : record.memberIds
  );

  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
    members,
    memberIds: members.map((member) => member.memberId),
  };
}

/** How somebody is named in a group: "Ada Lovelace (Chair)", or just the name. */
export function memberWithTitle(name: string, title: string): string {
  return title ? `${name} (${title})` : name;
}

/** The groups each member is in, for showing on a member's own row. */
export function groupsByMember(
  groups: MemberGroupSummary[]
): Map<string, string[]> {
  const byMember = new Map<string, string[]>();

  for (const group of groups) {
    for (const member of group.members) {
      // The group, and what they are in it — "Committee (Chair)" says more than
      // "Committee" and costs the same line.
      const label = memberWithTitle(group.name, member.title);
      const existing = byMember.get(member.memberId);
      if (existing) existing.push(label);
      else byMember.set(member.memberId, [label]);
    }
  }

  for (const names of byMember.values()) {
    names.sort((a, b) => a.localeCompare(b));
  }

  return byMember;
}
