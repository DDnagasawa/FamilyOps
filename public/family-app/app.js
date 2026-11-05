const API_BASE = location.protocol === "file:" ? "http://127.0.0.1:5177" : "";

const CATEGORIES = [
  { id: "event", label: "家庭事件", color: "#ff3b30" },
  { id: "todo", label: "Todo List", color: "#ffcc00" },
  { id: "shopping", label: "购物", color: "#ff9500" },
  { id: "school", label: "学校", color: "#007aff" },
  { id: "health", label: "健康", color: "#34c759" },
  { id: "private", label: "惊喜/私密", color: "#5b6b75" },
];

const PAGE_META = {
  assistant: { title: "AI 对话", subtitle: "用一句话安排家庭事务" },
  calendar: { title: "日历", subtitle: "家庭事件和 Todo 归档" },
  todos: { title: "Todo List", subtitle: "单独管理每一项待办" },
  learning: { title: "记忆与学习", subtitle: "可控的跨会话记忆和候选规则" },
  profile: { title: "用户中心", subtitle: "基础信息和提醒偏好" },
};

const ALARM_GRACE_MS = 10 * 60 * 1000;
const ADVANCE_REMINDER_GRACE_MS = 90 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const state = {
  snapshot: null,
  learning: { settings: { enabled: true, reviewEnabled: false }, memories: [], candidates: [] },
  authToken: localStorage.getItem("familyOpsAuthToken") || "",
  currentUser: null,
  todayDate: toIsoDate(new Date()),
  activePage: validPage(location.hash.replace("#", "")) || "calendar",
  selectedDate: toIsoDate(new Date()),
  selectedCategory: "all",
  calendarView: "month",
  visibleMonth: new Date(),
  chatCount: 0,
  appTimer: null,
  agentStatusTimer: null,
  activeAlarm: null,
  agentStatus: null,
  audioContext: null,
  firedAlarms: new Set(JSON.parse(localStorage.getItem("familyOpsFiredAlarms") || "[]")),
  remindersEnabled: localStorage.getItem("familyOpsRemindersEnabled") === "true",
};

const els = {
  appShell: document.querySelector("#appShell"),
  authMessage: document.querySelector("#authMessage"),
  authScreen: document.querySelector("#authScreen"),
  alarmBody: document.querySelector("#alarmBody"),
  alarmComplete: document.querySelector("#alarmComplete"),
  alarmMeta: document.querySelector("#alarmMeta"),
  alarmOverlay: document.querySelector("#alarmOverlay"),
  alarmSnooze: document.querySelector("#alarmSnooze"),
  alarmStop: document.querySelector("#alarmStop"),
  alarmTitle: document.querySelector("#alarmTitle"),
  agentStatus: document.querySelector("#agentStatus"),
  assistantInbox: document.querySelector("#assistantInbox"),
  assistantPage: document.querySelector("#assistantPage"),
  calendarBadge: document.querySelector("#calendarBadge"),
  calendarDayDetail: document.querySelector("#calendarDayDetail"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarMonthView: document.querySelector("#calendarMonthView"),
  calendarPage: document.querySelector("#calendarPage"),
  chatBadge: document.querySelector("#chatBadge"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  chatMessages: document.querySelector("#chatMessages"),
  currentDateLabel: document.querySelector("#currentDateLabel"),
  dayItems: document.querySelector("#dayItems"),
  filterButton: document.querySelector("#filterButton"),
  filterOptions: document.querySelector("#filterOptions"),
  filterPopover: document.querySelector("#filterPopover"),
  historyList: document.querySelector("#historyList"),
  historyTitle: document.querySelector("#historyTitle"),
  loginForm: document.querySelector("#loginForm"),
  loginId: document.querySelector("#loginId"),
  loginPassword: document.querySelector("#loginPassword"),
  loginSubmit: document.querySelector("#loginSubmit"),
  loginTab: document.querySelector("#loginTab"),
  monthLabel: document.querySelector("#monthLabel"),
  newItemButton: document.querySelector("#newItemButton"),
  notificationButton: document.querySelector("#notificationButton"),
  pageSubtitle: document.querySelector("#pageSubtitle"),
  pageTitle: document.querySelector("#pageTitle"),
  profileAiNotes: document.querySelector("#profileAiNotes"),
  profileAllergies: document.querySelector("#profileAllergies"),
  profileBadge: document.querySelector("#profileBadge"),
  profileBirthday: document.querySelector("#profileBirthday"),
  profileCompanyAddress: document.querySelector("#profileCompanyAddress"),
  profileDefaultReminderTime: document.querySelector("#profileDefaultReminderTime"),
  profileDisplayName: document.querySelector("#profileDisplayName"),
  profileDislikes: document.querySelector("#profileDislikes"),
  profileFoodPreferences: document.querySelector("#profileFoodPreferences"),
  profileForm: document.querySelector("#profileForm"),
  profileGender: document.querySelector("#profileGender"),
  profileHomeAddress: document.querySelector("#profileHomeAddress"),
  profileInterests: document.querySelector("#profileInterests"),
  profileIsAdult: document.querySelector("#profileIsAdult"),
  profileLoginId: document.querySelector("#profileLoginId"),
  profileMessage: document.querySelector("#profileMessage"),
  profileMeta: document.querySelector("#profileMeta"),
  profileName: document.querySelector("#profileName"),
  profileNickname: document.querySelector("#profileNickname"),
  profilePage: document.querySelector("#profilePage"),
  profileAvatar: document.querySelector("#profileAvatar"),
  profileReminderStyle: document.querySelector("#profileReminderStyle"),
  profileRole: document.querySelector("#profileRole"),
  profileSchoolAddress: document.querySelector("#profileSchoolAddress"),
  prevMonth: document.querySelector("#prevMonth"),
  nextMonth: document.querySelector("#nextMonth"),
  registerAiNotes: document.querySelector("#registerAiNotes"),
  registerAllergies: document.querySelector("#registerAllergies"),
  registerBirthday: document.querySelector("#registerBirthday"),
  registerCompanyAddress: document.querySelector("#registerCompanyAddress"),
  registerDefaultReminderTime: document.querySelector("#registerDefaultReminderTime"),
  registerDislikes: document.querySelector("#registerDislikes"),
  registerFamilyCode: document.querySelector("#registerFamilyCode"),
  registerFamilyInviteLink: document.querySelector("#registerFamilyInviteLink"),
  registerFamilyJoinCode: document.querySelector("#registerFamilyJoinCode"),
  registerFoodPreferences: document.querySelector("#registerFoodPreferences"),
  registerForm: document.querySelector("#registerForm"),
  registerGender: document.querySelector("#registerGender"),
  generateFamilyCode: document.querySelector("#generateFamilyCode"),
  familyInviteMessage: document.querySelector("#familyInviteMessage"),
  registerHomeAddress: document.querySelector("#registerHomeAddress"),
  registerInterests: document.querySelector("#registerInterests"),
  registerIsAdult: document.querySelector("#registerIsAdult"),
  registerLoginId: document.querySelector("#registerLoginId"),
  registerName: document.querySelector("#registerName"),
  registerNickname: document.querySelector("#registerNickname"),
  registerPassword: document.querySelector("#registerPassword"),
  registerReminderStyle: document.querySelector("#registerReminderStyle"),
  registerRole: document.querySelector("#registerRole"),
  registerSchoolAddress: document.querySelector("#registerSchoolAddress"),
  registerTab: document.querySelector("#registerTab"),
  searchInput: document.querySelector("#searchInput"),
  selectedDateSub: document.querySelector("#selectedDateSub"),
  selectedDateTitle: document.querySelector("#selectedDateTitle"),
  tagChips: document.querySelector("#tagChips"),
  todoAlarm: document.querySelector("#todoAlarm"),
  todoBadge: document.querySelector("#todoBadge"),
  learningBadge: document.querySelector("#learningBadge"),
  todoCancel: document.querySelector("#todoCancel"),
  todoForm: document.querySelector("#todoForm"),
  todoList: document.querySelector("#todoList"),
  todoModal: document.querySelector("#todoModal"),
  todoPage: document.querySelector("#todoPage"),
  learningPage: document.querySelector("#learningPage"),
  todoTitle: document.querySelector("#todoTitle"),
  addTodoSide: document.querySelector("#addTodoSide"),
  backToMonth: document.querySelector("#backToMonth"),
  logoutButton: document.querySelector("#logoutButton"),
  learningEnabled: document.querySelector("#learningEnabled"),
  learningReviewEnabled: document.querySelector("#learningReviewEnabled"),
  runLearningReview: document.querySelector("#runLearningReview"),
  clearLearningMemory: document.querySelector("#clearLearningMemory"),
  learningMessage: document.querySelector("#learningMessage"),
  learningCandidates: document.querySelector("#learningCandidates"),
  learningMemories: document.querySelector("#learningMemories"),
};

init();

async function init() {
  bindAuthEvents();
  bindEvents();
  applyFamilyInviteFromUrl();
  updateNotificationButton();
  const authenticated = await restoreSession();
  if (!authenticated) {
    showAuthMode("login");
    return;
  }
  enterApp();
}

async function enterApp() {
  els.authScreen.hidden = true;
  els.appShell.hidden = false;
  renderCategoryControls();
  setPage(state.activePage, { silent: true });
  await loadSnapshot();
  await loadLearning();
  await loadAgentStatus();
  if (!els.chatMessages.childElementCount) {
    addBubble("agent", "你可以直接输入：今天我要去健身；明天提醒 John 买牛奶；周六 Lisa 足球比赛。");
  }
  if (!state.appTimer) {
    state.appTimer = setInterval(() => {
      refreshTodayDate();
      checkAlarms();
      render();
    }, 30000);
  }
  if (!state.agentStatusTimer) {
    state.agentStatusTimer = setInterval(loadAgentStatus, 10000);
  }
}

function bindAuthEvents() {
  els.loginTab.addEventListener("click", () => showAuthMode("login"));
  els.registerTab.addEventListener("click", () => showAuthMode("register"));
  els.loginForm.addEventListener("submit", submitLogin);
  els.registerForm.addEventListener("submit", submitRegister);
  els.profileForm.addEventListener("submit", submitProfile);
  els.profileAvatar.addEventListener("click", () => setPage("profile"));
  els.logoutButton.addEventListener("click", logout);
  els.generateFamilyCode.addEventListener("click", generateFamilyCode);
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => setPage(button.dataset.page));
  });
  els.prevMonth.addEventListener("click", () => changeMonth(-1));
  els.nextMonth.addEventListener("click", () => changeMonth(1));
  els.filterButton.addEventListener("click", () => {
    els.filterPopover.hidden = !els.filterPopover.hidden;
  });
  els.newItemButton.addEventListener("click", handleAddAction);
  els.notificationButton.addEventListener("click", enableReminders);
  els.alarmStop.addEventListener("click", dismissAlarm);
  els.alarmSnooze.addEventListener("click", snoozeAlarm);
  els.alarmComplete.addEventListener("click", completeActiveAlarm);
  els.todoCancel.addEventListener("click", hideTodoForm);
  els.todoModal.addEventListener("click", (event) => {
    if (event.target === els.todoModal) hideTodoForm();
  });
  els.backToMonth.addEventListener("click", () => {
    state.calendarView = "month";
    render();
  });
  els.addTodoSide.addEventListener("click", () => {
    setPage("todos");
    showTodoForm();
  });
  els.searchInput.addEventListener("input", render);
  els.todoForm.addEventListener("submit", submitTodo);
  els.chatForm.addEventListener("submit", submitChat);
  els.learningEnabled.addEventListener("change", updateLearningSettings);
  els.learningReviewEnabled.addEventListener("change", updateLearningSettings);
  els.runLearningReview.addEventListener("click", runLearningReview);
  els.clearLearningMemory.addEventListener("click", clearLearningMemory);
}

