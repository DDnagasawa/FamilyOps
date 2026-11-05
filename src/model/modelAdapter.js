const DIRECT_PROVIDERS = new Set(["openai", "doubao", "anthropic", "gemini", "ollama"]);
const FALLBACK_PROVIDERS = new Set(["codex_in_the_loop", "rules", "none", "disabled"]);
const VALID_ACTION_TYPES = new Set(["event", "task", "shopping"]);
const VALID_PRIORITIES = new Set(["low", "normal", "high"]);
const VALID_CATEGORIES = new Set(["todo", "calendar", "shopping", "school", "health", "home", "work", "private", "family"]);

const DEFAULT_TIMEOUT_MS = 20000;

export class ModelAdapter {
  constructor({ config = {}, fetchImpl = globalThis.fetch } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
    this.provider = normalizeProvider(config.provider);
  }

  async interpretFamilyInput(input = {}) {
    const text = String(input.text || "").trim();
    if (!text) {
      return this.#skipped("Input text is empty.");
    }

    if (!DIRECT_PROVIDERS.has(this.provider)) {
      return this.#skipped("Direct model provider is disabled. Using local rule parser.");
    }

    const readiness = this.#validateProvider();
    if (!readiness.ok) {
      return this.#skipped(readiness.reason);
    }

    if (typeof this.fetch !== "function") {
      return this.#skipped("fetch is not available in this Node.js runtime.");
    }

    const systemPrompt = this.provider === "doubao" ? buildCompactSystemPrompt(input) : buildSystemPrompt(input);
    const userPrompt = this.provider === "doubao" ? buildCompactUserPrompt(input) : buildUserPrompt(input);

    try {
      const rawText = await this.#callProvider({ systemPrompt, userPrompt });
      const parsed = parseModelJson(rawText);
      const actions = sanitizeActions(parsed.actions || parsed.items || [], text);

      return {
        ok: true,
        used: true,
        provider: this.provider,
        model: this.#modelName(),
        confidence: Number(parsed.confidence || 0.7),
        needsClarification: Boolean(parsed.needsClarification || parsed.needs_clarification),
        clarifyingQuestion: parsed.clarifyingQuestion || parsed.clarifying_question || null,
        actions,
        raw: {
          message: parsed.message || "",
          actionCount: actions.length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        used: false,
        provider: this.provider,
        model: this.#modelName(),
        status: "fallback",
        reason: `Model adapter failed, using local rule parser: ${error.message}`,
        actions: [],
      };
    }
  }

  #skipped(reason) {
    return {
      ok: false,
      used: false,
      provider: this.provider,
      model: this.#modelName(),
      status: "skipped",
      reason,
      actions: [],
    };
  }

