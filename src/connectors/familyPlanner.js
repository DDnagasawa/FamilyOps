import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildFamilyMembers,
  resolveFamilyReferences,
  resolveFamilyReferencesInActions,
} from "./familyMemberResolver.js";

const DEFAULT_PLAN_PATH = path.join(process.cwd(), "data", "family_plan.json");

const DEFAULT_PLAN = {
  members: [
    { id: "mr_beecham", name: "Mr Beecham", role: "parent", gender: "male", aliases: ["dad", "father", "mr beecham"] },
    { id: "mrs_beecham", name: "Mrs Beecham", role: "parent", gender: "female", aliases: ["mum", "mom", "mother", "mrs beecham"] },
    { id: "john", name: "John", role: "adult", gender: "male", aliases: ["john"] },
    { id: "anna", name: "Anna", role: "adult", gender: "female", aliases: ["anna"] },
    { id: "thomas", name: "Thomas", role: "child", gender: "male", aliases: ["thomas", "tom"] },
    { id: "lisa", name: "Lisa", role: "child", gender: "female", aliases: ["lisa"] }
  ],
  events: [],
  tasks: [],
  shopping: [],
  decisions: []
};

const CHILD_PARENT_SYNC_SKIP_PATTERN =
  /surprise|secret|do not tell|don't tell|不要告诉|别告诉|保密|秘密|惊喜|birthday|生日|生辰|过生日|anniversary|纪念日|周年|gift|present|礼物|送礼|买什么|surprise party|party|聚会|派对|惊喜聚餐|生日餐|restaurant|dinner|lunch|meal|餐厅|晚餐|午餐|约会|trip|travel|ticket|theme park|旅行|出行|门票|游乐园/i;
const EVENT_KEYWORD_PATTERN =
  /\b(event|match|birthday|wedding|appointment|meeting|football|holiday|party)\b|事件|比赛|生日|聚会|会议|约会|预约|足球|假期|旅行|活动/i;

export function readFamilyPlan(planPath = DEFAULT_PLAN_PATH) {
  ensurePlanFile(planPath);
  return JSON.parse(fs.readFileSync(planPath, "utf8"));
}

/**
 * Replace the reminder/suggestion recipients of one stored event.
 * Only known family members are accepted, and members excluded for privacy
 * (for example the target of a surprise) can never be added back.
 */
export function updateFamilyEventRecipients({ id, recipients } = {}, planPath = DEFAULT_PLAN_PATH) {
  const eventId = String(id || "").split(":")[0];
  if (!eventId) throw new Error("Event id is required.");
  const plan = readFamilyPlan(planPath);
  const event = (plan.events || []).find((entry) => entry.id === eventId);
  if (!event) throw new Error(`Event not found: ${eventId}`);

  const memberNames = new Set((plan.members || []).map((member) => member.name));
  const excluded = new Set(event.excludeMembers || []);
  const requested = [...new Set((Array.isArray(recipients) ? recipients : [])
    .map((name) => String(name || "").trim())
    .filter(Boolean))];
  const unknown = requested.filter((name) => !memberNames.has(name));
  if (unknown.length) throw new Error(`Not a family member: ${unknown.join(", ")}`);
  const blocked = requested.filter((name) => excluded.has(name));
  if (blocked.length) throw new Error(`Cannot add an excluded member: ${blocked.join(", ")}`);

  event.recipients = requested;
  event.updatedAt = new Date().toISOString();
  plan.decisions = plan.decisions || [];
  plan.decisions.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    inputText: `update recipients ${eventId}`,
    appliedCount: 1,
    skippedCount: 0,
  });
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { event, planSummary: summarizeFamilyPlan(plan) };
}

/**
 * Expand recurring events for read-only calendar and reminder views.
 * The JSON plan keeps one canonical event per series; generated occurrences
 * are identified by their seriesId and are never written back to storage.
 */
export function expandRecurringEvents(plan, options = {}) {
  const sourcePlan = plan || DEFAULT_PLAN;
  const from = options.from || addDays(toLocalIsoDate(new Date()), -365);
  const to = options.to || addDays(toLocalIsoDate(new Date()), 730);
  const events = [];

  for (const event of sourcePlan.events || []) {
    if (!event?.recurrence?.frequency || !event.date) {
      events.push(event);
      continue;
    }

    if (event.recurrence.frequency !== "weekly" || typeof event.recurrence.weekday !== "number") {
      events.push(event);
      continue;
    }

    const start = event.date;
    const firstDate = maxIsoDate(start, from);
    let occurrenceDate = firstDate;
    while (occurrenceDate <= to) {
      if (isIsoWeekday(occurrenceDate, event.recurrence.weekday)) {
        events.push({
          ...event,
          id: `${event.id}:${occurrenceDate}`,
          seriesId: event.id,
          isOccurrence: true,
          date: occurrenceDate,
        });
      }
      occurrenceDate = addDays(occurrenceDate, 1);
    }
  }

  const dedupedEvents = [];
  const seenOccurrences = new Set();
  for (const event of events) {
    const identity = eventIdentity(event, sourcePlan.members || [], { includeOccurrenceDate: true });
    if (seenOccurrences.has(identity)) continue;
    seenOccurrences.add(identity);
    dedupedEvents.push(event);
  }

  return { ...sourcePlan, events: dedupedEvents };
}

