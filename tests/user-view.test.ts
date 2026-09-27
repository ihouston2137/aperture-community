import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT } from "jose";
import { signUserView, verifyUserView } from "../lib/user-view-token";

const secret = new TextEncoder().encode("test-secret-for-account-switching");
const actor = "111111111111111111111111";
const target = "222222222222222222222222";

test("user views are bound to the original administrator and exact login session", async () => {
  const token = await signUserView(target, actor, "original-session", secret);
  assert.equal(await verifyUserView(token, actor, "original-session", secret), target);
  assert.equal(await verifyUserView(token, target, "original-session", secret), null);
  assert.equal(await verifyUserView(token, actor, "different-session", secret), null);
  assert.equal(await verifyUserView(token, actor, "original-session", new TextEncoder().encode("wrong-secret")), null);
  assert.equal(await verifyUserView(`${token}tampered`, actor, "original-session", secret), null);
});

test("expired, wrong-purpose and invalid target tokens fail closed", async () => {
  const expired = await new SignJWT({ targetId: target, actorId: actor })
    .setProtectedHeader({ alg: "HS256" }).setAudience("aperture:user-view").setExpirationTime(1).sign(secret);
  assert.equal(await verifyUserView(expired, actor, "original-session", secret), null);
  const login = await new SignJWT({ userId: actor })
    .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(secret);
  assert.equal(await verifyUserView(login, actor, "original-session", secret), null);
  const malformed = await signUserView("not-a-user-id", actor, "original-session", secret);
  assert.equal(await verifyUserView(malformed, actor, "original-session", secret), null);
});
