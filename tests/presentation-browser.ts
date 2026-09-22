import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { jsPDF } from "jspdf";
import { SignJWT } from "jose";
import mongoose from "mongoose";
import { allPermissions } from "../lib/permissions";
import { convertPublication } from "../lib/publication-migration";
import { createPublicationBlock, createPublicationPage, createTable } from "../lib/publication-layout";

async function main() {
  // A disposable local database; never reuse the configured content database.
  const database = `aperture_presentation_test_${Date.now()}`;
  const uri = `mongodb://127.0.0.1:27017/${database}`;
  const secret = randomBytes(32).toString("hex");
  const port = 3187;
  const baseURL = `http://localhost:${port}`;
  process.env.MONGODB_URI = uri;
  const { Zine, Presentation, Role, User, MediaAsset } = await import("../lib/models");
  await mongoose.connect(uri);
  const role = await Role.create({ name: "Test administrator", slug: "administrator", kind: "management", permissions: allPermissions });
  const user = await User.create({ email: "presentation-test@example.invalid", name: "Presentation test", passwordHash: "unused", roleIds: [role._id], membershipStatus: "active", emailVerifiedAt: new Date() });
  const block = { ...createPublicationBlock("richText"), id: "intro", html: "<p>Converted publication</p>", x: 100, y: 100, clickAction: "page" as const, clickTarget: "appendix" };
  const table = { ...createPublicationBlock("table"), id: "table", x: 100, y: 250, table: createTable(2, 2) };
  table.table.cells[0][0].block.html = "<p>Retained table</p>";
  const source = await Zine.create({ title: "Converted fixture", slug: "converted-fixture", kind: "zine", status: "published", visibility: { mode: "public" }, pages: [
    { ...createPublicationPage(), id: "first", blocks: [block, table] },
    { ...createPublicationPage(), id: "second", blocks: [{ ...block, id: "second-text", html: "<p>Second page</p>", clickAction: "none" }] },
    { ...createPublicationPage(), id: "appendix", hidden: true, showBack: true, backLabel: "Return", blocks: [{ ...block, id: "hidden-text", html: "<p>Linked appendix</p>", clickAction: "none" }] },
  ] });
  const converted = convertPublication(source.toObject());
  await Presentation.create({ _id: source._id, deck: converted.deck, published: converted.deck });
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
    env: { ...process.env, MONGODB_URI: uri, SESSION_SECRET: secret, SEED_ADMIN_EMAIL: "", SEED_ADMIN_PASSWORD: "" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let logs = "";
  child.stdout?.on("data", chunk => { logs += chunk; });
  child.stderr?.on("data", chunk => { logs += chunk; });
  let browser;
  try {
    for (let i = 0; i < 60; i++) {
      try { await fetch(`${baseURL}/login`); break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const token = await new SignJWT({ userId: String(user._id), email: user.email, name: "Presentation test", mustChangePassword: false }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    await context.addCookies([{ name: "aperture_session", value: token, url: baseURL }]);
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("dialog", dialog => void dialog.accept());
    await page.goto(`${baseURL}/admin/publications/${source._id}/edit`);
    await page.waitForURL("**/admin/presentations/*/edit");
    await page.getByLabel("Presentation title", { exact: true }).waitFor();
    const stale = await context.newPage();
    stale.on("dialog", dialog => void dialog.accept());
    await stale.goto(`${baseURL}/admin/presentations/${source._id}/edit`);
    await stale.getByLabel("Presentation title", { exact: true }).waitFor();
    await mkdir("backups/test-artifacts", { recursive: true });
    await page.screenshot({ path: "backups/test-artifacts/presentation-editor.png", fullPage: true });
    await page.getByLabel("Presentation title", { exact: true }).fill("Changed draft");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Presentation saved." }).waitFor();
    const saved = await Presentation.findById(source._id).lean<any>();
    assert.equal(saved.deck.title, "Changed draft");
    assert.equal(saved.published.title, "Converted fixture");
    await stale.getByLabel("Presentation title", { exact: true }).fill("Stale overwrite");
    await stale.getByRole("button", { name: "Save", exact: true }).click();
    await stale.getByRole("status").filter({ hasText: "changed in another window" }).waitFor();
    assert.equal((await Presentation.findById(source._id).lean<any>()).deck.title, "Changed draft");
    await stale.close();
    const publicPage = await browser.newPage();
    await publicPage.goto(`${baseURL}/zines/converted-fixture`);
    await publicPage.locator('[data-active="true"]').getByText("Retained table").waitFor();
    await publicPage.getByRole("button", { name: "Next page", exact: true }).click();
    await publicPage.locator('[data-active="true"]').getByText("Second page").waitFor();
    assert.equal(await publicPage.getByRole("button", { name: "Next page", exact: true }).isDisabled(), true);
    await publicPage.getByRole("button", { name: "Previous page", exact: true }).click();
    await publicPage.locator('[data-active="true"]').getByText("Converted publication").click();
    await publicPage.locator('[data-active="true"]').getByText("Linked appendix").waitFor();
    await publicPage.getByRole("button", { name: "Return", exact: true }).click();
    await publicPage.locator('[data-active="true"]').getByText("Retained table").waitFor();
    await publicPage.screenshot({ path: "backups/test-artifacts/presentation-player.png", fullPage: true });
    // Same identity guard protects the new public route and the old slug route.
    await Zine.updateOne({ _id: source._id }, { $set: { visibility: { mode: "signedIn" } } });
    await publicPage.goto(`${baseURL}/presentations/${source._id}`);
    assert.match(publicPage.url(), /\/login/);
    await Zine.updateOne({ _id: source._id }, { $set: { deletedAt: new Date() } });
    const deleted = await page.goto(`${baseURL}/presentations/${source._id}`);
    assert.equal(deleted?.status(), 404);
    await page.goto(`${baseURL}/admin/presentations/new`);
    await page.getByLabel("Presentation title", { exact: true }).fill("Browser-created deck");
    await page.getByRole("button", { name: "Rich text", exact: true }).click();
    await page.locator(".deck-object .ql-editor").fill("Native slide text");
    assert.equal(await page.locator(".deck-object .ql-editor").evaluate(element => getComputedStyle(element).fontSize), "32px");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.waitForURL("**/admin/presentations/*/edit");
    const createdId = page.url().split("/").at(-2)!;
    assert.match((await Presentation.findById(createdId).lean<any>()).deck.slides[0].objects[0].html, /Native slide text/);
    const downloadPNG = page.waitForEvent("download");
    await page.getByRole("button", { name: "Page PNG", exact: true }).click();
    assert.match((await downloadPNG).suggestedFilename(), /\.png$/);
    const downloadPDF = page.waitForEvent("download");
    await page.getByRole("button", { name: "Presentation PDF", exact: true }).click();
    assert.match((await downloadPDF).suggestedFilename(), /\.pdf$/);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("button", { name: "Unpublish", exact: true }).waitFor();
    await page.getByRole("button", { name: "Unpublish", exact: true }).click();
    await page.getByRole("button", { name: "Publish", exact: true }).waitFor();
    const pdf = new jsPDF(); pdf.text("Imported page", 10, 10);
    await page.goto(`${baseURL}/admin/presentations/import`);
    await page.getByLabel("PDF file", { exact: true }).setInputFiles({ name: "browser-import.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf.output("arraybuffer")) });
    await page.getByRole("button", { name: "Import PDF", exact: true }).click();
    await page.waitForURL("**/admin/presentations/*/edit");
    const importedId = page.url().split("/").at(-2)!;
    const imported = await Presentation.findById(importedId).lean<any>();
    assert.equal(imported.deck.slides.length, 1);
    assert.equal(imported.deck.slides[0].objects[0].type, "image");
    assert.equal(imported.published, null);
    assert.deepEqual(errors, []);
    console.log("Browser checks passed: legacy URL, converted editor, draft snapshot, hidden-page navigation, access restrictions, deleted content, native text editing, PNG/PDF export, PDF import, create, publish and unpublish.");
  } catch (error) {
    console.error(logs.slice(-5000));
    throw error;
  } finally {
    await browser?.close();
    child.kill();
    const uploadRoot = path.resolve("public/uploads");
    for (const asset of await MediaAsset.find().lean<any[]>()) {
      for (const url of [asset.url, asset.thumbnailUrl]) {
        if (!url?.startsWith("/uploads/")) continue;
        const file = path.resolve("public", url.slice(1));
        if (file.startsWith(uploadRoot + path.sep)) await unlink(file).catch(() => {});
      }
    }
    if (mongoose.connection.name === database && database.startsWith("aperture_presentation_test_")) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