  #validateProvider() {
    if (this.provider === "openai" && !this.config.openaiKey) {
      return { ok: false, reason: "AI_PROVIDER=openai requires OPENAI_API_KEY." };
    }
    if (this.provider === "doubao" && !this.config.arkKey) {
      return { ok: false, reason: "AI_PROVIDER=doubao requires ARK_API_KEY." };
    }
    if (this.provider === "anthropic" && !this.config.anthropicKey) {
      return { ok: false, reason: "AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY." };
    }
    if (this.provider === "gemini" && !this.config.geminiKey) {
      return { ok: false, reason: "AI_PROVIDER=gemini requires GEMINI_API_KEY." };
    }
    if (this.provider === "ollama" && !this.config.ollamaModel) {
      return { ok: false, reason: "AI_PROVIDER=ollama requires OLLAMA_MODEL." };
    }
    return { ok: true };
  }

  #modelName() {
    if (this.provider === "openai") return this.config.openaiModel || "gpt-5-mini";
    if (this.provider === "doubao") return this.config.arkModel || "doubao-seed-2-0-lite-260215";
    if (this.provider === "anthropic") return this.config.anthropicModel || "claude-sonnet-5";
    if (this.provider === "gemini") return this.config.geminiModel || "gemini-2.0-flash";
    if (this.provider === "ollama") return this.config.ollamaModel || "llama3.1";
    return "codex-in-the-loop";
  }

  async #callProvider({ systemPrompt, userPrompt }) {
    if (this.provider === "openai") return this.#callOpenAI({ systemPrompt, userPrompt });
    if (this.provider === "doubao") return this.#callDoubao({ systemPrompt, userPrompt });
    if (this.provider === "anthropic") return this.#callAnthropic({ systemPrompt, userPrompt });
    if (this.provider === "gemini") return this.#callGemini({ systemPrompt, userPrompt });
    if (this.provider === "ollama") return this.#callOllama({ systemPrompt, userPrompt });
    throw new Error(`Unsupported model provider: ${this.provider}`);
  }

  async #callOpenAI({ systemPrompt, userPrompt }) {
    const baseUrl = trimTrailingSlash(this.config.openaiBaseUrl || "https://api.openai.com/v1");
    const response = await this.#fetchJson(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#modelName(),
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: this.config.maxOutputTokens || 900,
      }),
    });
    return extractOpenAIText(response);
  }

  async #callDoubao({ systemPrompt, userPrompt }) {
    const mode = String(this.config.arkApiMode || "chat_completions").toLowerCase().trim();
    if (mode === "responses") {
      return this.#callDoubaoResponses({ systemPrompt, userPrompt });
    }
    return this.#callDoubaoChatCompletions({ systemPrompt, userPrompt });
  }

  async #callDoubaoResponses({ systemPrompt, userPrompt }) {
    const baseUrl = trimTrailingSlash(this.config.arkBaseUrl || "https://ark.cn-beijing.volces.com/api/v3");
    const response = await this.#fetchJson(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.arkKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#modelName(),
        instructions: systemPrompt,
        input: userPrompt,
        max_output_tokens: this.config.maxOutputTokens || 900,
      }),
    });
    return extractOpenAIText(response);
  }

  async #callDoubaoChatCompletions({ systemPrompt, userPrompt }) {
    const baseUrl = trimTrailingSlash(this.config.arkBaseUrl || "https://ark.cn-beijing.volces.com/api/v3");
    const response = await this.#fetchJson(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.arkKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#modelName(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        max_tokens: this.config.maxOutputTokens || 900,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        disable_deep_thinking: true,
      }),
    });
    return response.choices?.[0]?.message?.content || "";
  }

  async #callAnthropic({ systemPrompt, userPrompt }) {
    const baseUrl = trimTrailingSlash(this.config.anthropicBaseUrl || "https://api.anthropic.com");
    const response = await this.#fetchJson(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": this.config.anthropicKey,
        "anthropic-version": this.config.anthropicVersion || "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#modelName(),
        max_tokens: this.config.maxOutputTokens || 900,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    return response.content?.map((item) => item.text || "").join("\n").trim() || "";
  }

  async #callGemini({ systemPrompt, userPrompt }) {
    const baseUrl = trimTrailingSlash(this.config.geminiBaseUrl || "https://generativelanguage.googleapis.com/v1beta");
    const model = this.#modelName().startsWith("models/") ? this.#modelName() : `models/${this.#modelName()}`;
    const response = await this.#fetchJson(`${baseUrl}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.config.geminiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
    });
    return (
      response.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("\n")
        .trim() || ""
    );
  }

  async #callOllama({ systemPrompt, userPrompt }) {
    const baseUrl = trimTrailingSlash(this.config.ollamaBaseUrl || "http://localhost:11434");
    const response = await this.#fetchJson(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.#modelName(),
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    return response.message?.content || "";
  }

  async #fetchJson(url, options) {
    const timeoutMs = Number(this.config.timeoutMs || DEFAULT_TIMEOUT_MS);
    const attempts = Number(this.config.retries || 2);
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await this.fetch(url, {
          ...options,
          signal: controller.signal,
        });
        const text = await response.text();
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${text.slice(0, 240)}`);
        }
        return text ? JSON.parse(text) : {};
      } catch (error) {
        lastError = error;
        if (attempt === attempts || !isRetryableFetchError(error)) {
          throw error;
        }
        await sleep(300 * attempt);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }
}

export function normalizeProvider(value) {
  const provider = String(value || "codex_in_the_loop").toLowerCase().trim();
  if (provider === "codex" || provider === "codex-in-the-loop") return "codex_in_the_loop";
  if (provider === "claude") return "anthropic";
  if (provider === "ark" || provider === "volcengine" || provider === "volcengine_ark") return "doubao";
  if (provider === "local") return "ollama";
  if (DIRECT_PROVIDERS.has(provider) || FALLBACK_PROVIDERS.has(provider)) return provider;
  return "codex_in_the_loop";
}

function buildSystemPrompt(input) {
  const today = localIsoDate(new Date());
  return [
    "You are the Model Adapter for FamilyOps Agent.",
    "Your only job is to understand household text and return structured JSON.",
    "Do not execute tools. Do not send messages. Do not invent family members.",
    `Today is ${today}. Use ISO dates like YYYY-MM-DD.`,
    "For alarms, use ISO datetime strings if the user gives a time.",
    "Allowed action types: event, task, shopping.",
    "Allowed task categories: todo, calendar, shopping, school, health, home, work, private, family.",
    "If the user mentions a surprise or secret item, set private=true and exclude the person who should not be told.",
    "If the request is too unclear, set needsClarification=true and provide clarifyingQuestion.",
    "Return only JSON with this shape:",
    JSON.stringify({
      actions: [
        {
          type: "task",
          title: "go to gym",
          assignee: null,
          dueDate: today,
          alarmAt: null,
          category: "health",
          priority: "normal",
          participants: [],
          excludeMembers: [],
          private: false,
        },
      ],
      confidence: 0.9,
      needsClarification: false,
      clarifyingQuestion: null,
      message: "short Chinese summary",
    }),
  ].join("\n");
}

function buildCompactSystemPrompt() {
  const today = localIsoDate(new Date());
  return [
    `Today=${today}. Convert household text into JSON only.`,
    "Use simple ISO dates. If a time is given, set alarmAt as YYYY-MM-DDTHH:mm:ss.",
    "Allowed action types: event, task, shopping.",
    "Allowed categories: todo, calendar, shopping, school, health, home, work, private, family.",
    "Surprise or secret plans must set private=true and excludeMembers for the hidden person.",
    "Return exactly this JSON shape, no markdown:",
    JSON.stringify({
      actions: [
        {
          type: "task",
          title: "go to gym",
          item: null,
          date: today,
          dueDate: today,
          alarmAt: null,
          assignee: null,
          participants: [],
          excludeMembers: [],
          private: false,
          category: "health",
          priority: "normal",
        },
      ],
      confidence: 0.9,
      needsClarification: false,
      clarifyingQuestion: null,
      message: "short Chinese summary",
    }),
  ].join("\n");
}

function buildUserPrompt(input) {
  const familyPlan = input.familyPlan || {};
  const currentUser = publicPromptUser(input.currentUser);
  const members = (familyPlan.members || []).map((member) => ({
    name: member.name,
    role: member.role,
    aliases: member.aliases || [],
  }));
  const openTasks = (familyPlan.tasks || [])
    .filter((task) => task.status !== "done")
    .slice(-10)
    .map((task) => ({
      title: task.title,
      dueDate: task.dueDate,
      assignee: task.assignee,
      category: task.category,
    }));
  const openShopping = (familyPlan.shopping || [])
    .filter((item) => item.status !== "done")
    .slice(-10)
    .map((item) => ({
      item: item.item,
      dueDate: item.dueDate,
      assignee: item.assignee,
    }));

  return [
    "Current logged-in user:",
    JSON.stringify(currentUser),
    "Family members:",
    JSON.stringify(members),
    "Recent open tasks:",
    JSON.stringify(openTasks),
    "Recent open shopping items:",
    JSON.stringify(openShopping),
    "User text:",
    input.text,
  ].join("\n");
}

function buildCompactUserPrompt(input) {
  const familyPlan = input.familyPlan || {};
  const currentUser = publicPromptUser(input.currentUser);
  const members = (familyPlan.members || [])
    .map((member) => member.name)
    .filter(Boolean)
    .slice(0, 12);
  return [
    `Current user: ${currentUser.displayName || "unknown"} ${currentUser.familyRole ? `(${currentUser.familyRole})` : ""}`,
    currentUser.aiNotes ? `User notes: ${currentUser.aiNotes}` : "",
    `Family members: ${members.join(", ") || "none"}`,
    `User text: ${input.text}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function publicPromptUser(user = {}) {
  const profile = user || {};
  return {
    displayName: profile.displayName || "",
    nickname: profile.nickname || "",
    familyRole: profile.familyRole || "",
    isAdult: Boolean(profile.isAdult),
    birthday: profile.birthday || "",
    age: profile.age || null,
    contactChannels: profile.contactChannels || [],
    reminderStyle: profile.reminderStyle || "",
    defaultReminderTime: profile.defaultReminderTime || "",
    addresses: profile.addresses || {},
    preferences: profile.preferences || {},
    learning: profile.learning || {},
    aiNotes: profile.aiNotes || "",
  };
}

