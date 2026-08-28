"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { hashSync } from "bcrypt-ts";

import { requirePermission } from "@/lib/access";
import { parseCsv } from "@/lib/csv";
import { connectDB } from "@/lib/db";
import { syncMemberProfile } from "@/lib/member-profiles";
import { composeName, getRoleSummaries, isEmailAddress, normalizePhone } from "@/lib/members";
import { User } from "@/lib/models";
import { membershipStatus } from "@/lib/permissions";
import {
  buildDraft,
  draftProblem,
  IMPORT_MODES,
  type ImportMapping,
  type ImportMode,
  type ImportReport,
} from "@/lib/user-import";

/**
 * The dialogs stay open on failure to show the message, so these actions report
 * back rather than returning silently.
 */
export type UserActionResult = { ok: boolean; error?: string };

export async function saveUserAction(formData: FormData): Promise<UserActionResult> {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const phone = normalizePhone(String(formData.get("phone") ?? ""));
  const password = String(formData.get("password") ?? "");
  const isActive = formData.get("isActive") === "on";
  const emailVerified = formData.get("emailVerified") === "on";
  const status = membershipStatus(formData.get("membershipStatus"));
  const roleIds = formData.getAll("roleIds").map(String).filter(Boolean);

  if (!email) return { ok: false, error: "An email address is required." };
  if (!isEmailAddress(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }
  if (!firstName && !lastName) {
    return { ok: false, error: "Enter a first or last name." };
  }

  // `email` is unique in the schema; checking first turns a driver-level
  // duplicate-key throw into a message the dialog can show.
  const clash = await User.findOne({ email, ...(id ? { _id: { $ne: id } } : {}) })
    .select("_id")
    .lean();
  if (clash) return { ok: false, error: "Another account already uses that email." };

  // Any of these ends your own access the moment the page reloads.
  if (id && id === session.userId && (!isActive || status !== "active")) {
    return { ok: false, error: "You cannot lock yourself out of your own account." };
  }

  if (id) {
    const user = await User.findById(id);
    if (!user) return { ok: false, error: "That account no longer exists." };

    user.email = email;
    user.firstName = firstName;
    user.lastName = lastName;
    user.name = composeName(firstName, lastName, user.name);
    user.phone = phone;
    user.isActive = isActive;
    user.membershipStatus = status;
    user.roleIds = roleIds;
    if (emailVerified && !user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    if (!emailVerified) user.emailVerifiedAt = null;
    if (password) {
      user.passwordHash = hashSync(password, 10);
      user.mustChangePassword = true;
    }
    await user.save();
    // The name and the level shown on their profile are read from the account.
    await syncMemberProfile(String(user._id));
  } else {
    if (!password) return { ok: false, error: "Set a temporary password." };
    const created = await User.create({
      email,
      firstName,
      lastName,
      name: composeName(firstName, lastName),
      phone,
      passwordHash: hashSync(password, 10),
      // New accounts always pick their own password on first sign-in.
      mustChangePassword: true,
      isActive,
      membershipStatus: status,
      // Created by hand from inside the admin, so the address is taken as
      // known — nobody should have to confirm an address given to them.
      emailVerifiedAt: emailVerified ? new Date() : null,
      roleIds,
    });
    await syncMemberProfile(String(created._id));
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/members");
  revalidatePath("/admin/profiles");
  return { ok: true };
}

export async function deleteUserAction(formData: FormData): Promise<UserActionResult> {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "That account no longer exists." };
  // Deleting your own account would lock you out mid-session.
  if (id === session.userId) {
    return { ok: false, error: "You cannot delete your own account." };
  }

  await User.findByIdAndDelete(id);

  revalidatePath("/admin/users");
  revalidatePath("/admin/members");
  return { ok: true };
}

/* ---------------------------------------------------------------- Import */

/**
 * Accounts in bulk, from a file exported by whatever the site is replacing.
 *
 * Silent by design. Nothing here sends a verification code, a welcome, or the
 * new-registration notice: an import is a records exercise, and eighty people
 * receiving mail because somebody moved a spreadsheet would be a mess nobody
 * could take back. `registrationNotifiedAt` is stamped on the way in so a
 * later pass over the accounts cannot decide they are new arrivals either.
 *
 * A password is only carried over when the file holds a real bcrypt hash. Any
 * other account is given one nobody knows, so it exists, holds its roles, and
 * cannot be signed into until somebody sets a password for it.
 */
export async function importUsersAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string; report?: ImportReport }> {
  const { session } = await requirePermission("users.manage");
  await connectDB();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a CSV file." };
  }

  let mapping: ImportMapping;
  try {
    mapping = JSON.parse(String(formData.get("mapping") ?? "{}"));
  } catch {
    return { ok: false, error: "Could not read the column mapping." };
  }
  if (!mapping.email) {
    return { ok: false, error: "Say which column holds the email address." };
  }

  const modeInput = String(formData.get("mode") ?? "skip");
  const mode: ImportMode = IMPORT_MODES.includes(modeInput as ImportMode)
    ? (modeInput as ImportMode)
    : "skip";

  // Parsed here from the bytes rather than trusted from the screen: what the
  // browser showed was a preview, and this is the thing being written.
  const { headers, rows } = parseCsv(await file.text());
  if (rows.length === 0) return { ok: false, error: "That file has no rows." };

  const roles = await getRoleSummaries();
  const roleByName = new Map<string, string>();
  for (const role of roles) {
    roleByName.set(role.name.trim().toLowerCase(), role._id);
    roleByName.set(role.slug.trim().toLowerCase(), role._id);
  }

  const report: ImportReport = {
    created: 0,
    updated: 0,
    skipped: 0,
    problems: [],
    unknownRoles: [],
  };
  const unknownRoles = new Set<string>();
  const seen = new Set<string>();

  for (const [index, row] of rows.entries()) {
    // The header is row one on screen, so the first record is row two.
    const rowNumber = index + 2;
    const draft = buildDraft(row, headers, mapping);

    const problem = draftProblem(draft);
    if (problem) {
      report.problems.push({ row: rowNumber, message: problem });
      continue;
    }

    // One file listing the same address twice would otherwise create the
    // account and then fall over the unique index on the second attempt.
    if (seen.has(draft.email)) {
      report.problems.push({
        row: rowNumber,
        message: `${draft.email} appears more than once in this file.`,
      });
      continue;
    }
    seen.add(draft.email);

    const roleIds: string[] = [];
    for (const name of draft.roleNames) {
      const roleId = roleByName.get(name.toLowerCase());
      if (roleId) roleIds.push(roleId);
      else unknownRoles.add(name);
    }

    const existing = await User.findOne({ email: draft.email });

    if (existing) {
      if (mode === "skip") {
        report.skipped += 1;
        continue;
      }

      // Never through this door: the signed-in account could be deactivated or
      // stripped of its roles by a row in a spreadsheet, ending the session
      // that is running the import.
      if (String(existing._id) === session.userId) {
        report.problems.push({
          row: rowNumber,
          message: "That is your own account, which an import will not change.",
        });
        continue;
      }

      existing.firstName = draft.firstName || existing.firstName;
      existing.lastName = draft.lastName || existing.lastName;
      existing.name = composeName(
        existing.firstName,
        existing.lastName,
        draft.name || existing.name
      );
      if (draft.phone) existing.phone = draft.phone;
      if (roleIds.length > 0) existing.roleIds = roleIds;
      existing.membershipStatus = draft.membershipStatus;
      existing.isActive = draft.isActive;
      if (draft.passwordHash) existing.passwordHash = draft.passwordHash;
      if (draft.emailVerified && !existing.emailVerifiedAt) {
        existing.emailVerifiedAt = new Date();
      }
      await existing.save();
      await syncMemberProfile(String(existing._id));
      report.updated += 1;
      continue;
    }

    const created = await User.create({
      email: draft.email,
      firstName: draft.firstName,
      lastName: draft.lastName,
      name: composeName(draft.firstName, draft.lastName, draft.name),
      phone: draft.phone,
      // A hash of something random: the account is real and nobody can sign
      // into it, which is the only honest state for an account imported
      // without a password and without a way to tell anybody about it.
      passwordHash: draft.passwordHash || hashSync(randomUUID(), 10),
      mustChangePassword: !draft.passwordHash,
      roleIds,
      membershipStatus: draft.membershipStatus,
      isActive: draft.isActive,
      emailVerifiedAt: draft.emailVerified ? new Date() : null,
      // Stamped so the new-registration notice can never fire for an account
      // that did not register — it was carried over.
      registrationNotifiedAt: new Date(),
    });
    await syncMemberProfile(String(created._id));
    report.created += 1;
  }

  report.unknownRoles = [...unknownRoles].sort();

  revalidatePath("/admin/users");
  revalidatePath("/admin/members");
  revalidatePath("/admin/profiles");
  return { ok: true, report };
}
