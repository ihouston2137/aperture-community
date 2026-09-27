import assert from "node:assert/strict";
import test from "node:test";
import { metadataDashboardSummary } from "../lib/metadata-dashboard";
import { toMetadataGroup } from "../lib/metadata";

const group = toMetadataGroup({ _id: "group", name: "Details", questions: [
  { id: "name", label: "Name", type: "short", isRequired: true },
  { id: "count", label: "Count", type: "number" },
  { id: "size", label: "Size", type: "one", options: ["Small", "Large"] },
] });

test("existing groups retain dashboard visibility and percent, with summary-only display", () => {
  assert.equal(group.showOnDashboard, true);
  assert.equal(group.dashboardShowPercent, true);
  assert.equal(group.dashboardItems, "none");
  const hidden = toMetadataGroup({ _id: "hidden", showOnDashboard: false, dashboardShowPercent: false, dashboardItems: "bogus" });
  assert.equal(hidden.showOnDashboard, false);
  assert.equal(hidden.dashboardShowPercent, false);
  assert.equal(hidden.dashboardItems, "none");
});

test("completion counts optional values, recognizes zero, and ignores stale choices", () => {
  const entries = [{ id: "e", values: [
    { questionId: "name", text: " Ada ", choices: [] },
    { questionId: "count", text: "0", choices: [] },
    { questionId: "size", text: "", choices: ["Removed option"] },
  ] }];
  const all = metadataDashboardSummary({ ...group, dashboardItems: "all" }, entries);
  assert.equal(all.percent, 67);
  assert.equal(all.total, 3);
  assert.equal(all.complete, 2);
  assert.equal(all.items.length, 3);
  assert.equal(metadataDashboardSummary({ ...group, dashboardItems: "complete" }, entries).items.length, 2);
  assert.deepEqual(metadataDashboardSummary({ ...group, dashboardItems: "incomplete" }, entries).items.map(item => item.label), ["Size"]);
  assert.equal(metadataDashboardSummary(group, entries).items.length, 0);
});

test("empty and repeatable groups have stable denominators and distinct entry labels", () => {
  const repeatable = { ...group, isRepeatable: true, entryLabel: "Contact", dashboardItems: "all" as const };
  const empty = metadataDashboardSummary(repeatable, []);
  assert.equal(empty.percent, 0);
  assert.equal(empty.total, 3);
  const summary = metadataDashboardSummary(repeatable, [
    { id: "a", values: [{ questionId: "name", text: "Ada", choices: [] }] },
    { id: "b", values: [] },
  ]);
  assert.equal(summary.total, 6);
  assert.equal(summary.percent, 17);
  assert.equal(summary.items[0].entryLabel, "Contact 1");
  assert.equal(summary.items[3].entryLabel, "Contact 2");
  assert.equal(new Set(summary.items.map(item => item.id)).size, 6);
});
