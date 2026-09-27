import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import { SignJWT } from "jose";
import mongoose from "mongoose";
import { allPermissions } from "../lib/permissions";
import { createRow } from "../lib/page-layout";

async function main() {
  const uri = `mongodb://127.0.0.1:27017/aperture_group_block_test_${Date.now()}`;
  const secret = randomBytes(32).toString("hex");
  const baseURL = "http://localhost:3195";
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  const { Role, User, Bio, MemberGroup, SitePage } = await import("../lib/models");
  const role = await Role.create({ name: "Administrator", slug: "administrator", kind: "management", permissions: allPermissions });
  const admin = await User.create({ name: "Admin", email: "admin@example.invalid", passwordHash: "unused", roleIds: [role._id], membershipStatus: "active" });
  const ada = await User.create({ name: "Ada Lovelace", firstName: "Ada", lastName: "Lovelace", email: "ada@example.invalid", passwordHash: "unused", membershipStatus: "active" });
  const grace = await User.create({ name: "Grace Hopper", firstName: "Grace", lastName: "Hopper", email: "grace@example.invalid", passwordHash: "unused", membershipStatus: "active" });
  const inactive = await User.create({ name: "Inactive", email: "inactive@example.invalid", passwordHash: "unused", isActive: false });
  await Bio.create({ name: "Ada L", slug: "ada-l", userId: String(ada._id), title: "Profile title, not group role", headshotUrl: "/images/test-headshot.png" });
  const group = await MemberGroup.create({ name: "Committee", members: [
    { memberId: String(grace._id), title: "Treasurer" }, { memberId: String(ada._id), title: "Chair" }, { memberId: String(inactive._id), title: "Hidden" },
  ] });
  const document = await SitePage.create({ title: "Committee page", slug: "committee-page", status: "published", layout: [createRow(1)] });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3195"], {
    env: { ...process.env, MONGODB_URI: uri, SESSION_SECRET: secret, SEED_ADMIN_EMAIL: "", SEED_ADMIN_PASSWORD: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  server.stdout.on("data", chunk => { logs += chunk; }); server.stderr.on("data", chunk => { logs += chunk; });
  let browser: Browser | undefined;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await fetch(`${baseURL}/login`); break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    browser = await chromium.launch({ headless: true });
    const staff = await browser.newContext({ baseURL });
    const token = await new SignJWT({ userId: String(admin._id), name: admin.name, email: admin.email, mustChangePassword: false })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    await staff.addCookies([{ name: "aperture_session", value: token, url: baseURL }]);
    const editor = await staff.newPage();
    const visitor = await browser.newPage();
    const editURL = `${baseURL}/admin/pages/${document._id}/edit`;
    await editor.goto(editURL);
    await editor.getByRole("button", { name: "Blocks", exact: true }).click();
    await editor.locator(".block-palette").getByRole("button", { name: "Member group", exact: true }).click();
    await editor.locator('[data-block-type="memberGroup"]').click();
    const field = (label: string) => editor.locator(".field").filter({ has: editor.locator("label").filter({ hasText: new RegExp(`^${label}$`) }) }).locator("select");
    await field("Member group").selectOption(String(group._id));
    const preview = editor.locator(".pb-member-group");
    assert.deepEqual(await preview.locator(".pb-member-group-name").allTextContents(), ["Grace H", "Ada L"]);
    assert.deepEqual(await preview.locator(".pb-member-group-role").allTextContents(), ["Treasurer", "Chair"]);
    assert.equal(await preview.locator("img").count(), 1);
    assert.equal(await preview.locator(".is-placeholder").count(), 1);
    async function save() {
      await editor.getByRole("button", { name: "Save", exact: true }).click();
      await editor.waitForURL(`${editURL}?saved=1`);
      await visitor.goto(`${baseURL}/committee-page`);
    }
    await save();
    assert.equal(await visitor.locator(".pb-member-group.is-cards").count(), 1);
    assert.equal(await visitor.locator(".pb-member-group-person").count(), 2);
    assert.doesNotMatch(await visitor.locator(".pb-member-group").innerText(), /Profile title|Inactive|@/);
    await editor.goto(editURL);
    await editor.locator('[data-block-type="memberGroup"]').click();
    await field("Display as").selectOption("list");
    await editor.getByLabel("Show role in group").uncheck();
    await editor.getByLabel("Show profile headshot").uncheck();
    await save();
    assert.equal(await visitor.locator(".pb-member-group.is-list").count(), 1);
    assert.equal(await visitor.locator(".pb-member-group-role, .pb-member-group-headshot").count(), 0);
    const saved = await SitePage.findById(document._id);
    assert.deepEqual(saved!.layout[0].columns[0].blocks[0].memberGroup, { groupId: String(group._id), layout: "list", showRole: false, showHeadshot: false });
    await MemberGroup.deleteOne({ _id: group._id });
    await visitor.reload();
    assert.equal(await visitor.locator(".pb-member-group").count(), 0);
    console.log("Passed: add block, select group, live preview, profile headshots and fallback, group roles and ordering, active filtering, cards/list, toggle persistence, public rendering and removed group.");
  } catch (error) { console.error(logs); throw error; }
  finally { await browser?.close(); server.kill(); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