export function listFamilyTodos(planPath = DEFAULT_PLAN_PATH) {
  const plan = readFamilyPlan(planPath);
  return {
    tasks: plan.tasks.filter((task) => task.status !== "done"),
    shopping: plan.shopping.filter((item) => item.status !== "done"),
    summary: summarizeFamilyPlan(plan),
  };
}

export function listFamilyReminders(input = {}, planPath = DEFAULT_PLAN_PATH) {
  const plan = readFamilyPlan(planPath);
  const today = input.date || new Date().toISOString().slice(0, 10);
  const tomorrowDate = addDays(today, Number(input.daysAhead ?? 1));
  const dates = new Set([today, tomorrowDate]);

  const tasks = plan.tasks
    .filter((task) => task.status !== "done")
    .filter((task) => task.dueDate && dates.has(task.dueDate))
    .map((task) => ({
      kind: "task",
      title: task.title,
      date: task.dueDate,
      assignee: task.assignee,
      id: task.id,
    }));

  const shopping = plan.shopping
    .filter((item) => item.status !== "done")
    .filter((item) => item.dueDate && dates.has(item.dueDate))
    .map((item) => ({
      kind: "shopping",
      title: item.item,
      date: item.dueDate,
      assignee: item.assignee,
      id: item.id,
    }));

  const events = expandRecurringEvents(plan, { from: today, to: tomorrowDate }).events
    .filter((event) => event.date && dates.has(event.date))
    .map((event) => ({
      kind: "event",
      title: event.title,
      date: event.date,
      recipients: event.recipients || [],
      private: Boolean(event.private),
      id: event.id,
    }));

  return {
    date: today,
    daysAhead: Number(input.daysAhead ?? 1),
    reminders: [...tasks, ...shopping, ...events].sort((a, b) => a.date.localeCompare(b.date)),
    summary: summarizeFamilyPlan(plan),
  };
}

export function completeFamilyTodo({ kind, id }, planPath = DEFAULT_PLAN_PATH) {
  if (!["task", "shopping"].includes(kind)) {
    throw new Error("Todo kind must be task or shopping.");
  }
  if (!id) {
    throw new Error("Todo id is required.");
  }

  const plan = readFamilyPlan(planPath);
  const list = kind === "task" ? plan.tasks : plan.shopping;
  const item = list.find((entry) => entry.id === id);
  if (!item) {
    throw new Error(`Todo item not found: ${id}`);
  }

  item.status = "done";
  item.completedAt = new Date().toISOString();
  plan.decisions.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    inputText: `complete ${kind} ${id}`,
    appliedCount: 1,
    skippedCount: 0,
  });
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  return {
    kind,
    item,
    planSummary: summarizeFamilyPlan(plan),
  };
}

export function addFamilyTodo(input = {}, planPath = DEFAULT_PLAN_PATH) {
  const plan = readFamilyPlan(planPath);
  const kind = input.kind === "shopping" ? "shopping" : "task";
  const item = {
    id: randomUUID(),
    status: "open",
    assignee: input.assignee || null,
    dueDate: input.dueDate || new Date().toISOString().slice(0, 10),
    alarmAt: input.alarmAt || null,
    sourceText: input.sourceText || input.title || input.item || null,
    createdAt: new Date().toISOString(),
  };

  if (kind === "shopping") {
    item.item = input.item || input.title || "Untitled shopping item";
    item.quantity = input.quantity || "1";
    plan.shopping.push(item);
  } else {
    item.title = input.title || "Untitled task";
    item.priority = input.priority || "normal";
    item.category = input.category || "todo";
    plan.tasks.push(item);
  }

  plan.decisions.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    inputText: `add ${kind} ${item.title || item.item}`,
    appliedCount: 1,
    skippedCount: 0,
  });
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { kind, item, planSummary: summarizeFamilyPlan(plan) };
}

export function updateFamilyTodo(input = {}, planPath = DEFAULT_PLAN_PATH) {
  const plan = readFamilyPlan(planPath);
  const kind = input.kind === "shopping" ? "shopping" : "task";
  const list = kind === "shopping" ? plan.shopping : plan.tasks;
  const item = list.find((entry) => entry.id === input.id);
  if (!item) throw new Error(`Todo item not found: ${input.id}`);

  if (typeof input.title === "string") {
    if (kind === "shopping") item.item = input.title;
    else item.title = input.title;
  }
  if ("dueDate" in input) item.dueDate = input.dueDate || null;
  if ("alarmAt" in input) item.alarmAt = input.alarmAt || null;
  if ("category" in input && kind === "task") item.category = input.category || "todo";
  if ("assignee" in input) item.assignee = input.assignee || null;
  item.updatedAt = new Date().toISOString();

  plan.decisions.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    inputText: `update ${kind} ${input.id}`,
    appliedCount: 1,
    skippedCount: 0,
  });
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { kind, item, planSummary: summarizeFamilyPlan(plan) };
}

