import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";

import { safeNextPath } from "./auth-rules";
import type { VerificationPurpose } from "./verification-types";
import { USER_VIEW_COOKIE, signUserView, verifyUserView } from "./user-view-token";

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
  /** Present only when an administrator is interacting as this account. */
  impersonatorId?: string;
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
  store.delete(USER_VIEW_COOKIE);
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Profile/password edits refresh the effective account without replacing its administrator. */
export async function refreshSession(payload: SessionPayload) {
  if ((await cookies()).has(USER_VIEW_COOKIE)) {
    const session = await getSession();
    if (!session?.impersonatorId || session.userId !== payload.userId) {
      throw new Error("The user view is no longer available. Return to your administrator account.");
    }
    // User-view sessions read these fields from the account on every request.
    return;
  }
  await createSession(payload);
}

/** Original authenticated identity. Only the user-view controls should bypass getSession. */
export async function getAuthenticatedSession(): Promise<SessionPayload | null> {
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

/** All normal authorization and account reads use the effective user's identity. */
export async function getSession(): Promise<SessionPayload | null> {
  const actor = await getAuthenticatedSession();
  if (!actor) return null;
  const store = await cookies();
  const view = store.get(USER_VIEW_COOKIE)?.value;
  if (!store.has(USER_VIEW_COOKIE)) return actor;

  const targetId = await verifyUserView(view ?? "", actor.userId, store.get(SESSION_COOKIE)!.value, secretKey());
  // Invalid or expired previews fail closed; never silently run a user's action as admin.
  if (!targetId || actor.mustChangePassword) return null;
  const { getUserAccess } = await import("./access");
  if (!(await getUserAccess(actor.userId)).isAdministrator) return null;
  const { User } = await import("./models");
  const user = await User.findById(targetId).select("email name firstName lastName mustChangePassword isActive membershipStatus").lean<{
    email: string; name?: string; firstName?: string; lastName?: string;
    mustChangePassword?: boolean; isActive?: boolean; membershipStatus?: string;
  }>();
  if (!user || user.isActive === false || (user.membershipStatus ?? "active") !== "active") return null;
  const { fullName } = await import("./member-types");
  return {
    userId: targetId,
    email: user.email,
    name: fullName(user),
    mustChangePassword: Boolean(user.mustChangePassword),
    impersonatorId: actor.userId,
  };
}

/** Called after the start action has checked the administrator and target account. */
export async function createUserView(targetId: string, actorId: string) {
  const store = await cookies();
  const sessionToken = store.get(SESSION_COOKIE)?.value;
  if (!sessionToken) throw new Error("Sign in before viewing as a user.");
  const token = await signUserView(targetId, actorId, sessionToken, secretKey());
  store.set(USER_VIEW_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
    // Keep the marker after its one-hour JWT expires, until explicitly returned.
    // Otherwise an expired preview could silently regain administrator privileges.
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearUserView() {
  (await cookies()).delete(USER_VIEW_COOKIE);
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
  store.delete(USER_VIEW_COOKIE);
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
