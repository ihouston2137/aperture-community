import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";

import { safeNextPath } from "./auth-rules";
import type { VerificationPurpose } from "./verification-types";

export const SESSION_COOKIE = "aperture_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // seven days

/**
 * Half-signed-in state: the password (or the registration form) was accepted,
 * but a six-digit code has not been. It is a separate, short-lived cookie so
 * that holding it can never be mistaken for holding a session.
 */
export const PENDING_COOKIE = "aperture_pending";
const PENDING_MAX_AGE = 60 * 30; // thirty minutes

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  mustChangePassword: boolean;
};

export type PendingAuth = {
  userId: string;
  email: string;
  name: string;
  purpose: VerificationPurpose;
  /** Where to land once the code is accepted; empty means the default. */
  next: string;
};

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set. Copy .env.example to .env.local.");
  }
  return new TextEncoder().encode(secret);
}

async function sign(payload: Record<string, unknown>, maxAge: number) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(secretKey());
}

export async function createSession(payload: SessionPayload) {
  const token = await sign({ ...payload }, SESSION_MAX_AGE);

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      algorithms: ["HS256"],
    });
    if (!payload.userId || typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      mustChangePassword: Boolean(payload.mustChangePassword),
    };
  } catch {
    return null;
  }
}

/**
 * @param allowPasswordChange when true, users flagged `mustChangePassword` are
 * allowed through — used only by `/admin/change-password`.
 */
export async function requireSession(allowPasswordChange = false): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword && !allowPasswordChange) {
    redirect("/admin/change-password");
  }
  return session;
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/* ------------------------------------------------------ Pending verification */

export async function createPendingAuth(payload: PendingAuth) {
  const token = await sign({ ...payload }, PENDING_MAX_AGE);

  const store = await cookies();
  store.set(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_MAX_AGE,
  });
}

export async function getPendingAuth(): Promise<PendingAuth | null> {
  const store = await cookies();
  const token = store.get(PENDING_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (!payload.userId || typeof payload.userId !== "string") return null;
    const purpose = String(payload.purpose ?? "");
    if (purpose !== "email" && purpose !== "login" && purpose !== "password") return null;

    return {
      userId: payload.userId,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      purpose,
      next: safeNextPath(payload.next),
    };
  } catch {
    return null;
  }
}

export async function clearPendingAuth() {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}