export function deleteFamilyTodo(input = {}, planPath = DEFAULT_PLAN_PATH) {
  const plan = readFamilyPlan(planPath);
  const kind = input.kind === "shopping" ? "shopping" : "task";
  const list = kind === "shopping" ? plan.shopping : plan.tasks;
  const index = list.findIndex((entry) => entry.id === input.id);
  if (index === -1) throw new Error(`Todo item not found: ${input.id}`);
  const [item] = list.splice(index, 1);

  plan.decisions.push({
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    inputText: `delete ${kind} ${input.id}`,
    appliedCount: 1,
    skippedCount: 0,
  });
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { kind, item, planSummary: summarizeFamilyPlan(plan) };
}

export function previewFamilyPlanning(input = {}, planPath = DEFAULT_PLAN_PATH) {
  ensurePlanFile(planPath);
  const plan = readFamilyPlan(planPath);
  const planningInput = resolvePlanningInput(input, plan);
  const planningContext = buildPlanningContext(plan, planningInput);
  const actions = normalizeActions(planningInput, planningContext);
  const proposed = actions.map((action) => summarizeAction(action, planningContext));
  const privacy = proposed
    .filter((action) => action.private || action.excludeMembers?.length)
    .map((action) => ({
      title: action.title,
      private: Boolean(action.private),
      excludeMembers: action.excludeMembers || [],
      recipients: action.recipients || [],
      decision: action.private ? "limit_recipients" : "normal",
    }));
  return {
    actions: proposed,
    privacy,
    riskLevel: maxRisk(
      proposed.reduce((risk, action) => maxRisk(risk, action.riskLevel), "low"),
      input.sendLark && proposed.some((action) => action.private) ? "high" : "low"
    ),
    summary: {
      proposedCount: proposed.length,
      eventCount: proposed.filter((action) => action.type === "event").length,
      taskCount: proposed.filter((action) => action.type === "task").length,
      shoppingCount: proposed.filter((action) => action.type === "shopping").length,
      privateCount: proposed.filter((action) => action.private).length,
    },
  };
}

export function planFamilyAffairs(input = {}, planPath = DEFAULT_PLAN_PATH) {
  ensurePlanFile(planPath);
  const plan = readFamilyPlan(planPath);
  const planningInput = resolvePlanningInput(input, plan);
  const planningContext = buildPlanningContext(plan, planningInput);
  const actions = normalizeActions(planningInput, planningContext);
  const applied = [];
  const skipped = [];

  for (const action of actions) {
    if (action.type === "shopping") {
      const existing = findShoppingDuplicate(plan, action);
      if (existing) {
        skipped.push({
          reason: "duplicate_shopping_item",
          item: action.item,
          existing,
        });
        continue;
      }
      const item = {
        id: randomUUID(),
        item: action.item,
        quantity: action.quantity || "1",
        assignee: action.assignee || null,
        dueDate: action.dueDate || null,
        alarmAt: action.alarmAt || null,
        status: "open",
        sourceText: action.sourceText || input.text || null,
        createdAt: new Date().toISOString(),
      };
      plan.shopping.push(item);
      applied.push({ type: "shopping", item });
      continue;
    }

    if (action.type === "task") {
      const existing = findTaskDuplicate(plan, action);
      if (existing) {
        skipped.push({
          reason: "duplicate_task",
          item: action.title,
          existing,
        });
        continue;
      }
      const task = {
        id: randomUUID(),
        title: action.title,
        assignee: action.assignee || null,
        dueDate: action.dueDate || null,
        alarmAt: action.alarmAt || null,
        priority: action.priority || "normal",
        category: action.category || "todo",
        status: "open",
        sourceText: action.sourceText || input.text || null,
        createdAt: new Date().toISOString(),
      };
      plan.tasks.push(task);
      applied.push({ type: "task", task });
      continue;
    }

    if (action.type === "event") {
      const existing = findEventDuplicate(plan, action, planningContext.members);
      if (existing) {
        skipped.push({
          reason: "duplicate_event",
          item: action.title,
          existing,
        });
        continue;
      }
      const event = {
        id: randomUUID(),
        title: action.title,
        date: action.date || action.dueDate || null,
        participants: action.participants || [],
        excludeMembers: action.excludeMembers || [],
        calendarSync: action.calendarSync || null,
        recurrence: action.recurrence || null,
        reminderPolicy: action.reminderPolicy || "one_day_before",
        recipients: chooseRecipients(planningContext.members, action),
        private: Boolean(action.private || action.excludeMembers?.length),
        sourceText: action.sourceText || input.text || null,
        createdAt: new Date().toISOString(),
      };
      plan.events.push(event);
      applied.push({ type: "event", event });
    }
  }

  const decision = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    inputText: planningInput.originalText || planningInput.text || null,
    appliedCount: applied.length,
    skippedCount: skipped.length,
  };
  plan.decisions.push(decision);
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  return {
    decision,
    applied,
    skipped,
    planSummary: summarizeFamilyPlan(plan),
  };
}

