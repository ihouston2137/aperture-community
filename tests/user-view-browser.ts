import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import { SignJWT } from "jose";
import mongoose from "mongoose";
import { allPermissions } from "../lib/permissions";
import { signUserView, USER_VIEW_COOKIE } from "../lib/user-view-token";

async function main() {
  const database = `aperture_user_view_test_${Date.now()}`;
  const uri = `mongodb://127.0.0.1:27017/${database}`;
  const secret = randomBytes(32).toString("hex");
  const secretBytes = new TextEncoder().encode(secret);
  const baseURL = "http://localhost:3193";
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  const { Role, User } = await import("../lib/models");
  const adminRole = await Role.create({ name: "Administrator", slug: "administrator", kind: "management", permissions: allPermissions });
  const memberRole = await Role.create({ name: "Member", slug: "member", kind: "community", permissions: ["community.portal", "community.profile"] });
  const managerRole = await Role.create({ name: "User manager", slug: "user-manager", kind: "management", permissions: ["users.manage"] });
  const admin = await User.create({ email: "admin@example.invalid", firstName: "Admin", lastName: "Person", name: "Admin Person", passwordHash: "unused", roleIds: [adminRole._id], membershipStatus: "active", emailVerifiedAt: new Date() });
  const member = await User.create({ email: "member@example.invalid", firstName: "Member", lastName: "Person", name: "Member Person", passwordHash: "unused", roleIds: [memberRole._id], membershipStatus: "active", emailVerifiedAt: new Date() });
  const manager = await User.create({ email: "manager@example.invalid", name: "User manager", passwordHash: "unused", roleIds: [managerRole._id], membershipStatus: "active", emailVerifiedAt: new Date() });
  const inactive = await User.create({ email: "inactive@example.invalid", name: "Inactive", passwordHash: "unused", roleIds: [memberRole._id], membershipStatus: "active", isActive: false });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3193"], {
    env: { ...process.env, MONGODB_URI: uri, SESSION_SECRET: secret, SEED_ADMIN_EMAIL: "", SEED_ADMIN_PASSWORD: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  let browser: Browser | undefined;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await fetch(`${baseURL}/login`); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert.ok(ready, logs);
    browser = await chromium.launch({ headless: true });
    const staff = await browser.newContext({ baseURL });
    const nonAdmin = await browser.newContext({ baseURL });
    const guest = await browser.newContext({ baseURL });
    let originalToken = "";
    for (const [context, user] of [[staff, admin], [nonAdmin, manager]] as const) {
      const token = await new SignJWT({ userId: String(user._id), email: user.email, name: user.name, mustChangePassword: false })
        .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(secretBytes);
      if (user === admin) originalToken = token;
      await context.addCookies([{ name: "aperture_session", value: token, url: baseURL, httpOnly: true }]);
    }
    const page = await staff.newPage();
    const managerPage = await nonAdmin.newPage();
    await managerPage.goto(`${baseURL}/admin/users`);
    assert.equal(await managerPage.getByRole("button", { name: "View as user", exact: true }).count(), 0);
    await page.goto(`${baseURL}/admin/users`);
    const ownRow = page.locator(".admin-list-item").filter({ hasText: "admin@example.invalid" });
    assert.equal(await ownRow.getByRole("button", { name: "View as user", exact: true }).count(), 0);
    const inactiveRow = page.locator(".admin-list-item").filter({ hasText: "inactive@example.invalid" });
    assert.equal(await inactiveRow.getByRole("button", { name: "View as user", exact: true }).count(), 0);
    const switchRequest = page.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
    await page.locator(".admin-list-item").filter({ hasText: "member@example.invalid" }).getByRole("button", { name: "View as user", exact: true }).click();
    const actionId = (await switchRequest).headers()["next-action"];
    await page.waitForURL(`${baseURL}/`);
    await page.getByRole("complementary", { name: "User view" }).waitFor();
    assert.match(await page.getByRole("complementary", { name: "User view" }).innerText(), /Member Person/);
    assert.equal((await staff.cookies()).find(cookie => cookie.name === "aperture_session")?.value, originalToken);
    const viewCookie = (await staff.cookies()).find(cookie => cookie.name === USER_VIEW_COOKIE)!;
    assert.ok(viewCookie.httpOnly);
    assert.equal((await staff.request.get("/api/admin/media")).status(), 401, "admin media access must not bleed into member view");
    async function start(context: typeof staff, targetId: string) {
      return context.request.post("/admin/users", {
        headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Origin: baseURL },
        data: JSON.stringify([targetId]),
      });
    }
    assert.match(await (await start(staff, String(manager._id))).text(), /Return to your administrator account/);
    assert.match(await (await start(nonAdmin, String(member._id))).text(), /Only administrators/);
    assert.match(await (await start(guest, String(member._id))).text(), /Only administrators/);
    assert.equal((await nonAdmin.cookies()).some(cookie => cookie.name === USER_VIEW_COOKIE), false);

    await page.goto(`${baseURL}/dashboard`);
    await page.getByRole("heading", { name: "Hello, Member", exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => {
      const banner = document.querySelector(".user-view-banner")!;
      return Math.abs(parseFloat(document.documentElement.style.getPropertyValue("--user-view-height")) - banner.getBoundingClientRect().height) < 1;
    });
    const returnButton = await page.getByRole("button", { name: "Return to administrator", exact: true }).boundingBox();
    assert.ok(returnButton && returnButton.x >= 0 && returnButton.x + returnButton.width <= 390);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "Change details", exact: true }).click();
    await page.getByLabel("First name", { exact: true }).fill("Updated");
    await page.getByRole("button", { name: "Save details", exact: true }).click();
    await page.getByText("Your details have been saved.", { exact: true }).waitFor();
    assert.equal((await User.findById(member._id))!.firstName, "Updated");
    assert.equal((await User.findById(admin._id))!.firstName, "Admin");
    assert.equal((await staff.cookies()).find(cookie => cookie.name === "aperture_session")?.value, originalToken);
    await page.getByRole("button", { name: "Return to administrator", exact: true }).click();
    await page.waitForURL(`${baseURL}/admin/users`);
    assert.equal((await staff.cookies()).some(cookie => cookie.name === USER_VIEW_COOKIE), false);
    assert.equal((await staff.request.get("/api/admin/media")).status(), 200);
    assert.match(await (await start(staff, String(admin._id))).text(), /Choose another user/);
    assert.match(await (await start(staff, String(inactive._id))).text(), /active, approved user/);
    assert.match(await (await start(staff, "not-an-id")).text(), /Choose another user/);
    const crossOrigin = await staff.request.post("/admin/users", {
      headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Origin: "https://other.example.invalid" },
      data: JSON.stringify([String(member._id)]),
    });
    assert.ok(crossOrigin.status() >= 400);
    assert.equal((await staff.cookies()).some(cookie => cookie.name === USER_VIEW_COOKIE), false);

    // Live role revocation and target deletion invalidate the overlay, but never trap the admin.
    await start(staff, String(member._id));
    await User.updateOne({ _id: admin._id }, { $set: { roleIds: [managerRole._id] } });
    assert.equal((await staff.request.get("/api/admin/media")).status(), 401);
    await User.updateOne({ _id: admin._id }, { $set: { roleIds: [adminRole._id] } });
    await User.deleteOne({ _id: member._id });
    await page.goto(`${baseURL}/login`);
    await page.getByText("User view expired or unavailable", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Return to administrator", exact: true }).click();
    await page.waitForURL(`${baseURL}/admin/users`);
    assert.equal((await staff.request.get("/api/admin/media")).status(), 200);

    // Signed cookies cannot be transplanted onto a different original login.
    const mismatched = await signUserView(String(manager._id), String(admin._id), "another-session", secretBytes);
    await staff.addCookies([{ name: USER_VIEW_COOKIE, value: mismatched, url: baseURL, httpOnly: true }]);
    assert.equal((await staff.request.get("/api/admin/media")).status(), 401);
    await page.goto(`${baseURL}/login`);
    await page.getByRole("button", { name: "Return to administrator", exact: true }).click();
    await page.waitForURL(`${baseURL}/admin/users`);
    assert.equal((await staff.request.get("/api/admin/media")).status(), 200);
    console.log("Passed: administrator-only controls and actions, member identity and permissions, profile edits, original session preservation, return, nested/self/inactive rejection, CSRF, live revocation, target deletion, token binding and recovery.");
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    await browser?.close();
    server.kill();
    // Only the uniquely named database created by this test is removed.
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