async function loadSnapshot() {
  try {
    const data = await api("/api/family/plan");
    state.snapshot = data;
    if (data.currentUser) state.currentUser = data.currentUser;
    render();
    checkAlarms();
  } catch (error) {
    addBubble("agent", `本地服务没有连接：${error.message}`);
  }
}

async function loadAgentStatus() {
  try {
    const data = await api("/api/agent/status");
    state.agentStatus = data.status;
    renderAgentStatus();
  } catch {
    state.agentStatus = null;
    renderAgentStatus();
  }
}

async function loadLearning() {
  try {
    const [settings, memories, candidates] = await Promise.all([
      api("/api/learning/settings"),
      api("/api/learning/memories"),
      api("/api/learning/candidates"),
    ]);
    state.learning = {
      settings: settings.settings || { enabled: true, reviewEnabled: false },
      memories: memories.memories || [],
      candidates: candidates.candidates || [],
    };
    renderLearning();
  } catch (error) {
    state.learning = { settings: { enabled: true, reviewEnabled: false }, memories: [], candidates: [] };
    if (els.learningMessage) els.learningMessage.textContent = `学习层未连接：${error.message}`;
  }
}

async function restoreSession() {
  if (!state.authToken) return false;
  try {
    const data = await api("/api/auth/me");
    state.currentUser = data.user;
    return true;
  } catch {
    localStorage.removeItem("familyOpsAuthToken");
    state.authToken = "";
    state.currentUser = null;
    return false;
  }
}

async function submitLogin(event) {
  event.preventDefault();
  if (els.loginSubmit?.disabled) return;
  setAuthBusy(true);
  setAuthMessage("processing...");
  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        loginId: els.loginId.value,
        password: els.loginPassword.value,
      }),
    });
    setSession(data);
    await enterApp();
  } catch (error) {
    setAuthMessage(error.message || "登录失败，请重试");
  } finally {
    setAuthBusy(false);
  }
}

async function submitRegister(event) {
  event.preventDefault();
  setAuthMessage("processing...");
  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        displayName: els.registerName.value,
        loginId: els.registerLoginId.value,
        password: els.registerPassword.value,
        familyRole: els.registerRole.value,
        gender: els.registerGender.value,
        familyCode: els.registerFamilyJoinCode.value.trim() || els.registerFamilyCode.value.trim(),
        isAdult: els.registerIsAdult.value,
        nickname: els.registerNickname.value,
        birthday: els.registerBirthday.value,
        contactChannels: checkedValues("registerContactChannel"),
        reminderStyle: els.registerReminderStyle.value,
        defaultReminderTime: els.registerDefaultReminderTime.value,
        homeAddress: els.registerHomeAddress.value,
        companyAddress: els.registerCompanyAddress.value,
        schoolAddress: els.registerSchoolAddress.value,
        interests: els.registerInterests.value,
        foodPreferences: els.registerFoodPreferences.value,
        allergies: els.registerAllergies.value,
        dislikes: els.registerDislikes.value,
        aiNotes: els.registerAiNotes.value,
      }),
    });
    setSession(data);
    await enterApp();
  } catch (error) {
    setAuthMessage(error.message);
  }
}

async function generateFamilyCode() {
  els.generateFamilyCode.disabled = true;
  els.familyInviteMessage.textContent = "processing...";
  try {
    const data = await api("/api/auth/family/invite", { method: "POST" });
    const family = data.family || {};
    els.registerFamilyCode.value = family.code || "";
    els.registerFamilyInviteLink.value = family.invitePath
      ? `${window.location.origin}${family.invitePath}`
      : "";
    els.familyInviteMessage.textContent = "家庭码已生成，同一家庭使用同一个码。";
  } catch (error) {
    els.familyInviteMessage.textContent = error.message || "家庭码生成失败";
  } finally {
    els.generateFamilyCode.disabled = false;
  }
}

function applyFamilyInviteFromUrl() {
  const code = new URLSearchParams(window.location.search).get("familyCode");
  if (code && els.registerFamilyJoinCode) {
    els.registerFamilyJoinCode.value = code;
    showAuthMode("register");
  }
}

