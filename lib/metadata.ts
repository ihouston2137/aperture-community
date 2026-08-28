/**
 * Reading metadata groups and their answers out of the database.
 *
 * Split from `lib/metadata-types.ts` the way every other pair in this codebase
 * is: the editors are client components and import the types, and this module
 * reaches Mongoose.
 */

import { connectDB } from "./db";
import { MetadataAnswer, MetadataGroup, User } from "./models";
import {
  managedBy,
  normalizeEntries,
  normalizeQuestions,
  unanswered,
  type MetadataAnswerSummary,
  type MetadataEntry,
  type MetadataGroupSummary,
} from "./metadata-types";

export * from "./metadata-types";

function ids(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry ?? "").trim()).filter(Boolean))]
    : [];
}

export function toMetadataGroup(record: any): MetadataGroupSummary {
  return {
    _id: String(record._id),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
    managedBy: managedBy(record.managedBy),
    roleIds: ids(record.roleIds),
    questions: normalizeQuestions(record.questions),
    isRepeatable: Boolean(record.isRepeatable),
    entryLabel: String(record.entryLabel ?? "").trim(),
    maxEntries: Math.max(0, Number(record.maxEntries ?? 0) || 0),
    viewRoleIds: ids(record.viewRoleIds),
    viewUserIds: ids(record.viewUserIds),
    editRoleIds: ids(record.editRoleIds),
    editUserIds: ids(record.editUserIds),
    reportRoleIds: ids(record.reportRoleIds),
    reportUserIds: ids(record.reportUserIds),
  };
}

export async function getMetadataGroups(): Promise<MetadataGroupSummary[]> {
  await connectDB();
  const records = await MetadataGroup.find().sort({ name: 1 }).lean<any[]>();
  return records.map(toMetadataGroup);
}

export async function getMetadataGroup(
  id: string
): Promise<MetadataGroupSummary | null> {
  if (!id) return null;
  await connectDB();
  const record = await MetadataGroup.findById(id).lean<any>();
  return record ? toMetadataGroup(record) : null;
}

export function toMetadataAnswer(
  record: any,
  group: MetadataGroupSummary
): MetadataAnswerSummary {
  return {
    _id: String(record._id),
    userId: String(record.userId ?? ""),
    groupId: String(record.groupId ?? ""),
    // Read against the questions as they stand now, so an answer to a question
    // since deleted, or an option since removed, quietly falls away. `values`
    // is the shape answers had before groups could repeat.
    entries: normalizeEntries(record.entries ?? record.values, group),
    updatedAt: record.updatedAt ? new Date(record.updatedAt).toISOString() : "",
  };
}

/** Everybody's answers to one group, by user id. */
export async function getGroupAnswers(
  group: MetadataGroupSummary
): Promise<Map<string, MetadataAnswerSummary>> {
  await connectDB();
  const records = await MetadataAnswer.find({ groupId: group._id }).lean<any[]>();

  const byUser = new Map<string, MetadataAnswerSummary>();
  for (const record of records) {
    const answer = toMetadataAnswer(record, group);
    byUser.set(answer.userId, answer);
  }
  return byUser;
}

/** One member's answers to one group, or nothing when they have none. */
export async function getAnswer(
  userId: string,
  group: MetadataGroupSummary
): Promise<MetadataEntry[]> {
  await connectDB();
  const record = await MetadataAnswer.findOne({
    userId,
    groupId: group._id,
  }).lean<any>();
  return record ? toMetadataAnswer(record, group).entries : [];
}

/**
 * The groups asked of one member, by the roles they hold.
 *
 * Whether the account is active is not asked. A group is asked of a role, and
 * an inactive member still held theirs — which is what keeps a report of last
 * year's committee readable after they have gone.
 */
export function groupsForRoles(
  groups: MetadataGroupSummary[],
  roleIds: string[]
): MetadataGroupSummary[] {
  return groups.filter((group) =>
    group.roleIds.some((roleId) => roleIds.includes(roleId))
  );
}

/** The members a group is asked of, whether or not they are still active. */
export async function membersForGroup(
  group: MetadataGroupSummary
): Promise<any[]> {
  await connectDB();
  if (group.roleIds.length === 0) return [];
  return User.find({ roleIds: { $in: group.roleIds } })
    .select("_id firstName lastName name email roleIds isActive")
    .sort({ lastName: 1, firstName: 1, email: 1 })
    .lean<any[]>();
}

/**
 * What this member still owes, and what they may fill in.
 *
 * Only member-managed groups: a manager-managed one is never put to the person
 * it is about, so it can never be outstanding for them.
 */
export type MemberMetadataTask = {
  group: MetadataGroupSummary;
  entries: MetadataEntry[];
  /** Required questions still blank, across every entry. */
  outstanding: number;
};

export async function memberMetadataTasks(
  userId: string,
  roleIds: string[]
): Promise<MemberMetadataTask[]> {
  const groups = groupsForRoles(await getMetadataGroups(), roleIds).filter(
    (group) => group.managedBy === "member" && group.questions.length > 0
  );
  if (groups.length === 0) return [];

  await connectDB();
  const records = await MetadataAnswer.find({
    userId,
    groupId: { $in: groups.map((group) => group._id) },
  }).lean<any[]>();

  return groups.map((group) => {
    const record = records.find(
      (entry) => String(entry.groupId) === group._id
    );
    const entries = record ? toMetadataAnswer(record, group).entries : [];
    return { group, entries, outstanding: unanswered(group, entries).length };
  });
}

/** How many required questions this member has left, across every group. */
export async function outstandingMetadataCount(
  userId: string,
  roleIds: string[]
): Promise<number> {
  const tasks = await memberMetadataTasks(userId, roleIds);
  return tasks.reduce((total, task) => total + task.outstanding, 0);
}