export function formatFamilyPlanningReport(result) {
  const lines = ["Family Agent Update", ""];

  if (result.applied.length) {
    lines.push("Added");
    for (const action of result.applied) {
      if (action.type === "event") {
        const event = action.event;
        lines.push(
          `- Event: ${event.title}${event.date ? ` (${event.date})` : ""}`,
          `  Recipients: ${formatList(event.recipients) || "none"}`
        );
        if (event.calendarSync?.type === "child_parent") {
          lines.push(`  Child-parent calendar sync: ${formatList([...event.calendarSync.children, ...event.calendarSync.parents])}`);
        }
      }
      if (action.type === "task") {
        const task = action.task;
        lines.push(`- Task: ${task.title}${task.assignee ? ` -> ${task.assignee}` : ""}${task.dueDate ? ` by ${task.dueDate}` : ""}`);
      }
      if (action.type === "shopping") {
        const item = action.item;
        lines.push(`- Shopping: ${item.item}${item.assignee ? ` -> ${item.assignee}` : ""}`);
      }
    }
  } else {
    lines.push("Added: none");
  }

  if (result.skipped.length) {
    lines.push("", "Skipped");
    for (const skipped of result.skipped) {
      lines.push(`- ${skipped.item}: ${skipped.reason}`);
    }
  }

  lines.push(
    "",
    "Current Plan",
    `- Open events: ${result.planSummary.openEvents}`,
    `- Open tasks: ${result.planSummary.openTasks}`,
    `- Open shopping items: ${result.planSummary.openShoppingItems}`
  );

  return lines.join("\n");
}

export function formatFamilyReminderReport(result) {
  const lines = [`Family Plan Reminders - ${result.date}`, ""];
  if (!result.reminders.length) {
    lines.push("No due family plan items for today or tomorrow.");
    return lines.join("\n");
  }

  for (const reminder of result.reminders) {
    const owner = reminder.assignee ? ` -> ${reminder.assignee}` : "";
    const privateTag = reminder.private ? " [private]" : "";
    lines.push(`- ${titleCase(reminder.kind)}: ${reminder.title}${owner} (${reminder.date})${privateTag}`);
  }
  return lines.join("\n");
}

export function summarizeFamilyPlan(plan) {
  return {
    members: plan.members.length,
    openEvents: plan.events.length,
    openTasks: plan.tasks.filter((task) => task.status !== "done").length,
    openShoppingItems: plan.shopping.filter((item) => item.status !== "done").length,
    lastDecision: plan.decisions.at(-1) || null,
  };
}

function ensurePlanFile(planPath) {
  if (fs.existsSync(planPath)) return;
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, `${JSON.stringify(DEFAULT_PLAN, null, 2)}\n`, "utf8");
}

function buildPlanningContext(plan, input = {}) {
  return {
    ...plan,
    members: mergePlanningMembers(plan.members || [], input.familyUsers || [], input.currentUser),
    currentUser: input.currentUser || null,
  };
}

function mergePlanningMembers(planMembers = [], familyUsers = [], currentUser = null) {
  const members = new Map();
  const scopedPlanMembers = familyUsers.length
    ? planMembers.filter((member) => matchesFamilyUser(member, familyUsers))
    : planMembers;

  for (const member of scopedPlanMembers) {
    if (!member?.name) continue;
    members.set(normalizeText(member.name), normalizeMemberRecord(member));
  }

  for (const user of [...familyUsers, currentUser].filter(Boolean)) {
    const displayName = user.displayName || user.name;
    if (!displayName) continue;
    const key = normalizeText(displayName);
    const existing = members.get(key) || {};
    const role = normalizeFamilyRole(user.familyRole || user.role || existing.role);
    const aliases = [
      ...(existing.aliases || []),
      displayName,
      user.nickname,
      user.loginId,
      ...roleAliases(role),
      ...roleAliases(user.familyRole || user.role),
    ].filter(Boolean);
    members.set(key, {
      ...existing,
      id: user.id || existing.id || key,
      name: displayName,
      role,
      aliases: [...new Set(aliases)],
      birthday: user.birthday || existing.birthday || "",
      age: typeof user.age === "number" ? user.age : calculateAgeFromBirthday(user.birthday) ?? existing.age ?? null,
      isAdult: typeof user.isAdult === "boolean" ? user.isAdult : existing.isAdult,
    });
  }

  return [...members.values()];
}

function matchesFamilyUser(member, familyUsers) {
  const memberTokens = [member?.id, member?.name, ...(member?.aliases || [])]
    .filter(Boolean)
    .map(normalizeText);
  return familyUsers.some((user) => {
    const userTokens = [user?.id, user?.displayName, user?.name, user?.nickname, user?.loginId]
      .filter(Boolean)
      .map(normalizeText);
    return memberTokens.some((token) => userTokens.includes(token));
  });
}

function normalizeMemberRecord(member) {
  const role = normalizeFamilyRole(member.role);
  return {
    ...member,
    role,
    aliases: [...new Set([...(member.aliases || []), ...roleAliases(role)])],
    age: typeof member.age === "number" ? member.age : calculateAgeFromBirthday(member.birthday),
  };
}

function normalizeActions(input, plan) {
  if (Array.isArray(input.actions)) {
    const actions = resolveFamilyReferencesInActions(input.actions, {
      members: plan.members,
      familyUsers: input.familyUsers,
      currentUser: input.currentUser,
    });
    return actions.map((action) => normalizeAction(action, plan, input));
  }
  if (input.text) {
    return parseTextActions(input.text, plan, input);
  }
  return [];
}

