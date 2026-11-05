import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MemoryLearningLayer } from "../src/memory/memoryLearningLayer.js";

function createLayer() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "familyops-memory-learning-"));
  return new MemoryLearningLayer(path.join(directory, "memory_learning.json"));
}

test("persistent memory can be recalled across layer instances", () => {
  const first = createLayer();
  first.addMemory({ userId: "u1", type: "preference", key: "interests", value: ["football", "reading"] });
  const second = new MemoryLearningLayer(first.filePath);

  const recalled = second.recall({ userId: "u1", query: "football" });
  assert.equal(recalled.length, 1);
  assert.deepEqual(recalled[0].value, ["football", "reading"]);
});

test("sensitive memory is hidden by default and secrets are rejected", () => {
  const layer = createLayer();
  layer.addMemory({ userId: "u1", type: "address", key: "home", value: "private address" });
  assert.equal(layer.addMemory({ userId: "u1", key: "apiKey", value: "must not persist" }).skipped, true);
  assert.equal(layer.recall({ userId: "u1", query: "address" }).length, 0);
  assert.equal(layer.recall({ userId: "u1", query: "address", includeSensitive: true }).length, 1);
});

test("feedback creates a candidate without activating it", () => {
  const layer = createLayer();
  for (let index = 0; index < 3; index += 1) {
    layer.recordFeedback({
      userId: "u1",
      type: "task_created",
      targetId: `task-${index}`,
      metadata: { taskType: "school", category: "todo" },
    });
  }

  const result = layer.runReview({ userId: "u1", force: true });
  assert.equal(result.status, "completed");
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].status, "candidate");
  assert.equal(layer.getSettings().reviewEnabled, false);
});

test("candidate approval creates a version and rollback disables it", () => {
  const layer = createLayer();
  for (let index = 0; index < 3; index += 1) {
    layer.recordFeedback({ userId: "u1", type: "recommendation_ignored", metadata: { recommendationType: "gifts" } });
  }
  const candidate = layer.generateCandidates({ userId: "u1" })[0];
  const approved = layer.reviewCandidate({ id: candidate.id, action: "approve", userId: "u1" });
  assert.equal(approved.candidate.status, "active");
  assert.equal(approved.versions[0].state, "active");

  const rolledBack = layer.reviewCandidate({ id: candidate.id, action: "rollback", userId: "u1" });
  assert.equal(rolledBack.candidate.status, "rolled_back");
  assert.equal(rolledBack.versions[0].state, "rolled_back");
});

test("background review is skipped unless explicitly enabled or forced", () => {
  const layer = createLayer();
  layer.recordFeedback({ userId: "u1", type: "recommendation_clicked", metadata: { recommendationType: "restaurants" } });
  assert.equal(layer.runReview({ userId: "u1" }).status, "skipped");
  assert.equal(layer.runReview({ userId: "u1", force: true }).status, "completed");
});

test("learning settings are isolated per account", () => {
  const layer = createLayer();
  layer.updateSettings({ enabled: false }, "u1");
  assert.equal(layer.getSettings("u1").enabled, false);
  assert.equal(layer.getSettings("u2").enabled, true);
  assert.equal(layer.recordFeedback({ userId: "u1", type: "todo_completed" }).recorded, false);
  assert.equal(layer.recordFeedback({ userId: "u2", type: "todo_completed" }).recorded, true);
});
