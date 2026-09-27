import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import { SignJWT } from "jose";
import mongoose from "mongoose";
import { allPermissions } from "../lib/permissions";

async function main() {
  const uri = `mongodb://127.0.0.1:27017/aperture_metadata_dashboard_test_${Date.now()}`;
  const secret = randomBytes(32).toString("hex");
  const baseURL = "http://localhost:3194";
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  const { Role, User, MetadataGroup, MetadataAnswer } = await import("../lib/models");
  const adminRole = await Role.create({ name: "Administrator", slug: "administrator", kind: "management", permissions: allPermissions });
  const memberRole = await Role.create({ name: "Member", slug: "member", kind: "community", permissions: ["community.portal"] });
  const admin = await User.create({ email: "admin@example.invalid", name: "Admin", passwordHash: "unused", roleIds: [adminRole._id], membershipStatus: "active" });
  const member = await User.create({ email: "member@example.invalid", name: "Member", passwordHash: "unused", roleIds: [memberRole._id], membershipStatus: "active" });
  const questions = [{ id: "name", label: "Contact name", type: "short", isRequired: true }, { id: "phone", label: "Telephone", type: "short" }];
  const group = await MetadataGroup.create({ name: "Contact details", managedBy: "member", roleIds: [String(memberRole._id)], questions });
  await MetadataGroup.create({ name: "Hidden details", managedBy: "member", showOnDashboard: false, roleIds: [String(memberRole._id)], questions });
  const managed = await MetadataGroup.create({ name: "Manager details", managedBy: "manager", showOnDashboard: false, roleIds: [String(memberRole._id)], questions });
  await MetadataGroup.create({ name: "Private manager notes", managedBy: "manager", roleIds: [String(memberRole._id)], questions });
  await MetadataAnswer.create({ userId: String(member._id), groupId: String(managed._id), entries: [{ id: "one", values: [{ questionId: "name", text: "Member-only value" }] }] });
  await MetadataAnswer.create({ userId: String(admin._id), groupId: String(managed._id), entries: [{ id: "one", values: [{ questionId: "name", text: "Another account secret" }] }] });
  await MetadataGroup.create({ name: "Another level", managedBy: "member", roleIds: [String(adminRole._id)], questions });
  await MetadataAnswer.create({ userId: String(member._id), groupId: String(group._id), entries: [{ id: "one", values: [{ questionId: "name", text: "Ada" }] }] });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3194"], {
    env: { ...process.env, MONGODB_URI: uri, SESSION_SECRET: secret, SEED_ADMIN_EMAIL: "", SEED_ADMIN_PASSWORD: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; });
  server.stderr.on("data", chunk => { logs += chunk; });
  let browser: Browser | undefined;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await fetch(`${baseURL}/login`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    browser = await chromium.launch({ headless: true });
    const staff = await browser.newContext({ baseURL });
    const account = await browser.newContext({ baseURL });
    for (const [context, user] of [[staff, admin], [account, member]] as const) {
      const token = await new SignJWT({ userId: String(user._id), email: user.email, name: user.name, mustChangePassword: false })
        .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
      await context.addCookies([{ name: "aperture_session", value: token, url: baseURL }]);
    }
    const editor = await staff.newPage();
    const dashboard = await account.newPage();
    await dashboard.goto(`${baseURL}/dashboard`);
    const card = dashboard.getByRole("region", { name: "Contact details", exact: true });
    assert.equal(await dashboard.locator(".dashboard-metadata-card").count(), 1);
    assert.match(await card.innerText(), /50% complete/);
    assert.equal(await card.locator("li").count(), 0);
    assert.doesNotMatch(await dashboard.locator(".member-page").innerText(), /question/i);
    await editor.goto(`${baseURL}/admin/metadata`);
    async function edit() {
      await editor.locator(".admin-list-item").filter({ has: editor.getByRole("heading", { name: "Contact details member" }) }).getByRole("button", { name: "Edit", exact: true }).click();
    }
    async function save() {
      await editor.getByRole("dialog").getByRole("button", { name: /Save/ }).click();
      await editor.getByRole("dialog").waitFor({ state: "hidden" });
      await dashboard.reload();
    }
    for (const [mode, expected] of [["all", 2], ["complete", 1], ["incomplete", 1]] as const) {
      await edit();
      await editor.getByLabel("Items to display").selectOption(mode);
      await save();
      assert.equal((await MetadataGroup.findById(group._id))!.dashboardItems, mode);
      assert.equal(await card.locator("li").count(), expected);
      if (mode === "complete") assert.match(await card.locator("li").innerText(), /Contact name[\s\S]*Ada/);
      if (mode === "incomplete") assert.match(await card.locator("li").innerText(), /Telephone[\s\S]*Incomplete/);
    }
    await card.getByRole("link", { name: "Complete your details" }).click();
    await dashboard.waitForURL(`${baseURL}/dashboard/metadata#metadata-${group._id}`);
    const saveRequest = dashboard.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
    await dashboard.locator(`#metadata-${group._id}`).getByRole("button", { name: "Save answers", exact: true }).click();
    const submitted = await saveRequest;
    assert.ok(submitted.postData()!.includes(String(group._id)));
    const denied = await account.request.post("/dashboard/metadata", {
      headers: { "Next-Action": submitted.headers()["next-action"], "Content-Type": submitted.headers()["content-type"], Origin: baseURL },
      data: submitted.postData()!.replaceAll(String(group._id), String(managed._id)),
    });
    assert.match(await denied.text(), /That group is not yours to answer/);
    await dashboard.goto(`${baseURL}/dashboard`);
    await edit();
    await editor.getByLabel("Show percent complete", { exact: true }).uncheck();
    await save();
    assert.equal(await card.getByRole("progressbar").count(), 0);
    await edit();
    await editor.getByLabel("Show on dashboard", { exact: true }).uncheck();
    await save();
    assert.equal(await dashboard.locator(".dashboard-metadata-card").count(), 0);
    assert.equal((await MetadataGroup.findById(group._id))!.showOnDashboard, false);
    await editor.locator(".admin-list-item").filter({ hasText: "Manager details" }).getByRole("button", { name: "Edit", exact: true }).click();
    await editor.getByLabel("Show on dashboard", { exact: true }).check();
    await editor.getByLabel("Items to display").selectOption("all");
    await save();
    const managedCard = dashboard.getByRole("region", { name: "Manager details", exact: true });
    assert.equal((await MetadataGroup.findById(managed._id))!.showOnDashboard, true);
    assert.match(await managedCard.innerText(), /50% complete/);
    assert.match(await managedCard.innerText(), /Member-only value/);
    assert.match(await managedCard.innerText(), /Read only/);
    assert.equal(await managedCard.getByRole("link").count(), 0);
    assert.equal(await managedCard.locator("input, button, textarea, select").count(), 0);
    assert.doesNotMatch(await dashboard.locator(".member-page").innerText(), /Another account secret|Private manager notes/);
    await dashboard.goto(`${baseURL}/dashboard/metadata`);
    assert.equal(await dashboard.locator(`#metadata-${managed._id}`).count(), 0);
    const answer = await MetadataAnswer.findOne({ userId: String(member._id), groupId: String(managed._id) });
    assert.equal(answer!.entries[0].values[0].text, "Member-only value");
    console.log("Passed: dashboard settings and filters, read-only manager cards, per-user isolation, private manager defaults, and server-side refusal of member edits to manager data.");
  } catch (error) { console.error(logs); throw error; }
  finally {
    await browser?.close(); server.kill();
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