function normalizeAction(action, plan, input = {}) {
  const sourceText = action.sourceText || input.text || action.title || action.item || "";
  const eventLike = action.type === "event" || (action.type === "task" && EVENT_KEYWORD_PATTERN.test(sourceText) && !isPersonalTodoText(sourceText));
  const actionType = eventLike ? "event" : action.type;
  const inferredDate = action.date || action.dueDate || (actionType === "event" ? extractDate(sourceText) : action.dueDate);
  const inferredAlarmAt = action.alarmAt || extractAlarmAt(sourceText, inferredDate);
  const inferredParticipants = action.participants?.length
    ? action.participants
    : actionType === "event"
      ? findMentionedMembers(plan.members, sourceText)
      : [];
  const inferredExclusions = actionType === "event" && isSurpriseOrPrivateAction({ ...action, sourceText })
    ? findExcludedMembers(plan.members, sourceText)
    : [];
  const excludeMembers = uniqueNames([...(action.excludeMembers || []), ...inferredExclusions]);
  const normalized = {
    ...action,
    type: actionType,
    sourceText,
    date: actionType === "event" ? inferredDate : action.date,
    dueDate: actionType === "event" ? action.dueDate : action.dueDate || inferredDate,
    alarmAt: inferredAlarmAt,
    assignee: normalizeMemberName(plan.members, action.assignee),
    participants: normalizeMemberList(plan.members, inferredParticipants),
    excludeMembers: normalizeMemberList(plan.members, excludeMembers),
    recurrence: action.recurrence || extractRecurrence(sourceText),
  };
  return applyChildParentCalendarSync(normalized, plan, input);
}

function parseTextActions(text, plan, input = {}) {
  return text
    .split(/\n|;|；|。/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseSingleTextAction(item, plan, input))
    .filter(Boolean);
}

function parseSingleTextAction(text, plan, input = {}) {
  const lower = text.toLowerCase();
  const date = extractDate(text);
  const alarmAt = extractAlarmAt(text, date);
  const recurrence = extractRecurrence(text);
  const assignee = findFirstMember(plan.members, text);
  const excludeMembers = lower.includes("surprise") || lower.includes("do not tell") || lower.includes("exclude") || /birthday|生日|生辰|过生日|anniversary|纪念日|周年|gift|present|礼物|送礼/i.test(lower)
    ? findExcludedMembers(plan.members, text)
    : [];
  const hasShoppingKeyword = /\b(buy|get|purchase|shop)\b|买|购买|采购|购物|超市|牛奶|面包/i.test(text);
  const hasEventKeyword = EVENT_KEYWORD_PATTERN.test(text);
  const hasTaskKeyword = /\b(task|chore|clean|call|pick up|prepare|finish|submit)\b|任务|待办|提醒|完成|提交|打扫|准备|打电话|接送|处理/i.test(text);

  if (!date && isSuggestionOnlyText(text)) {
    return null;
  }

  if (hasShoppingKeyword) {
    return {
      type: "shopping",
      item: removeMemberNames(plan.members, cleanShoppingItem(text)),
      assignee,
      dueDate: date,
      alarmAt,
      sourceText: text,
    };
  }

  if (date && hasEventKeyword) {
    return applyChildParentCalendarSync({
      type: "event",
      title: cleanEventTitle(text),
      date,
      participants: findMentionedMembers(plan.members, text),
      excludeMembers,
      private: excludeMembers.length > 0,
      recurrence,
      sourceText: text,
    }, plan, input);
  }

  if (isPersonalTodoText(text) || hasTaskKeyword) {
    return {
      type: "task",
      title: cleanTaskTitle(text),
      assignee,
      dueDate: date,
      alarmAt,
      category: inferActionCategory(text, "todo"),
      sourceText: text,
    };
  }

  if (date || hasEventKeyword) {
    return applyChildParentCalendarSync({
      type: "event",
      title: cleanEventTitle(text),
      date,
      participants: findMentionedMembers(plan.members, text),
      excludeMembers,
      private: excludeMembers.length > 0,
      recurrence,
      sourceText: text,
    }, plan, input);
  }

  return {
    type: "task",
    title: text,
    assignee,
    dueDate: date,
    alarmAt,
    category: inferActionCategory(text, "todo"),
    sourceText: text,
  };
}

function applyChildParentCalendarSync(action, plan, input = {}) {
  if (action.type !== "event") return action;
  if (isSurpriseOrPrivateAction(action)) return action;

  const childNames = findChildEventTargets(action, plan, input);
  if (!childNames.length) return action;

  const parentNames = plan.members.filter(isParentMember).map((member) => member.name);
  if (!parentNames.length) return action;

  const participants = uniqueNames([...(action.participants || []), ...childNames, ...parentNames]);
  return {
    ...action,
    participants,
    calendarSync: {
      type: "child_parent",
      children: childNames,
      parents: parentNames,
      rule: "non_surprise_child_calendar_items_sync_with_parents",
    },
  };
}