async function submitProfile(event) {
  event.preventDefault();
  els.profileMessage.textContent = "processing...";
  try {
    const data = await api("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: els.profileDisplayName.value,
        loginId: els.profileLoginId.value,
        familyRole: els.profileRole.value,
        gender: els.profileGender.value,
        isAdult: els.profileIsAdult.value,
        nickname: els.profileNickname.value,
        birthday: els.profileBirthday.value,
        contactChannels: checkedValues("profileContactChannel"),
        reminderStyle: els.profileReminderStyle.value,
        defaultReminderTime: els.profileDefaultReminderTime.value,
        homeAddress: els.profileHomeAddress.value,
        companyAddress: els.profileCompanyAddress.value,
        schoolAddress: els.profileSchoolAddress.value,
        interests: els.profileInterests.value,
        foodPreferences: els.profileFoodPreferences.value,
        allergies: els.profileAllergies.value,
        dislikes: els.profileDislikes.value,
        aiNotes: els.profileAiNotes.value,
      }),
    });
    state.currentUser = data.user;
    renderProfile();
    els.profileMessage.textContent = "已保存";
  } catch (error) {
    els.profileMessage.textContent = error.message;
  }
}

async function logout() {
  if (state.authToken) {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  }
  localStorage.removeItem("familyOpsAuthToken");
  state.authToken = "";
  state.currentUser = null;
  state.snapshot = null;
  els.appShell.hidden = true;
  els.authScreen.hidden = false;
  els.chatMessages.innerHTML = "";
  showAuthMode("login");
}

function setSession(data) {
  state.authToken = data.token;
  state.currentUser = data.user;
  localStorage.setItem("familyOpsAuthToken", data.token);
  setAuthMessage("");
}

function showAuthMode(mode) {
  const register = mode === "register";
  els.authScreen.hidden = false;
  els.appShell.hidden = true;
  els.loginForm.hidden = register;
  els.registerForm.hidden = !register;
  els.loginTab.classList.toggle("active", !register);
  els.registerTab.classList.toggle("active", register);
  els.authMessage.textContent = "";
}

function setAuthMessage(message) {
  els.authMessage.textContent = message;
}

function setAuthBusy(busy) {
  if (!els.loginSubmit) return;
  els.loginSubmit.disabled = busy;
  els.loginSubmit.textContent = busy ? "登录中..." : "进入";
}

function checkedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

function setCheckedValues(name, values = []) {
  const selected = new Set(values.length ? values : ["app"]);
  document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function listText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join("、");
  return String(value || "").trim();
}

async function submitChat(event) {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  const submitButton = els.chatForm.querySelector('button[type="submit"]');
  els.chatInput.value = "";
  els.chatInput.disabled = true;
  submitButton.disabled = true;
  state.chatCount += 1;
  addBubble("user", text);
  const pendingBubble = addBubble("agent thinking", "processing...");
  try {
    const data = await api("/api/family/chat", {
      method: "POST",
      body: JSON.stringify({ text, includeWebResults: shouldIncludeWebResults(text) }),
    });
    state.snapshot = data;
    renderAgentTurnReply(pendingBubble, data.result);
    render();
    checkAlarms();
  } catch (error) {
    pendingBubble.className = "bubble agent error";
    pendingBubble.textContent = "记录失败，请重试";
  } finally {
    els.chatInput.disabled = false;
    submitButton.disabled = false;
    els.chatInput.focus();
  }
}

async function submitTodo(event) {
  event.preventDefault();
  const title = els.todoTitle.value.trim();
  if (!title) return;
  const data = await api("/api/family/todos", {
    method: "POST",
    body: JSON.stringify({
      kind: "task",
      title,
      category: "todo",
      dueDate: state.todayDate,
      alarmAt: els.todoAlarm.value ? new Date(els.todoAlarm.value).toISOString() : null,
    }),
  });
  state.snapshot = data;
  await recordLearningFeedback("task_created", title, { taskType: "manual_todo", category: "todo", kind: "task" });
  hideTodoForm();
  render();
}

async function completeTodo(todo) {
  if (todo.status === "done") return;
  const data = await api(`/api/family/todos/${todo.id}/complete`, {
    method: "POST",
    body: JSON.stringify({ kind: todo.kind }),
  });
  state.snapshot = data;
  await recordLearningFeedback("todo_completed", todo.id, { taskType: todo.category || "todo", category: todo.category || "todo", kind: todo.kind });
  render();
}

async function deleteTodo(todo) {
  const data = await api(`/api/family/todos/${todo.id}`, {
    method: "DELETE",
    body: JSON.stringify({ kind: todo.kind }),
  });
  state.snapshot = data;
  render();
}

async function setAlarm(todo) {
  const value = prompt("设置提醒时间，例如 2026-09-02T20:00", toDatetimeLocal(todo.alarmAt || new Date()));
  if (!value) return;
  const data = await api(`/api/family/todos/${todo.id}`, {
    method: "PATCH",
    body: JSON.stringify({ kind: todo.kind, alarmAt: new Date(value).toISOString() }),
  });
  state.snapshot = data;
  render();
}

function render() {
  if (!state.snapshot) return;
  const items = allItems();
  const todayTodos = items.filter(isTodayTodo);
  const openTodos = todayTodos.filter((item) => item.status !== "done");
  const events = items.filter((item) => item.kind === "event");

  els.currentDateLabel.textContent = new Intl.DateTimeFormat(window.FAMILYOPS_LOCALE || "zh-CN", { dateStyle: "full" }).format(new Date());
  els.calendarBadge.textContent = events.length;
  els.todoBadge.textContent = openTodos.length;
  els.learningBadge.textContent = state.learning.candidates.filter((item) => item.status === "candidate").length;
  els.chatBadge.textContent = state.chatCount;
  els.profileBadge.textContent = userInitial(state.currentUser);

  renderActivePage();
  renderCalendar(items);
  renderDayDetail(items);
  renderTodos(items);
  renderAssistantInbox(items);
  renderAgentStatus();
  renderLearning();
  renderHistory(items);
  renderProfile();
}

function renderActivePage() {
  const meta = PAGE_META[state.activePage];
  const items = allItems();
  const dayItems = items.filter((item) => isItemOnDate(item, state.selectedDate));
  const todayTodos = items.filter(isTodayTodo);
  const openTodos = todayTodos.filter((item) => item.status !== "done");
  const doneTodayTodos = todayTodos.filter((item) => item.status === "done");
  const doneOnDate = dayItems.filter((item) => isTodo(item) && item.status === "done").length;

  els.pageTitle.textContent = meta.title;
  if (state.activePage === "calendar") {
    els.pageSubtitle.textContent =
      state.calendarView === "day"
        ? `${formatDateTitle(state.selectedDate)} · ${dayItems.length} 个登记信息 · ${doneOnDate} 个 Todo 已完成`
        : `${formatDateTitle(state.selectedDate)} · ${dayItems.length} 个事项 · ${doneOnDate} 个 Todo 已完成`;
  } else if (state.activePage === "todos") {
    els.pageSubtitle.textContent = `${formatDateTitle(state.todayDate)} · ${openTodos.length} 个未完成 · ${doneTodayTodos.length}/${todayTodos.length} 已完成`;
  } else {
    els.pageSubtitle.textContent = meta.subtitle;
  }

  els.filterButton.hidden = state.activePage !== "calendar";
  if (state.activePage !== "calendar") els.filterPopover.hidden = true;
  els.assistantPage.hidden = state.activePage !== "assistant";
  els.calendarPage.hidden = state.activePage !== "calendar";
  els.todoPage.hidden = state.activePage !== "todos";
  els.learningPage.hidden = state.activePage !== "learning";
  els.profilePage.hidden = state.activePage !== "profile";
  els.calendarMonthView.hidden = state.activePage !== "calendar" || state.calendarView !== "month";
  els.calendarDayDetail.hidden = state.activePage !== "calendar" || state.calendarView !== "day";

  document.querySelectorAll("[data-page]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.page === state.activePage);
    button.classList.toggle("active", button.dataset.page === state.activePage);
  });
}

