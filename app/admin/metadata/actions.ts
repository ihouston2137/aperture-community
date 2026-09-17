"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getUserAccess, requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getMetadataGroup, toMetadataAnswer } from "@/lib/metadata";
import {
  canEditGroup,
  isChoiceType,
  managedBy,
  METADATA_PERMISSIONS,
  normalizeEntries,
  normalizeQuestions,
  type MetadataEntry,
  type MetadataViewer,
} from "@/lib/metadata-types";
import { reportDimension } from "@/lib/metadata-report";
import { MetadataAnswer, MetadataGroup } from "@/lib/models";
import { requireSession } from "@/lib/session";

/** The dialog stays open on failure to show the message, so these report back. */
export type MetadataResult = { ok: boolean; error?: string };

function revalidate() {
  revalidatePath("/admin/metadata", "layout");
  revalidatePath("/dashboard", "layout");
}

/**
 * Defining a group is one permission and one screen.
 *
 * Who may then read or change what it holds is decided on the group itself —
 * see the access lists — so this is deliberately the only action that asks for
 * `members.metadata`.
 */
export async function saveMetadataGroupAction(
  formData: FormData
): Promise<MetadataResult> {
  await requirePermission("members.metadata");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 160);
  if (!name) return { ok: false, error: "Name the group." };

  let questions;
  try {
    questions = normalizeQuestions(
      JSON.parse(String(formData.get("questions") ?? "[]"))
    );
  } catch {
    return { ok: false, error: "Could not read those questions." };
  }
  if (questions.length === 0) {
    return { ok: false, error: "A group with no questions asks nothing." };
  }

  // A question keeps its id for life, because answers are stored against it.
  // Anything arriving without one is new; a repeat would take another
  // question's answers.
  const seen = new Set<string>();
  questions = questions.map((question) => {
    const questionId =
      !question.id || seen.has(question.id) ? randomUUID() : question.id;
    seen.add(questionId);
    return { ...question, id: questionId };
  });

  const list = (key: string) =>
    [...new Set(formData.getAll(key).map(String).filter(Boolean))];

  const payload = {
    name,
    description: String(formData.get("description") ?? "").trim().slice(0, 2000),
    managedBy: managedBy(formData.get("managedBy")),
    roleIds: list("roleIds"),
    questions,
    isRepeatable: formData.get("isRepeatable") === "on",
    entryLabel: String(formData.get("entryLabel") ?? "").trim().slice(0, 60),
    maxEntries: Math.max(
      0,
      Math.min(50, Number(formData.get("maxEntries") ?? 0) || 0)
    ),
    reportGroupBy: reportDimension(formData.get("reportGroupBy")),
    reportGroupQuestionId: String(
      formData.get("reportGroupQuestionId") ?? ""
    ).trim(),
    reportCountBy: reportDimension(formData.get("reportCountBy")),
    reportCountQuestionId: String(
      formData.get("reportCountQuestionId") ?? ""
    ).trim(),
    reportSumIds: list("reportSumIds"),
    viewRoleIds: list("viewRoleIds"),
    viewUserIds: list("viewUserIds"),
    editRoleIds: list("editRoleIds"),
    editUserIds: list("editUserIds"),
    reportRoleIds: list("reportRoleIds"),
    reportUserIds: list("reportUserIds"),
    isReportEditable: formData.get("isReportEditable") === "on",
  };

  if (id) await MetadataGroup.findByIdAndUpdate(id, payload);
  else await MetadataGroup.create(payload);

  revalidate();
  return { ok: true };
}

export async function deleteMetadataGroupAction(
  formData: FormData
): Promise<MetadataResult> {
  await requirePermission("members.metadata");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That group no longer exists." };

  // The answers belong to the group; nothing else can read them once it is
  // gone, so they go with it rather than lingering as orphans.
  await MetadataAnswer.deleteMany({ groupId: id });
  await MetadataGroup.findByIdAndDelete(id);

  revalidate();
  return { ok: true };
}

/**
 * A manager filling in what is kept about a member.
 *
 * Guarded by the group rather than by a blanket permission: `members.metadata`
 * defines groups and carries everything, but somebody named on one group's
 * edit list may write that group and no other.
 */
