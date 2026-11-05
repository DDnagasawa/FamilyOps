import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const DEFAULT_PATH = path.join(process.cwd(), "data", "memory_learning.json");
const MAX_MEMORIES_PER_USER = 200;
const MAX_FEEDBACK_PER_USER = 500;
const MAX_TEXT = 160;

const ALLOWED_FEEDBACK_TYPES = new Set([
  "recommendation_clicked",
  "recommendation_ignored",
  "recommendation_saved",
  "todo_completed",
  "reminder_snoozed",
  "task_created",
  "agent_run_completed",
]);

const SENSITIVE_TYPES = new Set(["address", "allergy", "health", "birthday", "surprise", "child_private"]);
const BLOCKED_KEYS = new Set(["password", "passwordHash", "passwordSalt", "token", "apiKey", "secret"]);

const DEFAULT_STORE = {
  version: 1,
  settings: {
    enabled: true,
    reviewEnabled: false,
    reviewInterval: "manual",
  },
  userSettings: {},
  memories: [],
  feedbackEvents: [],
  candidates: [],
  skillVersions: [],
};

export class MemoryLearningLayer {
  constructor(filePath = DEFAULT_PATH) {
    this.filePath = filePath;
    ensureStoreFile(filePath);
  }

  read() {
    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
    return normaliseStore(parsed);
  }

  getSettings(userId = "anonymous") {
    const store = this.read();
    return { ...store.settings, ...(store.userSettings[userId] || {}) };
  }