function renderCalendar(items) {
  const date = state.visibleMonth;
  const year = date.getFullYear();
  const month = date.getMonth();
  const visible = filteredItems(items).sort(compareItems);
  els.monthLabel.textContent = new Intl.DateTimeFormat(window.FAMILYOPS_LOCALE || "zh-CN", { year: "numeric", month: "long" }).format(date);
  els.calendarGrid.innerHTML = "";

  const first = new Date(year, month, 1);
  const firstDay = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - firstDay);

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(start);
    cellDate.setDate(start.getDate() + index);
    const iso = toIsoDate(cellDate);
    const dayItems = visible.filter((item) => isItemOnDate(item, iso));
    const cell = document.createElement("button");
    cell.className = [
      "day-cell",
      cellDate.getMonth() !== month ? "outside" : "",
      iso === state.selectedDate ? "selected" : "",
      iso === toIsoDate(new Date()) ? "today" : "",
    ].join(" ");
    cell.innerHTML = `<div class="day-number">${cellDate.getDate()}</div>`;
    for (const item of dayItems.slice(0, 3)) {
      const event = document.createElement("div");
      event.className = `calendar-event ${item.status === "done" ? "done" : ""}`;
      event.innerHTML = `<i class="category-dot" style="background:${categoryFor(item).color}"></i><span>${escapeHtml(item.title)}</span>`;
      cell.appendChild(event);
    }
    if (dayItems.length > 3) {
      const more = document.createElement("div");
      more.className = "more-items";
      more.textContent = `+${dayItems.length - 3}`;
      cell.appendChild(more);
    }
    cell.addEventListener("click", () => {
      state.selectedDate = iso;
      state.visibleMonth = new Date(cellDate);
      state.calendarView = "day";
      render();
    });
    els.calendarGrid.appendChild(cell);
  }
}

function renderDayDetail(items) {
  const visible = filteredItems(items).filter((item) => isItemOnDate(item, state.selectedDate)).sort(compareItems);
  const events = visible.filter((item) => item.kind === "event");
  const archivedTodos = visible.filter(isTodo);
  const doneCount = archivedTodos.filter((item) => item.status === "done").length;

  els.selectedDateTitle.textContent = state.selectedDate === toIsoDate(new Date()) ? "今天" : formatDateTitle(state.selectedDate);
  els.selectedDateSub.textContent = `${events.length} 个事件 · ${doneCount}/${archivedTodos.length} 个 Todo 已完成`;
  els.dayItems.innerHTML = "";

  els.dayItems.appendChild(createDaySummary(visible, events, archivedTodos));
  els.dayItems.appendChild(createDaySection("家庭事件", events, createEventRow));
  els.dayItems.appendChild(createDaySection("Todo List 归档", archivedTodos, createTodoArchiveRow));
}

function renderTodos(items) {
  const todos = filteredItems(items).filter(isTodayTodo).filter(matchesSearch).sort(compareTodayTodos);
  els.todoList.innerHTML = "";
  if (!todos.length) {
    els.todoList.innerHTML = '<div class="empty-row">今天还没有 Todo</div>';
    return;
  }
  for (const todo of todos) {
    els.todoList.appendChild(createTodoManageRow(todo));
  }
}

