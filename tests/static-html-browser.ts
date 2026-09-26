import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chromium, type Browser } from "@playwright/test";
import { SignJWT } from "jose";
import mongoose from "mongoose";
import { allPermissions } from "../lib/permissions";

async function main() {
  const database = `aperture_static_html_test_${Date.now()}`;
  const uri = `mongodb://127.0.0.1:27017/${database}`;
  const secret = randomBytes(32).toString("hex");
  const baseURL = "http://localhost:3192";
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
  const { Role, User } = await import("../lib/models");
  await Role.create({ name: "Administrator", slug: "administrator", kind: "management", permissions: allPermissions, isSystem: true });
  const role = await Role.create({ name: "HTML publisher", slug: "html-publisher", kind: "management", permissions: ["staticHtml.manage"] });
  const publisher = await User.create({ email: "publisher@example.invalid", name: "Publisher", passwordHash: "unused", roleIds: [role._id], membershipStatus: "active" });
  const member = await User.create({ email: "member@example.invalid", name: "Member", passwordHash: "unused", roleIds: [], membershipStatus: "active" });
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3192"], {
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
    const denied = await browser.newContext({ baseURL });
    for (const [context, user] of [[staff, publisher], [denied, member]] as const) {
      const token = await new SignJWT({ userId: String(user._id), email: user.email, name: user.name, mustChangePassword: false })
        .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
      await context.addCookies([{ name: "aperture_session", value: token, url: baseURL }]);
    }
    const html = '<!doctype html><html><head><title>Original</title><style>h1{color:rgb(255,0,0)}</style></head><body><h1>Annual report</h1><script>document.title="Script works";try{document.cookie;document.body.dataset.isolated="no"}catch{document.body.dataset.isolated="yes"}</script></body></html>';
    const multipart = { file: { name: "Annual Report.html", mimeType: "text/html", buffer: Buffer.from(html) } };
    assert.equal((await fetch(`${baseURL}/api/admin/static-html`, { method: "POST" })).status, 403);
    assert.equal((await denied.request.post("/api/admin/static-html", { multipart })).status(), 403);
    assert.equal((await denied.request.delete("/api/admin/static-html?slug=annual-report")).status(), 403);
    const editor = await staff.newPage();
    await editor.goto(`${baseURL}/admin/static-html`);
    await editor.getByLabel("HTML file", { exact: true }).setInputFiles({ name: "Annual Report.html", mimeType: "text/html", buffer: Buffer.from(html) });
    const uploaded = editor.waitForResponse(response => response.url().endsWith("/api/admin/static-html") && response.request().method() === "POST");
    await editor.getByRole("button", { name: "Upload and publish" }).click();
    assert.equal((await uploaded).status(), 201);
    await editor.getByRole("link", { name: "/project/annual-report", exact: true }).waitFor();
    await editor.getByLabel("Share links as").selectOption("report");
    await editor.getByRole("link", { name: "/report/annual-report", exact: true }).waitFor();
    assert.equal((await staff.request.post("/api/admin/static-html", { multipart })).status(), 409);
    const viewer = await browser.newPage();
    for (const prefix of ["project", "report", "special"]) {
      const response = await viewer.goto(`${baseURL}/${prefix}/annual-report`);
      assert.equal(response!.status(), 200);
      assert.equal(await response!.text(), html);
      assert.equal(await viewer.title(), "Script works");
      assert.equal(await viewer.locator("body").getAttribute("data-isolated"), "yes");
      assert.equal(await viewer.locator("h1").evaluate(node => getComputedStyle(node).color), "rgb(255, 0, 0)");
      assert.equal((await fetch(`${baseURL}/${prefix}/missing`)).status, 404);
    }
    assert.equal((await staff.request.delete("/api/admin/static-html?slug=annual-report")).status(), 200);
    for (const prefix of ["project", "report", "special"]) assert.equal((await fetch(`${baseURL}/${prefix}/annual-report`)).status, 404);
    console.log("Passed: restricted upload/delete, upload UI, duplicate protection, prefix selection, all public aliases, inline styles/scripts, origin isolation, missing files and deletion.");
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
