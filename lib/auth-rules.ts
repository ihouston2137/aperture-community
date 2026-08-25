/**
 * Shared by the account forms and the actions behind them.
 *
 * They live here rather than in `app/auth-actions.ts` because a `"use server"`
 * module may only export async functions — a constant exported from one turns
 * the whole file into something the client cannot import at all.
 */

/** Every password in the app, wherever it is set, answers to this. */
export const MIN_PASSWORD_LENGTH = 10;

export type AuthFormState = { error?: string; message?: string } | undefined;

/**
 * Where to send somebody after they sign in from a popup: back to the page they
 * were reading.
 *
 * The value arrives in a form field, so it is attacker-controlled. Only a path
 * on this site is allowed through — anything protocol-relative (`//evil.test`),
 * backslash-escaped, or carrying a scheme is dropped, which leaves the caller
 * to fall back to its own destination.
 */
export function safeNextPath(value: unknown): string {
  const path = String(value ?? "").trim();
  if (!path.startsWith("/")) return "";
  if (path.startsWith("//") || path.startsWith("/\\")) return "";
  // A signed-in member landing back on an account screen is a dead end.
  if (/^\/(login|register|verify|forgot-password)(\/|$|\?)/.test(path)) return "";
  return path;
}