function isSurpriseOrPrivateAction(action) {
  if (action.private || action.excludeMembers?.length) return true;
  return CHILD_PARENT_SYNC_SKIP_PATTERN.test([action.title, action.item, action.sourceText, action.category].filter(Boolean).join(" "));
}

function findChildEventTargets(action, plan, input = {}) {
  const targets = new Set();
  const mentionedNames = new Set([
    ...(action.participants || []),
    action.assignee,
    ...findMentionedMembers(plan.members, [action.title, action.sourceText].filter(Boolean).join(" ")),
  ].filter(Boolean).map(normalizeText));

  for (const member of plan.members) {
    if (mentionedNames.has(normalizeText(member.name)) && isChildMember(member)) {
      targets.add(member.name);
    }
  }

  const currentUserName = input.currentUser?.displayName || input.currentUser?.name;
  const currentUser = currentUserName ? findMemberByName(plan.members, currentUserName) : null;
  if (!targets.size && currentUser && isChildMember(currentUser)) {
    targets.add(currentUser.name);
  }

  return [...targets];
}

function isPersonalTodoText(text) {
  return /^(todo|to do|待办|任务)[:：\s]/i.test(text) || /^(今天|今晚|今天晚上|明天)?\s*(我要|我想|我需要|需要|记得|提醒我)/i.test(text);
}

function isSuggestionOnlyText(text) {
  return /推荐|搜索|检索|找|买什么|礼物|amazon|亚马逊|gift ideas|gift recommendation/i.test(text);
}

function extractDate(text) {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];

  const monthDay = text.match(/(?:(20\d{2})[年/-])?(\d{1,2})[月/-](\d{1,2})日?/);
  if (monthDay) {
    const now = new Date();
    const hasYear = Boolean(monthDay[1]);
    let year = Number(monthDay[1] || now.getFullYear());
    const month = Number(monthDay[2]) - 1;
    const day = Number(monthDay[3]);
    let date = new Date(year, month, day);
    if (date.getMonth() !== month || date.getDate() !== day) return null;
    // A birthday written as "10/4" means the next occurrence. This keeps
    // natural input useful after the current year's date has passed.
    if (!hasYear && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      year += 1;
      date = new Date(year, month, day);
    }
    return toLocalIsoDate(date);
  }

  if (/后天/.test(text)) return addLocalDays(2);

  const tomorrow = /\btomorrow\b/i.test(text) || /明天/.test(text);
  if (tomorrow) return addLocalDays(1);

  const today = /\btoday\b/i.test(text) || /今天|今晚|晚上/.test(text);
  if (today) return toLocalIsoDate(new Date());

  const weekday = extractWeekdayDate(text);
  if (weekday) return weekday;
  return null;
}

function extractAlarmAt(text, date) {
  const match = text.match(/(凌晨|早上|上午|中午|下午|晚上|今晚)?\s*(\d{1,2})(?:[:：](\d{2})|点(?:半|(\d{1,2})分?)?)/);
  if (!match) return null;

  let hour = Number(match[2]);
  let minute = Number(match[3] || match[4] || 0);
  if (match[0].includes("半")) minute = 30;
  const period = match[1] || "";
  if (/下午|晚上|今晚/.test(period) && hour < 12) hour += 12;
  if (/中午/.test(period) && hour < 11) hour += 12;
  if (!Number.isFinite(hour) || hour > 23 || !Number.isFinite(minute) || minute > 59) return null;

  const targetDate = date || toLocalIsoDate(new Date());
  const alarm = new Date(`${targetDate}T00:00:00`);
  alarm.setHours(hour, minute, 0, 0);
  return alarm.toISOString();
}

function extractWeekdayDate(text) {
  const match = text.match(/(每|下)?(?:周|星期|礼拜)([一二三四五六日天1-7])/);
  if (!match) return null;
  const weekdayMap = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 0,
    天: 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 0,
  };
  const now = new Date();
  const target = weekdayMap[match[2]];
  let diff = target - now.getDay();
  if (diff <= 0) diff += 7;
  if (match[1] === "下") diff += 7;
  return addLocalDays(diff);
}

