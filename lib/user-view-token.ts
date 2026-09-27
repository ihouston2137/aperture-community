import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const USER_VIEW_COOKIE = "aperture_user_view";
export const USER_VIEW_SECONDS = 60 * 60;

function sessionBinding(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function signUserView(targetId: string, actorId: string, sessionToken: string, secret: Uint8Array) {
  return new SignJWT({ targetId, actorId, sessionBinding: sessionBinding(sessionToken) })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("aperture:user-view")
    .setIssuedAt()
    .setExpirationTime(`${USER_VIEW_SECONDS}s`)
    .sign(secret);
}

export async function verifyUserView(token: string, actorId: string, sessionToken: string, secret: Uint8Array) {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], audience: "aperture:user-view" });
    if (payload.actorId !== actorId || payload.sessionBinding !== sessionBinding(sessionToken)) return null;
    if (typeof payload.targetId !== "string" || !/^[a-f\d]{24}$/i.test(payload.targetId)) return null;
    return payload.targetId;
  } catch {
    return null;
  }
}
