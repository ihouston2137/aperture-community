import { loadEnvConfig } from "@next/env";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertPublication, PUBLICATION_MIGRATION_VERSION } from "../lib/publication-migration";

async function main() {
  loadEnvConfig(process.cwd());
  const { connectDB } = await import("../lib/db");
  const { Zine, Presentation } = await import("../lib/models");
  const { syncPresentationMedia } = await import("../lib/presentation-storage");
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const rollback = args.includes("--rollback");
  if (apply && rollback) throw new Error("Choose --apply or --rollback.");
  const id = args.find(arg => arg.startsWith("--id="))?.slice(5);
  if (id && !/^[a-f0-9]{24}$/i.test(id)) throw new Error("Invalid --id.");
  await connectDB();
  const documents = await Zine.find(id ? { _id: id } : {}).lean<any[]>();
  const report: Record<string, unknown>[] = [];
  let directory = "";
  if (apply || rollback) {
    directory = path.resolve("backups", `publications-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    await mkdir(directory, { recursive: true });
    // Extended JSON preserves ObjectIds and dates for restoration.
    const { EJSON } = await import("bson");
    await writeFile(path.join(directory, "publications.ejson"), EJSON.stringify(documents, { relaxed: false }), { flag: "wx" });
    await writeFile(path.join(directory, "presentations.ejson"), EJSON.stringify(await Presentation.find(id ? { _id: id } : {}).lean(), { relaxed: false }), { flag: "wx" });
  }
  for (const source of documents) {
    const sourceId = String(source._id);
    const base = { id: sourceId, title: source.title, kind: source.kind, deleted: !!source.deletedAt };
    try {
      const existing = await Presentation.findById(sourceId).lean<any>();
      if (rollback) {
        if (!existing?.migration) { report.push({ ...base, result: "not-migrated" }); continue; }
        await Presentation.updateOne({ _id: sourceId }, { $set: { active: false }, $inc: { version: 1 } });
        if (existing.migration.sourceMetadata) await Zine.updateOne({ _id: sourceId }, { $set: existing.migration.sourceMetadata });
        // Keep the converted deck, including subsequent edits, available for recovery.
        report.push({ ...base, result: "original-viewer-restored" });
        continue;
      }
      if (existing) { report.push({ ...base, result: "already-converted", active: existing.active }); continue; }
      const { deck, variants, defaultView, warnings } = convertPublication(source);
      if (apply) {
        // Refuse a source that changed while the report/backup was being produced.
        const unchanged = await Zine.exists({ _id: source._id, updatedAt: source.updatedAt });
        if (!unchanged) throw new Error("Source changed during conversion; retry after saving.");
        await Presentation.updateOne({ _id: source._id }, { $setOnInsert: {
          deck, variants, defaultView,
          published: source.status === "published" ? deck : null,
          publishedVariants: source.status === "published" ? variants : {},
          version: 1, active: true,
          migration: { version: PUBLICATION_MIGRATION_VERSION, sourceId, convertedAt: new Date(), sourceMetadata: { title: source.title, status: source.status, publishedAt: source.publishedAt }, sourceHash: createHash("sha256").update(JSON.stringify(source)).digest("hex"), backup: directory, warnings },
        } }, { upsert: true });
        await syncPresentationMedia(sourceId);
      }
      report.push({ ...base, result: apply ? "converted" : "ready", slides: deck.slides.length, variants: Object.keys(variants), warnings });
    } catch (error) {
      report.push({ ...base, result: "needs-review", error: error instanceof Error ? error.message : "Conversion failed" });
    }
  }
  const output = { mode: apply ? "apply" : rollback ? "rollback" : "dry-run", total: documents.length, backup: directory || undefined, items: report };
  if (directory) await writeFile(path.join(directory, "report.json"), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  if (report.some(row => row.result === "needs-review")) process.exitCode = 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Migration failed."); process.exitCode = 1; }).finally(() => mongoose.disconnect());
