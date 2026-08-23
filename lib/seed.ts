import { hashSync } from "bcrypt-ts";

import { connectDB } from "./db";
import { User } from "./models";
import { ensureAdministratorRole } from "./access";

let seedPromise: Promise<void> | null = null;

/**
 * Creates the Administrator role and the seed account. Exported so a reset can
 * rebuild them in a process that has already run `ensureSeed` — that one is
 * memoised and would not run a second time.
 */
export async function runSeed() {
  await connectDB();
  const adminRole = await ensureAdministratorRole();

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
    name: "Administrator",
    mustChangePassword: true,
    roleIds: [adminRole._id],
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
