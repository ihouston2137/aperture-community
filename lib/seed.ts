import { hashSync } from "bcrypt-ts";

import { connectDB } from "./db";
import { Role, User } from "./models";
import { ensureAdministratorRole, ensureDefaultCommunityRole } from "./access";

let seedPromise: Promise<void> | null = null;

/**
 * Brings accounts created before the portal existed up to the current shape.
 *
 * Everyone already in the database was put there by an administrator, so they
 * are treated as verified and approved — asking an existing user to confirm an
 * address they were given by hand would lock them out of their own site.
 */
async function backfillAccounts() {
  /**
   * Every role that predates the portal is a management role.
   *
   * Written to the documents rather than left to the schema default: a default
   * only fills the field in on read, and the queries that select roles by kind
   * would skip a document that has no `kind` stored at all.
   */
  await Role.updateMany({ kind: { $exists: false } }, { $set: { kind: "management" } });

  await User.updateMany(
    { membershipStatus: { $exists: false } },
    { $set: { membershipStatus: "active" } }
  );

  const unverified = await User.find({
    $or: [{ emailVerifiedAt: { $exists: false } }, { emailVerifiedAt: null }],
    createdAt: { $lt: new Date() },
    firstName: { $exists: false },
  }).select("_id name createdAt");

  for (const user of unverified) {
    // A single stored name splits on the first space: everything after it is
    // the last name, so "Ana Maria Silva" keeps "Silva" as the surname only if
    // it was typed that way. Both halves stay editable in the admin.
    const parts = String(user.name ?? "").trim().split(/\s+/).filter(Boolean);
    user.firstName = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0] ?? "";
    user.lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    user.emailVerifiedAt = user.createdAt ?? new Date();
    await user.save();
  }
}

/**
 * Creates the Administrator role, the starting membership level and the seed
 * account. Exported so a reset can rebuild them in a process that has already
 * run `ensureSeed` — that one is memoised and would not run a second time.
 */
export async function runSeed() {
  await connectDB();
  const adminRole = await ensureAdministratorRole();
  await ensureDefaultCommunityRole();
  await backfillAccounts();

  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (!email || !password) return;

  const existing = await User.findOne({ email });
  if (existing) {
    // Keep the seed account attached to Administrator even if roles changed.
    const hasRole = existing.roleIds.some(
      (roleId: { toString(): string }) => roleId.toString() === adminRole._id.toString()
    );
    if (!hasRole) {
      existing.roleIds = [...existing.roleIds, adminRole._id];
      await existing.save();
    }
    return;
  }

  await User.create({
    email,
    passwordHash: hashSync(password, 10),
    firstName: "Site",
    lastName: "Administrator",
    name: "Administrator",
    mustChangePassword: true,
    roleIds: [adminRole._id],
    // The seed account never waits on a code or on approval — it is the account
    // that grants them.
    membershipStatus: "active",
    emailVerifiedAt: new Date(),
    isActive: true,
  });
}

/** Idempotent; safe to call from any server entry point. */
export async function ensureSeed() {
  if (!seedPromise) {
    seedPromise = runSeed().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
}