  updateSettings(patch = {}, userId = "anonymous") {
    const store = this.read();
    const safeUserId = cleanText(userId, 120) || "anonymous";
    const nextSettings = {
      ...(store.userSettings[safeUserId] || {}),
      ...(typeof patch.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(typeof patch.reviewEnabled === "boolean" ? { reviewEnabled: patch.reviewEnabled } : {}),
      reviewInterval: "manual",
    };
    store.userSettings[safeUserId] = nextSettings;
    writeStore(this.filePath, store);
    return this.getSettings(safeUserId);
  }

  addMemory({ userId = "anonymous", familyId = "default", type = "fact", key, value, source = "user_input", confidence = 0.7 } = {}) {
    const safeKey = cleanText(key, 80);
    if (!safeKey || BLOCKED_KEYS.has(safeKey)) return { skipped: true, reason: "blocked_memory_key" };
    const safeValue = sanitiseValue(value);
    if (safeValue === undefined) return { skipped: true, reason: "empty_memory_value" };

    const safeUserId = cleanText(userId, 120) || "anonymous";
    const safeFamilyId = cleanText(familyId, 120) || "default";
    const store = this.read();
    if (!this.getSettings(safeUserId).enabled) return { skipped: true, reason: "memory_disabled" };
    const fingerprint = stableFingerprint({ userId: safeUserId, familyId: safeFamilyId, type, key: safeKey, value: safeValue });
    const existing = store.memories.find((entry) => entry.userId === safeUserId && entry.familyId === safeFamilyId && entry.type === type && entry.key === safeKey && !entry.deletedAt);
    if (existing) {
      existing.value = safeValue;
      existing.sensitivity = SENSITIVE_TYPES.has(type) ? "sensitive" : "normal";
      existing.source = cleanText(source, 60) || "user_input";
      existing.fingerprint = fingerprint;
      existing.updatedAt = new Date().toISOString();
      existing.confidence = Math.max(existing.confidence || 0, clampConfidence(confidence));
      writeStore(this.filePath, store);
      return { skipped: false, duplicate: true, memory: publicMemory(existing) };
    }

    const now = new Date().toISOString();
    const memory = {
      id: randomUUID(),
      userId: safeUserId,
      familyId: safeFamilyId,
      type: cleanText(type, 40) || "fact",
      key: safeKey,
      value: safeValue,
      sensitivity: SENSITIVE_TYPES.has(type) ? "sensitive" : "normal",
      source: cleanText(source, 60) || "user_input",
      confidence: clampConfidence(confidence),
      fingerprint,
      createdAt: now,
      updatedAt: now,
    };
    store.memories = [memory, ...store.memories.filter((entry) => entry.userId !== safeUserId || !entry.deletedAt)].slice(0, MAX_MEMORIES_PER_USER + store.memories.filter((entry) => entry.userId !== safeUserId).length);
    writeStore(this.filePath, store);
    return { skipped: false, duplicate: false, memory: publicMemory(memory) };
  }

  listMemories({ userId = "anonymous", familyId = "default", includeSensitive = false } = {}) {
    const store = this.read();
    return store.memories
      .filter((entry) => entry.userId === userId && entry.familyId === familyId && !entry.deletedAt)
      .filter((entry) => includeSensitive || entry.sensitivity !== "sensitive")
      .map(publicMemory)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  deleteMemory({ id, userId = "anonymous", familyId = "default" } = {}) {
    const store = this.read();
    const memory = store.memories.find((entry) => entry.id === id && entry.userId === userId && entry.familyId === familyId && !entry.deletedAt);
    if (!memory) return { deleted: false };
    memory.deletedAt = new Date().toISOString();
    writeStore(this.filePath, store);
    return { deleted: true, id };
  }

  clearUserMemories({ userId = "anonymous", familyId = "default" } = {}) {
    const store = this.read();
    const deletedAt = new Date().toISOString();
    let count = 0;
    for (const memory of store.memories) {
      if (memory.userId === userId && memory.familyId === familyId && !memory.deletedAt) {
        memory.deletedAt = deletedAt;
        count += 1;
      }
    }
    writeStore(this.filePath, store);
    return { deleted: count };
  }

  recall({ userId = "anonymous", familyId = "default", query = "", limit = 8, includeSensitive = false } = {}) {
    const memories = this.listMemories({ userId, familyId, includeSensitive });
    const tokens = tokenise(query);
    return memories
      .map((memory) => ({ memory, score: scoreMemory(memory, tokens) }))
      .sort((a, b) => b.score - a.score || String(b.memory.updatedAt).localeCompare(String(a.memory.updatedAt)))
      .slice(0, Math.max(1, Math.min(Number(limit) || 8, 20)))
      .map(({ memory }) => memory);
  }

  recordFeedback({ userId = "anonymous", familyId = "default", type, targetId = "", metadata = {}, source = "family_app" } = {}) {
    if (!ALLOWED_FEEDBACK_TYPES.has(type)) return { recorded: false, reason: "unsupported_feedback_type" };
    const safeUserId = cleanText(userId, 120) || "anonymous";
    const safeFamilyId = cleanText(familyId, 120) || "default";
    const store = this.read();
    if (!this.getSettings(safeUserId).enabled) return { recorded: false, reason: "learning_disabled" };
    const safeMetadata = sanitiseFeedbackMetadata(metadata);
    const event = {
      id: randomUUID(),
      userId: safeUserId,
      familyId: safeFamilyId,
      type,
      targetId: cleanText(targetId, 120),
      metadata: safeMetadata,
      source: cleanText(source, 60) || "family_app",
      createdAt: new Date().toISOString(),
    };
    const userEvents = store.feedbackEvents.filter((entry) => entry.userId === event.userId && entry.familyId === event.familyId);
    const otherEvents = store.feedbackEvents.filter((entry) => entry.userId !== event.userId || entry.familyId !== event.familyId);
    store.feedbackEvents = [event, ...userEvents].slice(0, MAX_FEEDBACK_PER_USER).concat(otherEvents);
    writeStore(this.filePath, store);
    return { recorded: true, event: publicFeedback(event) };
  }

  listFeedback({ userId = "anonymous", familyId = "default" } = {}) {
    return this.read().feedbackEvents
      .filter((entry) => entry.userId === userId && entry.familyId === familyId)
      .map(publicFeedback);
  }

  generateCandidates({ userId = "anonymous", familyId = "default" } = {}) {
    const store = this.read();
    const events = store.feedbackEvents.filter((entry) => entry.userId === userId && entry.familyId === familyId);
    const groups = new Map();
    for (const event of events) {
      const key = `${event.type}:${event.metadata.recommendationType || event.metadata.taskType || event.metadata.reminderBucket || event.metadata.category || "general"}`;
      const group = groups.get(key) || { type: event.type, key: key.split(":").slice(1).join(":"), events: [] };
      group.events.push(event);
      groups.set(key, group);
    }

    const proposals = [];
    for (const group of groups.values()) {
      const threshold = group.type === "recommendation_clicked" ? 2 : 3;
      if (group.events.length < threshold) continue;
      const candidate = buildCandidate({ userId, familyId, group });
      const existing = store.candidates.find((entry) => entry.fingerprint === candidate.fingerprint);
      if (existing) {
        existing.evidenceCount = group.events.length;
        existing.updatedAt = new Date().toISOString();
        proposals.push(publicCandidate(existing));
        continue;
      }
      store.candidates.unshift(candidate);
      proposals.push(publicCandidate(candidate));
    }
    if (proposals.length) writeStore(this.filePath, store);
    return proposals;
  }

  listCandidates({ userId = "anonymous", familyId = "default" } = {}) {
    return this.read().candidates
      .filter((entry) => entry.userId === userId && entry.familyId === familyId)
      .map(publicCandidate)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  reviewCandidate({ id, action, userId = "anonymous", familyId = "default", reviewer = userId } = {}) {
    const store = this.read();
    const candidate = store.candidates.find((entry) => entry.id === id && entry.userId === userId && entry.familyId === familyId);
    if (!candidate) throw new Error("Learning candidate not found.");
    const now = new Date().toISOString();
    if (action === "approve") {
      candidate.status = "active";
      candidate.reviewedAt = now;
      candidate.reviewedBy = cleanText(reviewer, 120);
      const version = {
        id: randomUUID(),
        candidateId: candidate.id,
        version: nextVersion(store, candidate.id),
        state: "active",
        rule: candidate.proposedChange,
        createdAt: now,
        createdBy: cleanText(reviewer, 120),
      };
      store.skillVersions.unshift(version);
      candidate.activeVersionId = version.id;
    } else if (action === "reject") {
      candidate.status = "rejected";
      candidate.reviewedAt = now;
      candidate.reviewedBy = cleanText(reviewer, 120);
    } else if (action === "disable") {
      candidate.status = "disabled";
      candidate.reviewedAt = now;
      candidate.reviewedBy = cleanText(reviewer, 120);
    } else if (action === "rollback") {
      candidate.status = "rolled_back";
      candidate.reviewedAt = now;
      candidate.reviewedBy = cleanText(reviewer, 120);
      for (const version of store.skillVersions.filter((entry) => entry.candidateId === candidate.id)) version.state = "rolled_back";
      candidate.activeVersionId = null;
    } else {
      throw new Error("Unsupported learning review action.");
    }
    writeStore(this.filePath, store);
    return { candidate: publicCandidate(candidate), versions: store.skillVersions.filter((entry) => entry.candidateId === candidate.id) };
  }

  runReview({ userId = "anonymous", familyId = "default", force = false } = {}) {
    const settings = this.getSettings(userId);
    if (!settings.enabled) return { status: "skipped", reason: "learning_disabled", candidates: [] };
    if (!force && !settings.reviewEnabled) return { status: "skipped", reason: "background_review_disabled", candidates: [] };
    return { status: "completed", candidates: this.generateCandidates({ userId, familyId }) };
  }
}

function buildCandidate({ userId, familyId, group }) {
  const now = new Date().toISOString();
  const label = group.key || "general";
  const descriptions = {
    recommendation_clicked: `用户多次点击${label}类推荐，可优先展示相近内容。`,
    recommendation_ignored: `用户多次忽略${label}类推荐，可降低该类内容的优先级。`,
    task_created: `用户经常创建${label}类任务，可在创建时提供快捷模板。`,
    reminder_snoozed: `用户经常延后${label}类提醒，可建议调整默认提醒时间。`,
  };
  const fingerprint = stableFingerprint({ userId, familyId, type: group.type, key: label });
  return {
    id: randomUUID(),
    userId,
    familyId,
    kind: group.type === "task_created" ? "skill" : "preference_rule",
    status: "candidate",
    title: `候选学习规则：${label}`,
    reason: descriptions[group.type] || "检测到重复行为模式。",
    proposedChange: {
      eventType: group.type,
      value: label,
      action: group.type === "recommendation_ignored" ? "lower_priority" : "raise_priority",
    },
    evidenceCount: group.events.length,
    fingerprint,
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    activeVersionId: null,
  };
}

function publicMemory(memory) {
  return { ...memory, fingerprint: undefined, deletedAt: undefined };
}

function publicFeedback(event) {
  return { ...event };
}

function publicCandidate(candidate) {
  return { ...candidate, fingerprint: undefined };
}

function nextVersion(store, candidateId) {
  return store.skillVersions.filter((entry) => entry.candidateId === candidateId).length + 1;
}

function scoreMemory(memory, tokens) {
  if (!tokens.length) return 1;
  const text = `${memory.key} ${JSON.stringify(memory.value)}`.toLowerCase();
  return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0);
}

function tokenise(value) {
  return String(value || "").toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]/g) || [];
}