function renderAssistantInbox(items) {
  const seen = new Set();
  const soon = filteredItems(items)
    .filter((item) => item.status !== "done")
    .filter((item) => item.date)
    .filter((item) => item.date >= state.todayDate)
    .sort(compareItems)
    .filter((item) => {
      const key = `${item.kind}:${item.date}:${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  els.assistantInbox.innerHTML = "";
  if (!soon.length) {
    els.assistantInbox.innerHTML = '<div class="empty-row">暂无待处理事项</div>';
    return;
  }
  for (const item of soon) {
    const row = document.createElement("div");
    row.className = "rail-item";
    row.innerHTML = `
      <i class="category-dot" style="background:${categoryFor(item).color}"></i>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <span>${item.date} · ${categoryFor(item).label}</span>
      </div>
    `;
    els.assistantInbox.appendChild(row);
  }
}

function renderAgentStatus() {
  if (!els.agentStatus) return;
  const status = state.agentStatus;
  if (!status) {
    els.agentStatus.innerHTML = '<div class="empty-row small">后端状态未连接</div>';
    return;
  }
  const modules = status.modules || {};
  const model = status.model || {};
  els.agentStatus.innerHTML = `
    <div class="agent-kpis">
      <span><strong>${modules.tools ?? 0}</strong> 工具</span>
      <span><strong>${modules.connectors ?? 0}</strong> 连接器</span>
      <span><strong>${modules.auditEntries ?? 0}</strong> 日志</span>
    </div>
    <div class="agent-mode">
      <strong>${escapeHtml(model.provider || "model")}</strong>
      <span>${escapeHtml(model.mode || "local")}</span>
    </div>
    <div class="agent-pipeline">
      ${(status.pipeline || []).map((item) => `<span>${escapeHtml(stageLabel(item))}</span>`).join("")}
    </div>
  `;
}

function renderHistory(items) {
  const category = CATEGORIES.find((item) => item.id === state.selectedCategory);
  const history = filteredItems(items)
    .slice()
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, 14);
  els.historyTitle.textContent = category ? `${category.label}历史` : "全部历史";
  els.historyList.innerHTML = history.length
    ? history
        .map(
          (item) => `
            <div class="history-item">
              <i class="category-dot" style="background:${categoryFor(item).color}"></i>
              <span>${escapeHtml(item.title)}</span>
              <small>${item.date || "未定"}</small>
            </div>
          `
        )
        .join("")
    : '<div class="empty-row small">暂无历史</div>';
}

function renderProfile() {
  const user = state.currentUser;
  if (!user) return;
  els.profileName.textContent = user.displayName || "用户中心";
  els.profileMeta.textContent = [roleLabel(user.familyRole), user.birthday ? `${calculateAge(user.birthday)} 岁` : "", user.isAdult ? "18 岁以上" : "未满 18 岁"]
    .filter(Boolean)
    .join(" · ");
  els.profileDisplayName.value = user.displayName || "";
  els.profileLoginId.value = user.loginId || "";
  els.profileRole.value = user.familyRole || "adult";
  els.profileGender.value = user.gender || "unknown";
  els.profileIsAdult.value = String(Boolean(user.isAdult));
  els.profileNickname.value = user.nickname || "";
  els.profileBirthday.value = user.birthday || "";
  els.profileReminderStyle.value = user.reminderStyle || "app";
  els.profileDefaultReminderTime.value = user.defaultReminderTime || "";
  setCheckedValues("profileContactChannel", user.contactChannels || ["app"]);
  els.profileHomeAddress.value = user.addresses?.home || "";
  els.profileCompanyAddress.value = user.addresses?.company || "";
  els.profileSchoolAddress.value = user.addresses?.school || "";
  els.profileInterests.value = listText(user.preferences?.interests);
  els.profileFoodPreferences.value = listText(user.preferences?.foodPreferences);
  els.profileAllergies.value = listText(user.preferences?.allergies);
  els.profileDislikes.value = listText(user.preferences?.dislikes);
  els.profileAiNotes.value = user.aiNotes || "";
}

function renderLearning() {
  if (!els.learningPage) return;
  const settings = state.learning.settings || {};
  els.learningEnabled.checked = settings.enabled !== false;
  els.learningReviewEnabled.checked = Boolean(settings.reviewEnabled);

  const candidates = state.learning.candidates || [];
  els.learningCandidates.innerHTML = candidates.length
    ? candidates.map((candidate) => {
        const actions = candidate.status === "candidate"
          ? `<button class="text-button learning-action" data-learning-action="approve" data-learning-id="${escapeHtml(candidate.id)}">批准</button>
             <button class="text-button learning-action" data-learning-action="reject" data-learning-id="${escapeHtml(candidate.id)}">拒绝</button>`
          : candidate.status === "active"
            ? `<button class="text-button learning-action" data-learning-action="rollback" data-learning-id="${escapeHtml(candidate.id)}">回滚</button>`
            : `<span class="learning-status">${escapeHtml(candidate.status)}</span>`;
        return `<article class="learning-row"><strong>${escapeHtml(candidate.title)}</strong><p>${escapeHtml(candidate.reason)}</p><small>证据 ${candidate.evidenceCount || 0} 次 · ${escapeHtml(candidate.status)}</small><div>${actions}</div></article>`;
      }).join("")
    : '<div class="empty-row">暂无候选规则</div>';
  els.learningCandidates.querySelectorAll("[data-learning-action]").forEach((button) => {
    button.addEventListener("click", () => reviewLearningCandidate(button.dataset.learningId, button.dataset.learningAction));
  });

  const memories = state.learning.memories || [];
  els.learningMemories.innerHTML = memories.length
    ? memories.map((memory) => `<article class="learning-row"><strong>${escapeHtml(memory.key)}</strong><p>${escapeHtml(formatMemoryValue(memory.value))}</p><small>${escapeHtml(memory.type)} · ${escapeHtml(memory.source)}</small><button class="text-button learning-delete" data-learning-memory-id="${escapeHtml(memory.id)}">删除</button></article>`).join("")
    : '<div class="empty-row">暂无已保存记忆</div>';
  els.learningMemories.querySelectorAll("[data-learning-memory-id]").forEach((button) => {
    button.addEventListener("click", () => deleteLearningMemory(button.dataset.learningMemoryId));
  });
}

function formatMemoryValue(value) {
  if (Array.isArray(value)) return value.join("、");
  if (value && typeof value === "object") return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join("；");
  return String(value ?? "");
}

async function updateLearningSettings() {
  try {
    const data = await api("/api/learning/settings", {
      method: "PATCH",
      body: JSON.stringify({
        enabled: els.learningEnabled.checked,
        reviewEnabled: els.learningReviewEnabled.checked,
      }),
    });
    state.learning.settings = data.settings;
    els.learningMessage.textContent = "设置已保存";
    render();
  } catch (error) {
    els.learningMessage.textContent = error.message;
  }
}

async function runLearningReview() {
  els.runLearningReview.disabled = true;
  els.learningMessage.textContent = "processing...";
  try {
    const data = await api("/api/learning/review/run", { method: "POST" });
    els.learningMessage.textContent = data.result.status === "completed" ? `分析完成，生成 ${data.result.candidates.length} 条候选规则` : "本次未运行";
    await loadLearning();
    render();
  } catch (error) {
    els.learningMessage.textContent = error.message;
  } finally {
    els.runLearningReview.disabled = false;
  }
}

async function reviewLearningCandidate(id, action) {
  try {
    await api("/api/learning/review", { method: "POST", body: JSON.stringify({ id, action }) });
    await loadLearning();
    render();
  } catch (error) {
    els.learningMessage.textContent = error.message;
  }
}

async function deleteLearningMemory(id) {
  try {
    await api(`/api/learning/memories/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadLearning();
    render();
  } catch (error) {
    els.learningMessage.textContent = error.message;
  }
}

async function clearLearningMemory() {
  if (!window.confirm("确定清除当前账号的已保存记忆吗？")) return;
  try {
    await api("/api/learning/memories", { method: "DELETE" });
    await loadLearning();
    els.learningMessage.textContent = "记忆已清除";
    render();
  } catch (error) {
    els.learningMessage.textContent = error.message;
  }
}

function renderCategoryControls() {
  const options = [{ id: "all", label: "全部", color: "#9b9b9e" }, ...CATEGORIES];
  els.tagChips.innerHTML = "";
  els.filterOptions.innerHTML = "";
  for (const option of options) {
    const chip = document.createElement("button");
    chip.className = `tag-chip ${state.selectedCategory === option.id ? "active" : ""}`;
    chip.innerHTML = `<i class="category-dot" style="background:${option.color}"></i><span>${option.label}</span>`;
    chip.addEventListener("click", () => setCategory(option.id));
    els.tagChips.appendChild(chip);

    const filter = document.createElement("button");
    filter.className = `filter-option ${state.selectedCategory === option.id ? "active" : ""}`;
    filter.innerHTML = `<i class="category-dot" style="background:${option.color}"></i><span>${option.label}</span>`;
    filter.addEventListener("click", () => setCategory(option.id));
    els.filterOptions.appendChild(filter);
  }
}

function createDaySection(title, items, rowFactory) {
  const section = document.createElement("section");
  section.className = "archive-section";
  section.innerHTML = `<h3>${title}</h3>`;
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-row";
    empty.textContent = "没有记录";
    section.appendChild(empty);
    return section;
  }
  for (const item of items) section.appendChild(rowFactory(item));
  return section;
}

function createDaySummary(all, events, todos) {
  const doneCount = todos.filter((item) => item.status === "done").length;
  const openCount = todos.length - doneCount;
  const nextAlarm = todos
    .filter((item) => item.status !== "done" && item.alarmAt)
    .sort((a, b) => String(a.alarmAt).localeCompare(String(b.alarmAt)))[0];
  const section = document.createElement("section");
  section.className = "day-summary";
  section.innerHTML = `
    <div>
      <span>登记信息</span>
      <strong>${all.length}</strong>
    </div>
    <div>
      <span>家庭事件</span>
      <strong>${events.length}</strong>
    </div>
    <div>
      <span>待完成</span>
      <strong>${openCount}</strong>
    </div>
    <div>
      <span>已完成</span>
      <strong>${doneCount}</strong>
    </div>
    <p>${nextAlarm ? `最近提醒：${escapeHtml(nextAlarm.title)} · ${countdownText(nextAlarm.alarmAt)}` : "当天没有单项倒计时提醒"}</p>
  `;
  return section;
}

function createEventRow(item) {
  const row = document.createElement("div");
  row.className = "archive-row";
  row.innerHTML = `
    <i class="category-dot" style="background:${categoryFor(item).color}"></i>
    <div>
      <strong>${escapeHtml(item.title)}</strong>
      <span>${categoryFor(item).label}${item.recipients?.length ? ` · 提醒 ${escapeHtml(item.recipients.join(", "))}` : ""}</span>
    </div>
    <em>${item.private ? "私密" : "事件"}</em>
  `;
  return row;
}

function createTodoArchiveRow(item) {
  const row = document.createElement("div");
  row.className = `archive-row ${item.status === "done" ? "done" : ""}`;
  row.innerHTML = `
    <button class="check-button" aria-label="完成"></button>
    <div>
      <strong>${escapeHtml(item.title)}</strong>
      <span>${categoryFor(item).label}${item.assignee ? ` · ${escapeHtml(item.assignee)}` : ""}${item.alarmAt ? ` · ${countdownText(item.alarmAt)}` : ""}</span>
    </div>
    <em>${item.status === "done" ? "已完成" : "待办"}</em>
  `;
  row.querySelector(".check-button").addEventListener("click", () => completeTodo(item));
  return row;
}

function createTodoManageRow(todo) {
  const row = document.createElement("div");
  row.className = `todo-item ${todo.status === "done" ? "done" : ""}`;
  row.innerHTML = `
    <button class="check-button" aria-label="完成"></button>
    <div class="todo-main">
      <div class="todo-title"><i class="category-dot" style="background:${categoryFor(todo).color}"></i>${escapeHtml(todo.title)}</div>
      <div class="todo-meta">${todo.date || "未定日期"} · ${categoryFor(todo).label}${todo.assignee ? ` · ${escapeHtml(todo.assignee)}` : ""}</div>
      <div class="alarm-line">${todo.alarmAt ? countdownText(todo.alarmAt) : "未设置单项提醒"} · 24 小时提醒已启用</div>
    </div>
    <div class="todo-actions">
      <button class="icon-button alarm" title="设置提醒">⏱</button>
      <button class="icon-button delete" title="删除">⌫</button>
    </div>
  `;
  row.querySelector(".check-button").addEventListener("click", () => completeTodo(todo));
  row.querySelector(".delete").addEventListener("click", () => deleteTodo(todo));
  row.querySelector(".alarm").addEventListener("click", () => setAlarm(todo));
  return row;
}