function parseModelJson(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("Model returned empty text.");
  const withoutFence = raw
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model did not return a JSON object.");
    }
    return JSON.parse(withoutFence.slice(start, end + 1));
  }
}

function sanitizeActions(actions, sourceText) {
  if (!Array.isArray(actions)) return [];
  return actions
    .slice(0, 12)
    .map((action) => sanitizeAction(action, sourceText))
    .filter(Boolean);
}

function sanitizeAction(action, sourceText) {
  if (!action || typeof action !== "object") return null;
  const rawType = String(action.type || inferActionType(action)).toLowerCase().trim();
  const type = rawType === "todo" ? "task" : rawType;
  if (!VALID_ACTION_TYPES.has(type)) return null;

  const base = {
    type,
    assignee: cleanOptionalString(action.assignee || action.owner || action.person),
    participants: cleanStringArray(action.participants),
    excludeMembers: cleanStringArray(action.excludeMembers || action.exclude_members),
    private: Boolean(action.private),
    sourceText,
  };

  if (type === "shopping") {
    const item = cleanRequiredString(action.item || action.title || action.content || action.name);
    if (!item) return null;
    return {
      ...base,
      item,
      quantity: cleanOptionalString(action.quantity) || "1",
      dueDate: cleanOptionalDate(action.dueDate || action.due_date || action.date),
      alarmAt: cleanOptionalString(action.alarmAt || action.alarm_at),
    };
  }

  if (type === "event") {
    const title = cleanRequiredString(action.title || action.item || action.content || action.name);
    if (!title) return null;
    return {
      ...base,
      title,
      date: cleanOptionalDate(action.date || action.dueDate || action.due_date),
      reminderPolicy: cleanOptionalString(action.reminderPolicy || action.reminder_policy) || "one_day_before",
    };
  }

  const title = cleanRequiredString(action.title || action.item || action.content || action.name || action.task);
  if (!title) return null;
  return {
    ...base,
    title,
    dueDate: cleanOptionalDate(action.dueDate || action.due_date || action.date),
    alarmAt: cleanOptionalString(action.alarmAt || action.alarm_at),
    category: normalizeCategory(action.category),
    priority: normalizePriority(action.priority),
  };
}

function inferActionType(action) {
  const text = String(action.action || action.intent || action.kind || "").toLowerCase();
  if (/shop|shopping|buy|purchase|grocery/.test(text)) return "shopping";
  if (/event|calendar|schedule|meeting/.test(text)) return "event";
  if (/todo|task|reminder|remind/.test(text)) return "task";
  return "";
}

function extractOpenAIText(response) {
  if (response.output_text) return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function normalizePriority(value) {
  const priority = String(value || "normal").toLowerCase().trim();
  return VALID_PRIORITIES.has(priority) ? priority : "normal";
}

function normalizeCategory(value) {
  const category = String(value || "todo").toLowerCase().trim();
  return VALID_CATEGORIES.has(category) ? category : "todo";
}

function cleanRequiredString(value) {
  const text = cleanOptionalString(value);
  return text && text.length <= 160 ? text : "";
}

function cleanOptionalString(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim().replace(/\s+/g, " ") || null;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanOptionalString).filter(Boolean).slice(0, 12);
}

function cleanOptionalDate(value) {
  const text = cleanOptionalString(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function localIsoDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function isRetryableFetchError(error) {
  const message = String(error?.message || "");
  return error?.name === "AbortError" || /fetch failed|socket|timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
