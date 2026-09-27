import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMemberGroupBlock } from "../lib/member-group-block";
import { blockFillsWidth, createBlock, normalizeBlock, createRow, normalizePageLayout, walkBlocks } from "../lib/page-layout";

test("member group options survive page normalization, including disabled toggles", () => {
  const block = createBlock("memberGroup");
  assert.deepEqual(block.memberGroup, { groupId: "", layout: "cards", showRole: true, showHeadshot: true });
  const configured = normalizeBlock({ ...block, memberGroup: { groupId: "group-id", layout: "list", showRole: false, showHeadshot: false } });
  assert.ok(configured);
  assert.deepEqual(configured.memberGroup, { groupId: "group-id", layout: "list", showRole: false, showHeadshot: false });
  assert.equal(blockFillsWidth(configured), true);
  const row = createRow(1);
  row.columns[0].blocks = [configured];
  const found: string[] = [];
  walkBlocks(normalizePageLayout([row]), item => { if (item.type === "memberGroup") found.push(item.memberGroup!.groupId); });
  assert.deepEqual(found, ["group-id"]);
});

test("malformed settings fall back to usable defaults", () => {
  assert.deepEqual(normalizeMemberGroupBlock({ groupId: {}, layout: "invalid" }), normalizeMemberGroupBlock(null));
});
