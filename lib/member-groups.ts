import { connectDB } from "./db";
import { MemberGroup } from "./models";

/** A group reduced to what every caller needs, safe for a client component. */
export type MemberGroupSummary = {
  _id: string;
  name: string;
  description: string;
  memberIds: string[];
};

export function toGroupSummary(record: any): MemberGroupSummary {
  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
    memberIds: (record.memberIds ?? []).map(String).filter(Boolean),
  };
}

export async function getMemberGroups(): Promise<MemberGroupSummary[]> {
  await connectDB();
  const records = await MemberGroup.find().sort({ name: 1 }).lean<any[]>();
  return records.map(toGroupSummary);
}

/** Nobody blank, and nobody twice — the order they were added is kept. */
export function normalizeGroupMemberIds(memberIds: string[]): string[] {
  const seen = new Set<string>();
  for (const id of memberIds) {
    const value = String(id ?? "").trim();
    if (value) seen.add(value);
  }
  return [...seen];
}

/** The groups each member is in, for showing on a member's own row. */
export function groupsByMember(
  groups: MemberGroupSummary[]
): Map<string, string[]> {
  const byMember = new Map<string, string[]>();

  for (const group of groups) {
    for (const memberId of group.memberIds) {
      const existing = byMember.get(memberId);
      if (existing) existing.push(group.name);
      else byMember.set(memberId, [group.name]);
    }
  }

  for (const names of byMember.values()) {
    names.sort((a, b) => a.localeCompare(b));
  }

  return byMember;
}