function setPage(page, options = {}) {
  if (!validPage(page)) return;
  state.activePage = page;
  if (page === "calendar" && !options.keepCalendarView) state.calendarView = "month";
  if (!options.silent) location.hash = page;
  document.querySelector(".main").scrollTop = 0;
  renderActivePage();
}

function setCategory(category) {
  state.selectedCategory = category;
  renderCategoryControls();
  render();
}

function handleAddAction() {
  if (state.activePage === "todos") {
    showTodoForm();
    return;
  }
  setPage("assistant");
  els.chatInput.focus();
}

function showTodoForm() {
  els.todoModal.hidden = false;
  els.todoTitle.focus();
}

function hideTodoForm() {
  els.todoTitle.value = "";
  els.todoAlarm.value = "";
  els.todoModal.hidden = true;
}

function changeMonth(offset) {
  state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + offset, 1);
  render();
}

function allItems() {
  const plan = state.snapshot?.plan || { events: [], tasks: [], shopping: [] };
  return [
    ...plan.events.map((event) => ({
      id: event.id,
      kind: "event",
      title: event.title,
      date: event.date,
      category: event.private ? "private" : inferCategory(event.title, "event"),
      recipients: event.recipients || [],
      participants: event.participants || [],
      private: Boolean(event.private),
      seriesId: event.seriesId || null,
      isOccurrence: Boolean(event.isOccurrence),
      recurrence: event.recurrence || null,
      status: "open",
      createdAt: event.createdAt,
    })),
    ...plan.tasks.map((task) => ({
      id: task.id,
      kind: "task",
      title: task.title,
      date: task.dueDate,
      category: "todo",
      assignee: task.assignee,
      alarmAt: task.alarmAt,
      reminderDueAt: task.alarmAt || (task.dueDate ? `${task.dueDate}T09:00:00` : null),
      status: task.status,
      completedAt: task.completedAt,
      createdAt: task.createdAt,
    })),
    ...plan.shopping.map((item) => ({
      id: item.id,
      kind: "shopping",
      title: item.item,
      date: item.dueDate,
      category: "shopping",
      assignee: item.assignee,
      alarmAt: item.alarmAt,
      reminderDueAt: item.alarmAt || (item.dueDate ? `${item.dueDate}T09:00:00` : null),
      status: item.status,
      completedAt: item.completedAt,
      createdAt: item.createdAt,
    })),
  ].filter((item) => item.title);
}

function filteredItems(items) {
  return items.filter((item) => {
    if (state.selectedCategory !== "all" && item.category !== state.selectedCategory) return false;
    return matchesSearch(item);
  });
}

function matchesSearch(item) {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) return true;
  return [item.title, item.assignee, item.date, categoryFor(item).label].filter(Boolean).join(" ").toLowerCase().includes(query);
}

function isTodo(item) {
  return item.kind === "task" || item.kind === "shopping";
}

function isTodayTodo(item) {
  return isTodo(item) && (item.date === state.todayDate || !item.date);
}

function isItemOnDate(item, isoDate) {
  if (item.date === isoDate) return true;
  if (isTodo(item) && item.completedAt && toIsoDate(new Date(item.completedAt)) === isoDate) return true;
  return false;
}

function isOverdue(item) {
  return isTodo(item) && item.status !== "done" && item.date && item.date < toIsoDate(new Date());
}

function compareItems(a, b) {
  const overdueCompare = Number(!isOverdue(a)) - Number(!isOverdue(b));
  if (overdueCompare) return overdueCompare;
  const doneCompare = Number(a.status === "done") - Number(b.status === "done");
  if (doneCompare) return doneCompare;
  const dateCompare = String(a.date || "9999-12-31").localeCompare(String(b.date || "9999-12-31"));
  if (dateCompare) return dateCompare;
  const alarmCompare = String(a.alarmAt || "9999-12-31").localeCompare(String(b.alarmAt || "9999-12-31"));
  if (alarmCompare) return alarmCompare;
  return kindWeight(a.kind) - kindWeight(b.kind);
}

function compareTodayTodos(a, b) {
  const alarmCompare = String(a.alarmAt || "9999-12-31").localeCompare(String(b.alarmAt || "9999-12-31"));
  if (alarmCompare) return alarmCompare;
  const createdCompare = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  if (createdCompare) return createdCompare;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

function refreshTodayDate() {
  const latestToday = toIsoDate(new Date());
  if (latestToday === state.todayDate) return;
  state.todayDate = latestToday;
}

function checkAlarms() {
  if (!state.snapshot) return;
  const now = Date.now();
  for (const item of allItems().filter((entry) => entry.status !== "done")) {
    const dueAt = reminderDueTime(item);
    if (!Number.isFinite(dueAt)) continue;
    fireReminderWhenDue(`${item.id}:24h`, dueAt - DAY_MS, item, "提前 24 小时提醒", now, { urgent: false });
    fireReminderWhenDue(`${item.id}:12h`, dueAt - TWELVE_HOURS_MS, item, "提前 12 小时提醒", now, { urgent: false });
    fireReminderWhenDue(`${item.id}:alarm`, dueAt, item, "闹钟提醒", now, { urgent: true });
  }
}

function fireReminderWhenDue(key, time, item, label, now, options = {}) {
  const alarmTime = typeof time === "number" ? time : new Date(time).getTime();
  const graceMs = options.urgent ? ALARM_GRACE_MS : ADVANCE_REMINDER_GRACE_MS;
  if (!Number.isFinite(alarmTime) || now < alarmTime || now - alarmTime > graceMs || state.firedAlarms.has(key)) return;
  state.firedAlarms.add(key);
  localStorage.setItem("familyOpsFiredAlarms", JSON.stringify([...state.firedAlarms]));
  const message = `${label}: ${item.title}`;
  addBubble("agent", message);
  notifyUser({ item, label, message, urgent: Boolean(options.urgent), alarmTime });
}

function reminderDueTime(item) {
  if (item.alarmAt) return new Date(item.alarmAt).getTime();
  if (item.date) return new Date(`${item.date}T09:00:00`).getTime();
  return Number.NaN;
}

async function enableReminders() {
  state.remindersEnabled = true;
  localStorage.setItem("familyOpsRemindersEnabled", "true");
  ensureAudioContext();
  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }
  updateNotificationButton();
  addBubble("agent", notificationPermissionGranted() ? "提醒已开启，会在 24 小时、12 小时和到点时提醒。" : "App 内提醒已开启。浏览器系统通知需要在权限弹窗中允许。");
  checkAlarms();
}

function updateNotificationButton() {
  const enabled = state.remindersEnabled;
  const granted = notificationPermissionGranted();
  els.notificationButton.classList.toggle("active", enabled);
  els.notificationButton.title = granted ? "提醒已开启" : "开启提醒";
  els.notificationButton.setAttribute("aria-label", granted ? "提醒已开启" : "开启提醒");
}

function notifyUser({ item, label, message, urgent, alarmTime }) {
  if (state.remindersEnabled && notificationPermissionGranted()) {
    try {
      new Notification("FamilyOps", {
        body: message,
        tag: `${item.id}:${label}`,
        requireInteraction: urgent,
      });
    } catch {
      addBubble("agent", "浏览器系统通知没有成功显示，但 App 内提醒已触发。");
    }
  }
  if (urgent) {
    showAlarmModal({ item, label, alarmTime });
    playAlarmSound();
    vibrateDevice();
  } else if (state.remindersEnabled) {
    playSoftReminderSound();
  }
}

