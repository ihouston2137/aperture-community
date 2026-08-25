import { randomInt } from "node:crypto";
import { compareSync, hashSync } from "bcrypt-ts";

import { getAuthSettings } from "./auth-settings";
import { connectDB } from "./db";
import { VerificationCode } from "./models";
import {
  CODE_RESEND_SECONDS,
  MAX_CODE_ATTEMPTS,
  type VerificationPurpose,
} from "./verification-types";

export * from "./verification-types";

/**
 * A six-digit code, uniformly distributed across the whole range including the
 * ones with leading zeros. `Math.random` is not used anywhere in this file.
 */
function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type IssuedCode =
  | { ok: true; code: string; expiresAt: Date }
  | { ok: false; error: string; retryAfterSeconds?: number };

/**
 * Issues one code for one flow, retiring any earlier code for the same flow so
 * only the newest one works. Returns the plain code exactly once — it is never
 * stored, only its bcrypt hash, so a code that is not emailed here is lost.
 */
export async function issueCode(
  userId: string,
  purpose: VerificationPurpose,
  sentTo: string
): Promise<IssuedCode> {
  await connectDB();

  // Asking again immediately is nearly always a double-submitted form, and
  // answering it would invalidate the code already on its way.
  const recent = await VerificationCode.findOne({
    userId,
    purpose,
    consumedAt: null,
    createdAt: { $gt: new Date(Date.now() - CODE_RESEND_SECONDS * 1000) },
  })
    .sort({ createdAt: -1 })
    .lean<any>();

  if (recent) {
    const elapsed = Math.floor((Date.now() - new Date(recent.createdAt).getTime()) / 1000);
    return {
      ok: false,
      error: "A code was just sent. Check your inbox before asking for another.",
      retryAfterSeconds: Math.max(1, CODE_RESEND_SECONDS - elapsed),
    };
  }

  const { codeTtlMinutes } = await getAuthSettings();
  const code = generateCode();
  const expiresAt = new Date(Date.now() + codeTtlMinutes * 60 * 1000);

  await VerificationCode.deleteMany({ userId, purpose });
  await VerificationCode.create({
    userId,
    purpose,
    codeHash: hashSync(code, 10),
    sentTo,
    expiresAt,
    attempts: 0,
  });

  return { ok: true, code, expiresAt };
}

export type CodeCheck = { ok: true } | { ok: false; error: string };

/**
 * Checks a code and, when it matches, burns it so it cannot be replayed.
 *
 * Every failure reads the same to the caller apart from the reason, and a code
 * dies after `MAX_CODE_ATTEMPTS` wrong guesses — a six-digit code is only as
 * strong as the number of tries it allows.
 */
export async function consumeCode(
  userId: string,
  purpose: VerificationPurpose,
  code: string
): Promise<CodeCheck> {
  await connectDB();

  const entered = code.replace(/\D/g, "");
  if (entered.length !== 6) return { ok: false, error: "Enter the six-digit code." };

  const record = await VerificationCode.findOne({ userId, purpose, consumedAt: null })
    .sort({ createdAt: -1 })
    .exec();

  if (!record) {
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }
  if (new Date(record.expiresAt).getTime() < Date.now()) {
    await record.deleteOne();
    return { ok: false, error: "That code has expired. Ask for a new one." };
  }
  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    await record.deleteOne();
    return { ok: false, error: "Too many attempts. Ask for a new code." };
  }

  if (!compareSync(entered, record.codeHash)) {
    record.attempts += 1;
    await record.save();
    const left = MAX_CODE_ATTEMPTS - record.attempts;
    return {
      ok: false,
      error:
        left > 0
          ? `That code is not right. ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many attempts. Ask for a new code.",
    };
  }

  record.consumedAt = new Date();
  await record.save();
  // Nothing else may consume a code for this flow now.
  await VerificationCode.deleteMany({ userId, purpose, _id: { $ne: record._id } });
  return { ok: true };
}

/** Drops every outstanding code for an account — used when a password changes. */
export async function clearCodes(userId: string, purpose?: VerificationPurpose) {
  await connectDB();
  await VerificationCode.deleteMany({ userId, ...(purpose ? { purpose } : {}) });
}