function extractRecurrence(text) {
  const match = String(text || "").match(/(?:每|每个|every\s+)(?:周|星期|礼拜)?([一二三四五六日天1-7]|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (!match) return null;
  const weekdayMap = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 0,
    天: 0,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0,
  };
  const key = match[1].toLowerCase();
  const weekday = weekdayMap[key];
  if (typeof weekday !== "number") return null;
  return {
    frequency: "weekly",
    weekday,
    label: `每周${weekdayLabel(weekday)}`,
  };
}

function cleanShoppingItem(text) {
  return removeDateTimeWords(text)
    .replace(/\b(please|ask|tell|remind)\b/gi, "")
    .replace(/\b(buy|get|purchase|shop for)\b/gi, "")
    .replace(/(请|让|告诉|提醒我|提醒|购买|采购|购物|买)/g, "")
    .replace(/\bby\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\bon\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .trim()
    .replace(/\s+/g, " ");
}

function cleanTaskTitle(text) {
  return removeDateTimeWords(text)
    .replace(/\b(please|ask|tell|remind)\b/gi, "")
    .replace(/\bby\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/^(todo|to do|待办|任务)[:：]?\s*/i, "")
    .replace(/^(今天晚上|今天|今晚|明天|后天|晚上)\s*/i, "")
    .replace(/^(我要|我想|我需要|需要|记得|提醒我)\s*/i, "")
    .replace(/\s*(今天|今晚|今天晚上|明天|后天)$/i, "")
    .trim()
    .replace(/\s+/g, " ");
}

function cleanEventTitle(text) {
  return removeDateTimeWords(text)
    .replace(/\b(on|by)\s+20\d{2}-\d{2}-\d{2}\b/gi, "")
    .replace(/\b(please|remind|tell)\b/gi, "")
    .replace(/(请|提醒我|提醒)/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function removeDateTimeWords(text) {
  return text
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "")
    .replace(/(?:(20\d{2})[年/-])?\d{1,2}[月/-]\d{1,2}日?/g, "")
    .replace(/(今天晚上|今天|今晚|明天|后天|晚上|tomorrow|today)/gi, "")
    .replace(/(每|每个|下)?(?:周|星期|礼拜)[一二三四五六日天1-7]/g, "")
    .replace(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, "")
    .replace(/(凌晨|早上|上午|中午|下午|晚上|今晚)?\s*\d{1,2}(?:[:：]\d{2}|点(?:半|\d{1,2}分?)?)/g, "");
}

function inferActionCategory(text, fallback) {
  const lower = String(text || "").toLowerCase();
  if (/school|homework|class|学校|作业|课程|考试/.test(lower)) return "school";
  if (/doctor|dentist|health|gym|健身|医院|牙医|看病/.test(lower)) return "health";
  if (/surprise|private|秘密|惊喜/.test(lower)) return "private";
  return fallback;
}

function findShoppingDuplicate(plan, action) {
  const item = normalizeText(action.item);
  return plan.shopping.find((entry) => normalizeText(entry.item) === item && entry.status !== "cancelled");
}

function findTaskDuplicate(plan, action) {
  const title = normalizeText(action.title);
  const dueDate = action.dueDate || null;
  return plan.tasks.find((entry) => normalizeText(entry.title) === title && (entry.dueDate || null) === dueDate && entry.status !== "done");
}

function findEventDuplicate(plan, action, members = []) {
  const identity = eventIdentity(action, members);
  return plan.events.find((entry) => entry.status !== "cancelled" && eventIdentity(entry, members) === identity);
}

function eventIdentity(event, members = [], options = {}) {
  const recurrence = event.recurrence?.frequency === "weekly"
    ? `weekly:${event.recurrence.weekday}`
    : "none";
  const includeDate = options.includeOccurrenceDate || recurrence === "none";
  const participants = [...new Set((event.participants || []).map(normalizeText).filter(Boolean))].sort().join(",");
  const excluded = [...new Set((event.excludeMembers || []).map(normalizeText).filter(Boolean))].sort().join(",");
  const topic = normalizeEventTopic(event.title || event.item || event.sourceText || "", members);
  return [
    topic,
    includeDate ? event.date || event.dueDate || "" : "",
    recurrence,
    participants,
    excluded,
    event.private ? "private" : "shared",
  ].join("|");
}

function normalizeEventTopic(value, members = []) {
  let text = removeMemberNames(members, String(value));
  text = text
    .replace(/\b(football|soccer)(?:\s+(?:practice|training|match|game))?\b/gi, "football")
    .replace(/足球(?:训练|比赛|活动)?/gi, "football")
    .replace(/\b(has|have|does|goes|please|remind|tell)\b/gi, "")
    .replace(/(训练|比赛|活动|练习)/g, "")
    .replace(/(请|提醒我|提醒)/g, "");
  return normalizeText(text);
}

function chooseRecipients(members, action) {
  const excluded = new Set((action.excludeMembers || []).map(normalizeText));
  const privateMode = Boolean(action.private || excluded.size > 0);
  const eligibleMembers = members
    .filter((member) => !excluded.has(normalizeText(member.name)))
    .filter((member) => !privateMode || member.isAdult !== false && !isChildMember(member));
  if (excluded.size > 0) return eligibleMembers.map((member) => member.name);
  const mentioned = action.participants?.length ? action.participants : eligibleMembers.map((member) => member.name);
  return mentioned.filter((name) => !excluded.has(normalizeText(name)));
}

function findFirstMember(members, text) {
  return findMentionedMembers(members, text)[0] || null;
}

function findMentionedMembers(members, text) {
  const lower = text.toLowerCase();
  return members
    .filter((member) => [member.name, ...(member.aliases || [])].some((alias) => lower.includes(alias.toLowerCase())))
    .map((member) => member.name);
}

function findExcludedMembers(members, text) {
  const lower = text.toLowerCase();
  if (lower.includes("exclude")) return findMentionedMembers(members, text);
  if (lower.includes("do not tell")) return findMentionedMembers(members, text);
  if (lower.includes("surprise")) {
    return members
      .filter((member) => lower.includes(member.name.toLowerCase()))
      .map((member) => member.name);
  }
  if (/birthday|生日|生辰|过生日|anniversary|纪念日|周年|gift|present|礼物|送礼/i.test(lower)) {
    return findMentionedMembers(members, text);
  }
  return [];
}

function normalizeMemberName(members, value) {
  if (!value) return null;
  const lower = value.toLowerCase();
  const member = members.find((item) => [item.name, ...(item.aliases || [])].some((alias) => alias.toLowerCase() === lower));
  return member?.name || value;
}

function findMemberByName(members, value) {
  const lower = normalizeText(value);
  return members.find((member) => [member.name, ...(member.aliases || [])].some((alias) => normalizeText(alias) === lower)) || null;
}

function normalizeMemberList(members, values) {
  return values.map((value) => normalizeMemberName(members, value)).filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function normalizeFamilyRole(role) {
  const value = String(role || "").toLowerCase().trim();
  if (["father", "mother", "parent", "guardian"].includes(value)) return "parent";
  if (["child", "minor"].includes(value)) return "child";
  if (["grandparent", "adult"].includes(value)) return value;
  return value || "adult";
}

function roleAliases(role) {
  const value = String(role || "").toLowerCase().trim();
  if (value === "father") return ["dad", "daddy", "father", "爸爸", "父亲"];
  if (value === "mother") return ["mum", "mom", "mommy", "mummy", "mother", "妈妈", "母亲", "妈"];
  if (value === "parent" || value === "guardian") return [];
  if (value === "child" || value === "minor") return ["child", "kid", "孩子", "小孩"];
  if (value === "grandparent") return ["grandparent", "grandma", "grandpa", "祖父母"];
  return [];
}

function resolvePlanningInput(input, plan) {
  const members = buildFamilyMembers({
    planMembers: plan.members || [],
    familyUsers: input.familyUsers || [],
    currentUser: input.currentUser || null,
  });
  const memberResolution = resolveFamilyReferences(input.text || "", {
    members,
    currentUser: input.currentUser || null,
  });
  return {
    ...input,
    originalText: input.originalText || input.text || "",
    text: memberResolution.resolvedText || input.text || "",
    memberResolution,
    actions: resolveFamilyReferencesInActions(input.actions, {
      members,
      currentUser: input.currentUser || null,
    }),
  };
}

function calculateAgeFromBirthday(birthday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthday || ""))) return null;
  const birthDate = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
}

function isChildMember(member) {
  if (!member) return false;
  if (member.role === "child" || member.role === "minor") return true;
  if (member.isAdult === false) return true;
  return typeof member.age === "number" && member.age < 18;
}

function isParentMember(member) {
  if (!member) return false;
  if (member.role === "parent" || member.role === "guardian") return true;
  const aliases = [member.name, ...(member.aliases || [])].map((item) => normalizeText(item));
  return aliases.some((alias) => ["dad", "daddy", "father", "mum", "mom", "mummy", "mother", "爸爸", "父亲", "妈妈", "母亲"].includes(alias));
}

function uniqueNames(values) {
  const seen = new Set();
  const names = [];
  for (const value of values.filter(Boolean)) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(value);
  }
  return names;
}