function sanitiseFeedbackMetadata(metadata) {
  const allowed = ["category", "kind", "reminderBucket", "recommendationType", "taskType"];
  return Object.fromEntries(allowed.map((key) => [key, cleanText(metadata?.[key], 60)]).filter(([, value]) => value));
}

function sanitiseValue(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return cleanText(value, MAX_TEXT);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitiseValue).filter((item) => item !== undefined);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !BLOCKED_KEYS.has(key)).slice(0, 30).map(([key, item]) => [cleanText(key, 60), sanitiseValue(item)]));
  }
  return undefined;
}

function stableFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value, Object.keys(value).sort())).digest("hex");
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0.7;
}

function normaliseStore(parsed = {}) {
  return {
    ...DEFAULT_STORE,
    ...parsed,
    settings: { ...DEFAULT_STORE.settings, ...(parsed.settings || {}), reviewInterval: "manual" },
    userSettings: parsed.userSettings && typeof parsed.userSettings === "object" ? parsed.userSettings : {},
    memories: Array.isArray(parsed.memories) ? parsed.memories : [],
    feedbackEvents: Array.isArray(parsed.feedbackEvents) ? parsed.feedbackEvents : [],
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
    skillVersions: Array.isArray(parsed.skillVersions) ? parsed.skillVersions : [],
  };
}

function ensureStoreFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) writeStore(filePath, DEFAULT_STORE);
}

function writeStore(filePath, store) {
  fs.writeFileSync(filePath, `${JSON.stringify(normaliseStore(store), null, 2)}\n`, "utf8");
}