export async function saveManagedAnswerAction(
  formData: FormData
): Promise<MetadataResult> {
  const session = await requireSession();
  const { permissions, roleIds } = await getUserAccess(session.userId);
  await connectDB();

  const groupId = String(formData.get("groupId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const group = await getMetadataGroup(groupId);
  if (!group) return { ok: false, error: "That group no longer exists." };
  if (group.managedBy !== "manager") {
    return { ok: false, error: "That group is answered by members themselves." };
  }

  const viewer: MetadataViewer = {
    userId: session.userId,
    roleIds,
    permissions,
    isDefiner: permissions.includes(METADATA_PERMISSIONS.define),
  };
  if (!canEditGroup(viewer, group)) {
    return { ok: false, error: "You cannot change this group's answers." };
  }

  let entries;
  try {
    entries = normalizeEntries(
      JSON.parse(String(formData.get("entries") ?? "[]")),
      group
    );
  } catch {
    return { ok: false, error: "Could not read those answers." };
  }

  await MetadataAnswer.findOneAndUpdate(
    { userId, groupId },
    {
      userId,
      groupId,
      entries,
      updatedById: session.userId,
      // The pre-repetition field, cleared so nothing reads it back as an entry.
      $unset: { values: "" },
    },
    { upsert: true }
  );

  revalidatePath("/admin/metadata", "layout");
  return { ok: true };
}

/** One choice cell changed on the report: whose, which entry, which question. */
export type ReportChoiceChange = {
  userId: string;
  /** `none` for a member with no entry yet — saving makes their first. */
  entryId: string;
  questionId: string;
  choices: string[];
};

/**
 * Choice answers changed in place, from the report's edit mode.
 *
 * Each change is laid over what is on file rather than replacing the member's
 * record wholesale, so a text answer somebody else saved while the report sat
 * open is not quietly put back to what the report was showing.
 */
export async function saveReportChoicesAction(
  formData: FormData
): Promise<MetadataResult> {
  const session = await requireSession();
  const { permissions, roleIds } = await getUserAccess(session.userId);
  await connectDB();

  const group = await getMetadataGroup(String(formData.get("groupId") ?? ""));
  if (!group) return { ok: false, error: "That group no longer exists." };
  if (group.managedBy !== "manager" || !group.isReportEditable) {
    return { ok: false, error: "This group's answers are not changed from the report." };
  }

  const viewer: MetadataViewer = {
    userId: session.userId,
    roleIds,
    permissions,
    isDefiner: permissions.includes(METADATA_PERMISSIONS.define),
  };
  if (!canEditGroup(viewer, group)) {
    return { ok: false, error: "You cannot change this group's answers." };
  }

  let changes: ReportChoiceChange[];
  try {
    const parsed = JSON.parse(String(formData.get("changes") ?? "[]"));
    changes = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { ok: false, error: "Could not read those changes." };
  }

  // Only the choice questions: the text ones are not edited in place.
  const choiceIds = new Set(
    group.questions
      .filter((question) => isChoiceType(question.type))
      .map((question) => question.id)
  );

  const byUser = new Map<string, ReportChoiceChange[]>();
  for (const raw of changes.slice(0, 5000)) {
    const change = {
      userId: String(raw?.userId ?? "").trim(),
      entryId: String(raw?.entryId ?? "").trim(),
      questionId: String(raw?.questionId ?? "").trim(),
      choices: Array.isArray(raw?.choices) ? raw.choices.map(String) : [],
    };
    if (!change.userId || !change.entryId || !choiceIds.has(change.questionId)) {
      continue;
    }
    byUser.set(change.userId, [...(byUser.get(change.userId) ?? []), change]);
  }
  if (byUser.size === 0) return { ok: true };

  const stored = await MetadataAnswer.find({
    groupId: group._id,
    userId: { $in: [...byUser.keys()] },
  }).lean<any[]>();

  for (const [userId, userChanges] of byUser) {
    const record = stored.find((entry) => String(entry.userId) === userId);
    const entries: MetadataEntry[] = record
      ? toMetadataAnswer(record, group).entries
      : [];

    for (const change of userChanges) {
      let entry = entries.find((candidate) => candidate.id === change.entryId);
      // A member with nothing on file is shown one blank line; a change to it
      // is their first entry. Anybody else's `none` is a stale screen.
      if (!entry && change.entryId === "none" && entries.length === 0) {
        entry = { id: randomUUID(), values: [] };
        entries.push(entry);
      }
      if (!entry) continue;

      entry.values = [
        ...entry.values.filter((value) => value.questionId !== change.questionId),
        { questionId: change.questionId, text: "", choices: change.choices },
      ];
    }

    await MetadataAnswer.findOneAndUpdate(
      { userId, groupId: group._id },
      {
        userId,
        groupId: group._id,
        // Normalised again, so a choice the question no longer offers is dropped.
        entries: normalizeEntries(entries, group),
        updatedById: session.userId,
        $unset: { values: "" },
      },
      { upsert: true }
    );
  }

  revalidatePath("/admin/metadata", "layout");
  return { ok: true };
}