function showAlarmModal({ item, label, alarmTime }) {
  state.activeAlarm = { item, label, alarmTime };
  els.alarmMeta.textContent = `${label} · ${formatDateTime(alarmTime)}`;
  els.alarmTitle.textContent = item.title;
  els.alarmBody.textContent = `${categoryFor(item).label}${item.assignee ? ` · ${item.assignee}` : ""}`;
  els.alarmComplete.hidden = !isTodo(item);
  els.alarmOverlay.hidden = false;
}

function dismissAlarm() {
  state.activeAlarm = null;
  els.alarmOverlay.hidden = true;
}

function snoozeAlarm() {
  const active = state.activeAlarm;
  if (!active) return;
  dismissAlarm();
  window.setTimeout(() => {
    showAlarmModal(active);
    playAlarmSound();
    vibrateDevice();
  }, 10 * 60 * 1000);
  addBubble("agent", `已延后 10 分钟提醒: ${active.item.title}`);
  recordLearningFeedback("reminder_snoozed", active.item.id, {
    reminderBucket: active.label || "alarm",
    category: categoryFor(active.item).id,
    kind: active.item.kind,
  });
}

async function completeActiveAlarm() {
  const active = state.activeAlarm;
  if (!active || !isTodo(active.item)) {
    dismissAlarm();
    return;
  }
  await completeTodo(active.item);
  dismissAlarm();
}

function notificationPermissionGranted() {
  return "Notification" in window && Notification.permission === "granted";
}

function ensureAudioContext() {
  if (state.audioContext) return state.audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  state.audioContext = new AudioContextClass();
  return state.audioContext;
}

function playSoftReminderSound() {
  playToneSequence([660], 0.08, 0.03);
}

function playAlarmSound() {
  playToneSequence([740, 880, 740], 0.18, 0.08);
}

function playToneSequence(frequencies, durationSeconds, gapSeconds) {
  const context = ensureAudioContext();
  if (!context) return;
  if (context.state === "suspended") context.resume().catch(() => {});
  const start = context.currentTime + 0.02;
  frequencies.forEach((frequency, index) => {
    const toneStart = start + index * (durationSeconds + gapSeconds);
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.08, toneStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + durationSeconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneStart + durationSeconds + 0.03);
  });
}

function vibrateDevice() {
  if ("vibrate" in navigator) {
    navigator.vibrate([350, 120, 350, 120, 500]);
  }
}