function summarizeAction(action, plan) {
  if (action.type === "shopping") {
    return {
      type: "shopping",
      title: action.item,
      item: action.item,
      quantity: action.quantity || "1",
      assignee: action.assignee || null,
      dueDate: action.dueDate || null,
      alarmAt: action.alarmAt || null,
      riskLevel: "medium",
    };
  }

  if (action.type === "event") {
    const privateEvent = Boolean(action.private || action.excludeMembers?.length);
    return {
      type: "event",
      title: action.title,
      date: action.date || action.dueDate || null,
      participants: action.participants || [],
      excludeMembers: action.excludeMembers || [],
      recipients: chooseRecipients(plan.members, action),
      private: privateEvent,
      calendarSync: action.calendarSync || undefined,
      recurrence: action.recurrence || undefined,
      reminderPolicy: action.reminderPolicy || "one_day_before",
      riskLevel: "medium",
    };
  }

  return {
    type: "task",
    title: action.title,
    assignee: action.assignee || null,
    dueDate: action.dueDate || null,
    alarmAt: action.alarmAt || null,
    category: action.category || "todo",
    priority: action.priority || "normal",
    riskLevel: "medium",
  };
}

function maxRisk(left, right) {
  const order = ["low", "medium", "high", "critical"];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
}

function addLocalDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

function toLocalIsoDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function maxIsoDate(left, right) {
  return left > right ? left : right;
}

function isIsoWeekday(isoDate, weekday) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  return date.getUTCDay() === weekday;
}

function weekdayLabel(weekday) {
  return ["日", "一", "二", "三", "四", "五", "六"][weekday] || "";
}

function titleCase(value) {
  return String(value || "").slice(0, 1).toUpperCase() + String(value || "").slice(1);
}

function removeMemberNames(members, text) {
  return members
    .reduce((value, member) => {
      const names = [member.name, ...(member.aliases || [])];
      return names.reduce((current, name) => current.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), ""), value);
    }, text)
    .trim()
    .replace(/\s+/g, " ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatList(values) {
  return values.filter(Boolean).join(", ");
}
