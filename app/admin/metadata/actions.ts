"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getUserAccess, requirePermission } from "@/lib/access";
import { connectDB } from "@/lib/db";
import { getMetadataGroup } from "@/lib/metadata";
import {
  canEditGroup,
  managedBy,
  METADATA_PERMISSIONS,
  normalizeEntries,
  normalizeQuestions,
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
    reportRows: reportDimension(formData.get("reportRows")),
    reportColumns: reportDimension(formData.get("reportColumns")),
    reportSumIds: list("reportSumIds"),
    viewRoleIds: list("viewRoleIds"),
    viewUserIds: list("viewUserIds"),
    editRoleIds: list("editRoleIds"),
    editUserIds: list("editUserIds"),
    reportRoleIds: list("reportRoleIds"),
    reportUserIds: list("reportUserIds"),
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