async function api(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(state.authToken ? { Authorization: `Bearer ${state.authToken}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("登录服务响应超时，请确认本地服务正在运行");
    throw new Error("无法连接登录服务，请确认本地服务正在运行");
  } finally {
    clearTimeout(timeout);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`服务返回无效内容（HTTP ${response.status}）`);
  }
  if (!response.ok || data.ok === false) throw new Error(data.error || "Request failed");
  return data;
}

function addBubble(type, text) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${type}`;
  bubble.textContent = text;
  els.chatMessages.appendChild(bubble);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return bubble;
}

function renderAgentTurnReply(bubble, result = {}) {
  const turn = result.agentTurn || {};
  const appliedLines = summarizeAppliedActions(turn.execution?.output?.applied || []);
  if (!appliedLines.length) {
    bubble.className = "bubble agent";
    bubble.textContent = "";
    const message = document.createElement("div");
    message.className = "bubble-main";
    message.textContent = formatAgentTurnReply(result);
    bubble.appendChild(message);
    const suggestionList = turn.suggestions?.output?.suggestions || [];
    if (suggestionList.length) bubble.appendChild(renderSuggestionCards(suggestionList, { eventId: findAppliedEventId(turn) }));
    if (turn.stages?.length) bubble.appendChild(renderPipelineTrace(turn));
    return;
  }

  bubble.className = "bubble agent action-bubble";
  bubble.textContent = "";

  const message = document.createElement("div");
  message.className = "bubble-main";
  message.textContent = "已记录 是否开启提示";
  bubble.appendChild(message);

  const details = document.createElement("div");
  details.className = "bubble-detail";
  details.textContent = appliedLines.join("\n");
  bubble.appendChild(details);

  const suggestionList = turn.suggestions?.output?.suggestions || [];
  if (suggestionList.length) {
    bubble.appendChild(renderSuggestionCards(suggestionList, { eventId: findAppliedEventId(turn) }));
  }

  if (turn.stages?.length) {
    bubble.appendChild(renderPipelineTrace(turn));
  }

  const action = document.createElement("button");
  action.type = "button";
  action.className = "bubble-action";
  action.textContent = state.remindersEnabled ? "提示已开启" : "开启提示";
  action.addEventListener("click", async () => {
    action.disabled = true;
    action.textContent = "正在开启...";
    await enableReminders();
    checkAlarms();
    action.textContent = "提示已开启";
  });
  bubble.appendChild(action);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function renderPipelineTrace(turn) {
  const wrap = document.createElement("details");
  wrap.className = "pipeline-trace";
  const summary = document.createElement("summary");
  summary.textContent = "查看 Agent 执行架构";
  wrap.appendChild(summary);

  const list = document.createElement("div");
  list.className = "pipeline-list";
  for (const item of turn.stages || []) {
    const row = document.createElement("div");
    row.className = `pipeline-row ${item.status || ""}`;
    row.innerHTML = `
      <span>${escapeHtml(stageLabel(item.name))}</span>
      <strong>${escapeHtml(item.status || "unknown")}</strong>
    `;
    list.appendChild(row);
  }
  wrap.appendChild(list);
  return wrap;
}

function findAppliedEventId(turn) {
  const applied = turn.execution?.output?.applied || [];
  const eventAction = applied.find((action) => action.type === "event" && action.event?.id);
  return eventAction ? eventAction.event.id : null;
}

function familyMemberNames() {
  const names = (state.snapshot?.plan?.members || []).map((member) => member.name).filter(Boolean);
  return [...new Set(names)];
}

function renderRecipientEditor(suggestion, context = {}) {
  const wrap = document.createElement("div");
  wrap.className = "suggestion-meta recipient-editor";
  const recipients = [...(suggestion.recipients || [])];
  const excluded = new Set(suggestion.excludedMembers || []);

  const label = document.createElement("span");
  label.className = "recipient-label";
  label.textContent = "推送对象：";
  wrap.appendChild(label);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "recipient-add";
  addButton.textContent = "+";
  addButton.title = "添加推送对象";
  addButton.setAttribute("aria-label", "添加推送对象");
  wrap.appendChild(addButton);

  const chips = document.createElement("span");
  chips.className = "recipient-chips";
  wrap.appendChild(chips);

  const menu = document.createElement("div");
  menu.className = "recipient-menu";
  menu.hidden = true;
  wrap.appendChild(menu);

  const status = document.createElement("small");
  status.className = "recipient-status";
  wrap.appendChild(status);

  async function save() {
    suggestion.recipients = [...recipients];
    if (!context.eventId) return;
    status.textContent = "保存中...";
    try {
      const data = await api(`/api/family/events/${encodeURIComponent(context.eventId)}/recipients`, {
        method: "PATCH",
        body: JSON.stringify({ recipients }),
      });
      if (data.plan) {
        state.snapshot = { ...(state.snapshot || {}), plan: data.plan, reminders: data.reminders || state.snapshot?.reminders };
      }
      status.textContent = "已保存";
    } catch (error) {
      status.textContent = error.message || "保存失败";
    }
  }

  function renderChips() {
    chips.textContent = "";
    if (!recipients.length) {
      const empty = document.createElement("span");
      empty.className = "recipient-empty";
      empty.textContent = "暂无推送对象";
      chips.appendChild(empty);
    }
    for (const name of recipients) {
      const chip = document.createElement("span");
      chip.className = "recipient-chip";
      const text = document.createElement("span");
      text.textContent = name;
      text.setAttribute("data-no-i18n", "");
      chip.appendChild(text);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "recipient-remove";
      remove.textContent = "×";
      remove.title = `移除 ${name}`;
      remove.setAttribute("aria-label", `移除 ${name}`);
      remove.addEventListener("click", () => {
        const index = recipients.indexOf(name);
        if (index !== -1) recipients.splice(index, 1);
        renderChips();
        save();
      });
      chip.appendChild(remove);
      chips.appendChild(chip);
    }
  }

  function renderMenu() {
    menu.textContent = "";
    const options = familyMemberNames().filter((name) => !recipients.includes(name));
    if (!options.length) {
      const none = document.createElement("span");
      none.className = "recipient-empty";
      none.textContent = "所有家庭成员都已在推送对象中";
      menu.appendChild(none);
      return;
    }
    for (const name of options) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "recipient-option";
      const blocked = excluded.has(name);
      option.disabled = blocked;
      option.textContent = blocked ? `${name}（惊喜对象，不能添加）` : name;
      option.addEventListener("click", () => {
        if (blocked) return;
        recipients.push(name);
        menu.hidden = true;
        renderChips();
        save();
      });
      menu.appendChild(option);
    }
  }

  addButton.addEventListener("click", () => {
    if (menu.hidden) renderMenu();
    menu.hidden = !menu.hidden;
  });

  renderChips();
  return wrap;
}

function renderSuggestionCards(suggestions, context = {}) {
  const wrap = document.createElement("div");
  wrap.className = "suggestion-cards";
  for (const suggestion of suggestions) {
    const card = document.createElement("div");
    card.className = "suggestion-card";

    const title = document.createElement("strong");
    title.textContent = suggestion.title || "智能推送";
    card.appendChild(title);

    const note = document.createElement("p");
    note.textContent = suggestion.note || "已根据家庭资料生成推荐。";
    card.appendChild(note);

    card.appendChild(renderRecipientEditor(suggestion, context));

    const links = document.createElement("div");
    links.className = "suggestion-links";
    for (const link of suggestion.links || []) {
      const anchor = document.createElement("a");
      anchor.href = link.url;
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
      anchor.textContent = link.label;
      anchor.addEventListener("click", () => {
        recordLearningFeedback("recommendation_clicked", link.url, {
          recommendationType: suggestion.category || suggestion.type || link.label,
          category: suggestion.category || suggestion.type || "suggestion",
        });
      });
      links.appendChild(anchor);
    }
    card.appendChild(links);
    wrap.appendChild(card);
  }
  return wrap;
}

async function recordLearningFeedback(type, targetId, metadata = {}) {
  try {
    await api("/api/learning/feedback", {
      method: "POST",
      body: JSON.stringify({ type, targetId, metadata }),
    });
  } catch {
    // Learning feedback is optional and must never block a family action.
  }
}

function formatAgentTurnReply(result = {}) {
  const turn = result.agentTurn || {};
  const appliedLines = summarizeAppliedActions(turn.execution?.output?.applied || []);
  const skippedLines = summarizeSkippedActions(turn.execution?.output?.skipped || []);
  if (appliedLines.length) return "已记录 是否开启提示";
  const skipped = turn.execution?.output?.skipped || [];
  if (skippedLines.length && skipped.every((action) => String(action.reason || "").startsWith("duplicate"))) {
    return ["已存在相同事项，没有重复添加", ...skippedLines].join("\n");
  }
  if (skippedLines.length) return ["这次没有添加新事项", ...skippedLines].join("\n");
  return "没有识别出家庭事项，请换种说法";
}

function summarizeAppliedActions(actions) {
  return actions
    .map((action) => {
      if (action.type === "event" && action.event) {
        return `- 日历：${action.event.title}${action.event.date ? ` · ${action.event.date}` : ""}`;
      }
      if (action.type === "task" && action.task) {
        return `- Todo List：${action.task.title}${action.task.dueDate ? ` · ${action.task.dueDate}` : ""}`;
      }
      if (action.type === "shopping" && action.item) {
        return `- 购物：${action.item.item}${action.item.dueDate ? ` · ${action.item.dueDate}` : ""}`;
      }
      return null;
    })
    .filter(Boolean);
}

function summarizeSkippedActions(actions) {
  return actions
    .map((action) => {
      const title = action.item || action.title || action.existing?.title || action.existing?.item;
      const reasonLabel = {
        duplicate_event: "日历中已有",
        duplicate_shopping_item: "购物清单中已有",
        duplicate_task: "待办中已有",
      }[action.reason] || action.reason || "重复或未执行";
      return title ? `- ${title} · ${reasonLabel}` : null;
    })
    .filter(Boolean);
}

function simplifyAgentReport(report) {
  if (!report) return "已记录 是否开启提示";
  if (/^(已通过 agent 执行层处理|这次没有执行|事件：|Todo：|购物：)/m.test(report)) return report;
  const added = report
    .split("\n")
    .filter((line) => line.startsWith("- Event:") || line.startsWith("- Task:") || line.startsWith("- Shopping:"))
    .map((line) => line.replace("- Event:", "事件：").replace("- Task:", "Todo：").replace("- Shopping:", "购物：").trim());
  return added.length ? `已记录 是否开启提示\n${added.join("\n")}` : "记录失败，请重试";
}

function shouldIncludeWebResults(text) {
  return /生日|礼物|惊喜|推荐|搜索|检索|找|买什么|amazon|亚马逊|gift|birthday|surprise/i.test(text);
}

function categoryFor(item) {
  return CATEGORIES.find((category) => category.id === item.category) || CATEGORIES[1];
}

function inferCategory(title, fallback) {
  const text = String(title || "").toLowerCase();
  if (/milk|bread|buy|shop|购物|买|牛奶|面包/.test(text)) return "shopping";
  if (/school|homework|class|学校|作业|课程|考试/.test(text)) return "school";
  if (/doctor|dentist|health|gym|健身|医院|牙医|看病/.test(text)) return "health";
  if (/surprise|private|秘密|惊喜/.test(text)) return "private";
  if (/birthday|match|meeting|party|生日|比赛|会议|聚会/.test(text)) return "event";
  return fallback;
}

function kindWeight(kind) {
  if (kind === "task") return 0;
  if (kind === "shopping") return 1;
  if (kind === "event") return 2;
  return 3;
}

function validPage(page) {
  return ["assistant", "calendar", "todos", "learning", "profile"].includes(page) ? page : null;
}

function roleLabel(role) {
  return (
    {
      father: "父亲",
      mother: "母亲",
      child: "孩子",
      grandparent: "祖父母",
      adult: "成年人",
      minor: "未成年人",
      parent: "家长",
      guardian: "监护人",
    }[role] || "家庭成员"
  );
}

function stageLabel(stage) {
  return (
    {
      observe: "观察输入",
      recall: "读取记忆",
      think: "模型理解",
      plan: "制定计划",
      privacy: "隐私检查",
      execute: "执行工具",
      suggest: "智能推荐",
      remind: "提醒同步",
      todo_sync: "Todo 同步",
      failed: "执行失败",
    }[stage] || stage
  );
}

function calculateAge(birthday) {
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return "";
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday =
    today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return Math.max(0, age);
}

function userInitial(user) {
  const name = user?.nickname || user?.displayName || "U";
  return String(name).trim().slice(0, 1).toUpperCase();
}

function formatDateTitle(isoDate) {
  if (!isoDate) return "未定日期";
  const date = new Date(`${isoDate}T00:00:00`);
  return new Intl.DateTimeFormat(window.FAMILYOPS_LOCALE || "zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未定时间";
  return new Intl.DateTimeFormat(window.FAMILYOPS_LOCALE || "zh-CN", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toIsoDate(date) {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
}

function toDatetimeLocal(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function countdownText(value) {
  const diff = new Date(value).getTime() - Date.now();
  if (diff <= 0) return "提醒时间已到";
  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `${minutes} 分钟后提醒`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours} 小时后提醒`;
  return `${Math.ceil(hours / 24)} 天后提醒`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
