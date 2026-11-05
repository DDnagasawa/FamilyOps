/*
 * FamilyOps UI language layer (English / Chinese).
 *
 * The App was written with Chinese UI strings. This module translates the rendered UI into
 * English without changing the data model or the backend: static text, text rendered later by
 * app.js and display strings returned by the server are translated as they enter the DOM.
 * The chosen language is stored in localStorage and switched with the small button in the
 * top-right corner (the page reloads so every view is rendered in one language).
 */
(function () {
  "use strict";

  var LANG_KEY = "familyOpsLang";
  var stored = null;
  try { stored = localStorage.getItem(LANG_KEY); } catch (e) { stored = null; }
  var browserZh = String(navigator.language || "").toLowerCase().indexOf("zh") === 0;
  var lang = stored === "en" || stored === "zh" ? stored : (browserZh ? "zh" : "en");

  window.FAMILYOPS_LANG = lang;
  window.FAMILYOPS_LOCALE = lang === "en" ? "en-GB" : "zh-CN";
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";

  var HAN = /[一-鿿]/;

  // Exact UI strings (trimmed).
  var DICT = {
    // auth
    "登录": "Log in",
    "登录或注册": "Log in or register",
    "注册": "Register",
    "邮箱或手机号 *": "Email or phone *",
    "密码 *": "Password *",
    "进入": "Log in",
    "登录中...": "Logging in...",
    "必填信息": "Required information",
    "姓名 *": "Name *",
    "家庭角色 *": "Family role *",
    "选择角色": "Select role",
    "父亲": "Father",
    "母亲": "Mother",
    "孩子": "Child",
    "祖父母": "Grandparent",
    "成年人": "Adult",
    "未成年人": "Minor",
    "家长": "Parent",
    "监护人": "Guardian",
    "家庭成员": "Family member",
    "性别（用于哥哥/姐姐等关系）": "Gender (used for brother / sister terms)",
    "未设置": "Not set",
    "男性": "Male",
    "女性": "Female",
    "是否 18 岁以上 *": "Aged 18 or over? *",
    "选择": "Select",
    "是": "Yes",
    "否": "No",
    "基础信息": "Basic information",
    "昵称 / 常用叫法": "Nickname / what the family calls you",
    "出生日期 *": "Date of birth *",
    "默认提醒方式": "Default reminder method",
    "App 内提醒": "In-app reminder",
    "浏览器通知": "Browser notification",
    "暂不开启": "Off for now",
    "默认提醒时间": "Default reminder time",
    "联系方式": "Contact channels",
    "手机": "Phone",
    "家庭账户联动": "Family account linking",
    "已有家庭码或邀请链接": "Existing family code or invite link",
    "输入 5 位家庭码，或粘贴邀请链接": "Enter a 5-digit family code or paste an invite link",
    "新家庭码": "New family code",
    "点击右侧生成": "Click 'Generate family code'",
    "邀请链接": "Invite link",
    "生成家庭码后显示": "Shown after a code is generated",
    "生成家庭码": "Generate family code",
    "想要家庭账户联动，请输入家庭码，或从邀请链接加入同一个家庭。": "To link family accounts, enter a family code or join the same family through an invite link.",
    "家庭码已生成，同一家庭使用同一个码。": "Family code generated. Everyone in the same family uses the same code.",
    "家庭码生成失败": "Could not generate a family code",
    "地址信息": "Addresses",
    "家庭地址": "Home address",
    "公司地址": "Work address",
    "学校地址": "School address",
    "偏好信息": "Preferences",
    "兴趣爱好": "Interests",
    "足球、画画、游戏、阅读": "Football, drawing, games, reading",
    "食物偏好": "Food preferences",
    "过敏信息": "Allergies",
    "不喜欢的东西": "Dislikes",
    "AI 备注": "Notes for the AI",
    "例如：主要负责接送、做饭、家庭日程": "e.g. mainly handles school runs, cooking and the family schedule",
    "创建账号": "Create account",
    "登录失败，请重试": "Login failed, please try again",
    "登录服务响应超时，请确认本地服务正在运行": "The login service timed out. Check that the local server is running.",
    "无法连接登录服务，请确认本地服务正在运行": "Cannot reach the login service. Check that the local server is running.",
    // shell / navigation
    "用户中心": "User centre",
    "搜索家庭事项": "Search family items",
    "主页面": "Main pages",
    "AI 对话": "AI Chat",
    "日历": "Calendar",
    "记忆与学习": "Memory & Learning",
    "家庭分类": "Categories",
    "＋ 新增 Todo": "＋ New Todo",
    "家庭事件和 Todo 归档": "Family events and Todo archive",
    "用一句话安排家庭事务": "Arrange family affairs in one sentence",
    "单独管理每一项待办": "Manage each to-do item",
    "可控的跨会话记忆和候选规则": "Controlled cross-session memory and candidate rules",
    "基础信息和提醒偏好": "Profile and reminder preferences",
    "开启提醒": "Turn on reminders",
    "提醒已开启": "Reminders on",
    "筛选分类": "Filter by category",
    "新增": "Add",
    "全部历史": "All history",
    "全部": "All",
    "暂无历史": "No history yet",
    "未定": "TBC",
    // categories
    "家庭事件": "Family events",
    "购物": "Shopping",
    "学校": "School",
    "健康": "Health",
    "惊喜/私密": "Surprise / private",
    // assistant
    "告诉我家庭安排": "Tell me your family plans",
    "输入一句普通话，FamilyOps 会自动写入日历和 Todo。": "Type one everyday sentence and FamilyOps writes it into the calendar and Todo List.",
    "例如：明天晚上 8 点提醒我健身；周六 Lisa 足球比赛；John 明天买牛奶": "e.g. Lisa football match on 2026-11-19; John buy milk tomorrow; remind me to go to the gym at 8pm",
    "你可以直接输入：今天我要去健身；明天提醒 John 买牛奶；周六 Lisa 足球比赛。": "Try typing: Lisa football match on Saturday; remind John to buy milk tomorrow; surprise birthday party for Mrs Beecham.",
    "发送": "Send",
    "待处理": "Up next",
    "暂无待处理事项": "Nothing waiting",
    "已记录 是否开启提示": "Recorded. Turn on a reminder?",
    "记录失败，请重试": "Could not record that, please try again",
    "开启提示": "Turn on reminder",
    "提示已开启": "Reminder on",
    "正在开启...": "Turning on...",
    "查看 Agent 执行架构": "View agent execution trace",
    "智能推送": "Smart suggestion",
    "智能推荐": "Smart suggestions",
    "已根据家庭资料生成推荐。": "Suggestions generated from family profiles.",
    "已按惊喜事项处理，仅给适合参与准备的成年人家庭成员。": "Handled as a surprise: shared only with adult family members who can help prepare.",
    "已按惊喜事项处理，优先给成年人家庭成员。": "Handled as a surprise: shared with adult family members first.",
    "暂无合适对象": "no suitable recipient",
    "推送对象：": "Recipients:",
    "添加推送对象": "Add recipient",
    "暂无推送对象": "No recipients",
    "所有家庭成员都已在推送对象中": "All family members are already recipients",
    "保存中...": "Saving...",
    "保存失败": "Save failed",
    "Amazon 礼物搜索": "Amazon gift search",
    "同城生日餐厅": "Birthday restaurants nearby",
    "Google 礼物搜索": "Google gift search",
    "重复或未执行": "duplicate or not executed",
    "已存在相同事项，没有重复添加": "Already in the family plan, so it was not added again.",
    "这次没有添加新事项": "No new item was added this time.",
    "没有识别出家庭事项，请换种说法": "No family item was recognised. Please try rephrasing.",
    "日历中已有": "already in the calendar",
    "购物清单中已有": "already on the shopping list",
    "待办中已有": "already in the Todo List",
    "观察输入": "Observe input",
    "读取记忆": "Recall memory",
    "模型理解": "Model interpretation",
    "制定计划": "Plan",
    "隐私检查": "Privacy check",
    "执行工具": "Execute tools",
    "提醒同步": "Reminder sync",
    "Todo 同步": "Todo sync",
    "执行失败": "Failed",
    "已通过 agent 执行层处理。": "Handled by the agent execution layer.",
    "没有识别出新的家庭事项。": "No new family item was recognised.",
    "这次没有执行。": "Nothing was executed this time.",
    "我需要再确认一下。": "I need to check something first.",
    "确认前我没有写入 Todo 或日历。": "Nothing has been written to the Todo List or calendar yet.",
    "后端状态未连接": "Backend status not connected",
    "工具": "tools",
    "连接器": "connectors",
    "日志": "logs",
    // calendar
    "上个月": "Previous month",
    "下个月": "Next month",
    "今天": "Today",
    "当天事件和 Todo 完成情况": "Events and Todo progress for the day",
    "返回日历": "Back to calendar",
    "Todo List 归档": "Todo List archive",
    "没有记录": "No records",
    "登记信息": "Entries",
    "待完成": "To do",
    "已完成": "Done",
    "当天没有单项倒计时提醒": "No item reminders today",
    "私密": "Private",
    "事件": "Event",
    "待办": "To do",
    "未定日期": "No date",
    "未定时间": "No time set",
    // todo
    "今天还没有 Todo": "No Todos for today yet",
    "未设置单项提醒": "No item reminder",
    "24 小时提醒已启用": "24-hour reminder on",
    "设置提醒": "Set reminder",
    "删除": "Delete",
    "完成": "Done",
    "今日 Todo": "Today's Todo",
    "新增任务": "New task",
    "例如：今晚 8 点提醒我健身": "e.g. Remind me to go to the gym at 8pm tonight",
    "取消": "Cancel",
    "添加": "Add",
    "提醒时间已到": "Reminder due now",
    // reminders
    "提醒": "Reminder",
    "家庭事项提醒": "Family reminder",
    "该处理这件事了。": "Time to take care of this.",
    "10 分钟后": "In 10 minutes",
    "知道了": "Got it",
    "提前 24 小时提醒": "24-hour reminder",
    "提前 12 小时提醒": "12-hour reminder",
    "闹钟提醒": "Alarm",
    "提醒已开启，会在 24 小时、12 小时和到点时提醒。": "Reminders are on: you will be reminded 24 hours and 12 hours before, and when it is due.",
    "App 内提醒已开启。浏览器系统通知需要在权限弹窗中允许。": "In-app reminders are on. Allow browser notifications in the permission prompt.",
    "浏览器系统通知没有成功显示，但 App 内提醒已触发。": "The browser notification did not appear, but the in-app reminder fired.",
    // learning
    "只使用你的可控记忆。候选规则必须经过确认才会生效。": "Only memory you control is used. Candidate rules take effect only after you approve them.",
    "控制": "Controls",
    "保存个性化记忆": "Save personalised memory",
    "用于跨会话召回和更准确的安排": "Used for cross-session recall and more accurate planning",
    "后台自动 review": "Background review",
    "默认关闭；打开后也只生成候选，不会自动启用": "Off by default; when on it only creates candidates and never activates them",
    "现在分析一次": "Analyse now",
    "清除我的记忆": "Clear my memory",
    "待确认的学习规则": "Learning rules awaiting approval",
    "批准前不会改变推荐或自动执行行为。": "Recommendations and automatic actions do not change until you approve.",
    "已保存的记忆": "Saved memories",
    "你可以单独删除，也可以一次清除。": "Delete items one by one or clear them all.",
    "批准": "Approve",
    "拒绝": "Reject",
    "回滚": "Roll back",
    "暂无候选规则": "No candidate rules",
    "暂无已保存记忆": "No saved memories",
    "设置已保存": "Settings saved",
    "本次未运行": "Not run this time",
    "记忆已清除": "Memory cleared",
    "确定清除当前账号的已保存记忆吗？": "Clear all saved memories for this account?",
    // profile
    "管理 AI 需要知道的基础信息": "Manage the basic information the AI needs",
    "退出登录": "Log out",
    "用户基础信息": "Basic user information",
    "保存": "Save",
    "已保存": "Saved",
    "18 岁以上": "18 or over",
    "未满 18 岁": "Under 18",
    // surprise categories (server labels)
    "生日惊喜": "Birthday surprise",
    "纪念日惊喜": "Anniversary surprise",
    "礼物惊喜": "Gift surprise",
    "惊喜聚会": "Surprise party",
    "惊喜餐厅/约会": "Surprise meal / date",
    "惊喜出行/门票": "Surprise trip / tickets",
    "惊喜": "Surprise",
  };

  var WEEKDAY = { "一": "Monday", "二": "Tuesday", "三": "Wednesday", "四": "Thursday", "五": "Friday", "六": "Saturday", "日": "Sunday", "天": "Sunday" };

  function pl(n, one, many) { return n + " " + (String(n) === "1" ? one : many); }

  // Templated strings: [pattern, replacer(match groups...)]
  var RULES = [
    [/^(.+?) · (\d+) 个登记信息 · (\d+) 个 Todo 已完成$/, function (m, a, b, c) { return core(a) + " · " + pl(b, "entry", "entries") + " · " + pl(c, "Todo", "Todos") + " done"; }],
    [/^(.+?) · (\d+) 个事项 · (\d+) 个 Todo 已完成$/, function (m, a, b, c) { return core(a) + " · " + pl(b, "item", "items") + " · " + pl(c, "Todo", "Todos") + " done"; }],
    [/^(.+?) · (\d+) 个未完成 · (\d+)\/(\d+) 已完成$/, function (m, a, b, c, d) { return core(a) + " · " + b + " open · " + c + "/" + d + " done"; }],
    [/^(\d+) 个事件 · (\d+)\/(\d+) 个 Todo 已完成$/, function (m, a, b, c) { return pl(a, "event", "events") + " · " + b + "/" + c + " Todos done"; }],
    [/^本地服务没有连接：([\s\S]*)$/, function (m, a) { return "Local service not connected: " + a; }],
    [/^学习层未连接：([\s\S]*)$/, function (m, a) { return "Learning layer not connected: " + a; }],
    [/^服务返回无效内容（HTTP (\d+)）$/, function (m, a) { return "The server returned invalid content (HTTP " + a + ")"; }],
    [/^分析完成，生成 (\d+) 条候选规则$/, function (m, a) { return "Analysis complete: " + a + " candidate rule(s) created"; }],
    [/^证据 (\d+) 次$/, function (m, a) { return "Evidence: " + a + " time(s)"; }],
    [/^(\d+) 岁$/, function (m, a) { return a + " years old"; }],
    [/^最近提醒：([\s\S]*)$/, function (m, a) { return "Next reminder: " + core(a); }],
    [/^提醒 ([\s\S]+)$/, function (m, a) { return "Remind " + a; }],
    [/^(\d+) 分钟后提醒$/, function (m, a) { return "Reminder in " + a + " min"; }],
    [/^(\d+) 小时后提醒$/, function (m, a) { return "Reminder in " + a + " h"; }],
    [/^(\d+) 天后提醒$/, function (m, a) { return "Reminder in " + a + " day(s)"; }],
    [/^已延后 10 分钟提醒: ([\s\S]*)$/, function (m, a) { return "Snoozed for 10 minutes: " + a; }],
    [/^移除 ([\s\S]+)$/, function (m, a) { return "Remove " + a; }],
    [/^([\s\S]+)（惊喜对象，不能添加）$/, function (m, a) { return a + " (surprise target, cannot be added)"; }],
    [/^推送对象：([\s\S]*)$/, function (m, a) { return "Recipients: " + (a === "暂无合适对象" ? "no suitable recipient" : a.replace(/、/g, ", ")); }],
    [/^(?:- )?日历：([\s\S]*)$/, function (m, a) { return "- Calendar: " + a; }],
    [/^(?:- )?购物：([\s\S]*)$/, function (m, a) { return "- Shopping: " + a; }],
    [/^事件：([\s\S]*)$/, function (m, a) { return "Event: " + a; }],
    [/^Todo：([\s\S]*)$/, function (m, a) { return "Todo: " + a; }],
    [/^跳过重复项：(\d+) 个$/, function (m, a) { return "Skipped duplicates: " + a; }],
    [/^隐私处理：(\d+) 个事项已限制提醒对象。$/, function (m, a) { return "Privacy: recipients limited for " + a + " item(s)."; }],
    [/^原因：([\s\S]*)$/, function (m, a) { return "Reason: " + a; }],
    [/^需要审批：([\s\S]*)$/, function (m, a) { return "Approval required: " + a; }],
    [/^问题：([\s\S]*)$/, function (m, a) { return "Question: " + a; }],
    [/^每周(.)$/, function (m, a) { return WEEKDAY[a] ? "Every " + WEEKDAY[a] : m; }],
    [/^设置提醒时间，例如 ([\s\S]*)$/, function (m, a) { return "Set the reminder time, e.g. " + a; }],
    [/^([\s\S]*?)\s?(生日惊喜|纪念日惊喜|礼物惊喜|惊喜聚会|惊喜餐厅\/约会|惊喜出行\/门票|惊喜)智能推送$/, function (m, who, label) {
      var t = DICT[label] || label;
      return who ? who + " - " + t.toLowerCase() + " suggestions" : t + " suggestions";
    }],
    [/^(.+)历史$/, function (m, a) { return core(a) + " history"; }],
  ];

  function core(s) {
    if (!s || !HAN.test(s)) return s;
    if (Object.prototype.hasOwnProperty.call(DICT, s)) return DICT[s];
    if (s.indexOf("\n") !== -1) return s.split("\n").map(function (l) { return translate(l); }).join("\n");
    for (var i = 0; i < RULES.length; i++) {
      var m = s.match(RULES[i][0]);
      if (m) return RULES[i][1].apply(null, m);
    }
    if (s.indexOf(" · ") !== -1) return s.split(" · ").map(function (p) { return translate(p); }).join(" · ");
    return s;
  }

  function translate(s) {
    if (typeof s !== "string" || !HAN.test(s)) return s;
    var m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    return m[1] + core(m[2]) + m[3];
  }

  window.FamilyOpsI18n = { lang: lang, t: translate };

  if (lang !== "en") {
    document.addEventListener("DOMContentLoaded", addToggle);
    if (document.readyState !== "loading") addToggle();
    return;
  }

  // ---- English mode: translate the DOM and keep translating as app.js renders ----
  var ATTRS = ["placeholder", "title", "aria-label"];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1 };

  function skip(node) {
    var el = node.nodeType === 1 ? node : node.parentElement;
    while (el) {
      if (SKIP_TAGS[el.tagName] || el.hasAttribute("data-no-i18n")) return true;
      if (el.classList && el.classList.contains("bubble") && el.classList.contains("user")) return true;
      el = el.parentElement;
    }
    return false;
  }

  function translateText(node) {
    if (skip(node)) return;
    var next = translate(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function translateAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute && el.getAttribute(ATTRS[i]);
      if (v && HAN.test(v)) {
        var next = translate(v);
        if (next !== v) el.setAttribute(ATTRS[i], next);
      }
    }
    if (el.tagName === "TEXTAREA" && el.placeholder && HAN.test(el.placeholder)) el.placeholder = translate(el.placeholder);
  }

  function walk(root) {
    if (root.nodeType === 3) { translateText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    if (root.nodeType === 1) {
      translateAttrs(root);
      if (root.classList && root.classList.contains("weekday-row")) translateWeekdays(root);
    }
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) translateText(n);
      else {
        translateAttrs(n);
        if (n.classList && n.classList.contains("weekday-row")) translateWeekdays(n);
      }
    }
  }

  function translateWeekdays(row) {
    var names = { "一": "Mon", "二": "Tue", "三": "Wed", "四": "Thu", "五": "Fri", "六": "Sat", "日": "Sun" };
    var spans = row.querySelectorAll("span");
    for (var i = 0; i < spans.length; i++) {
      var t = spans[i].textContent.trim();
      if (names[t]) spans[i].textContent = names[t];
    }
  }

  // Native dialogs used by app.js
  var nativeConfirm = window.confirm.bind(window);
  var nativePrompt = window.prompt.bind(window);
  var nativeAlert = window.alert.bind(window);
  window.confirm = function (msg) { return nativeConfirm(translate(String(msg))); };
  window.prompt = function (msg, def) { return nativePrompt(translate(String(msg)), def); };
  window.alert = function (msg) { return nativeAlert(translate(String(msg))); };

  function start() {
    walk(document.body);
    var observer = new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var r = records[i];
        if (r.type === "characterData") translateText(r.target);
        else if (r.type === "attributes") translateAttrs(r.target);
        else for (var j = 0; j < r.addedNodes.length; j++) walk(r.addedNodes[j]);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    addToggle();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // ---- language toggle (top-right corner) ----
  function addToggle() {
    if (document.getElementById("langToggle")) return;
    var btn = document.createElement("button");
    btn.id = "langToggle";
    btn.type = "button";
    btn.className = "lang-toggle";
    btn.setAttribute("data-no-i18n", "");
    btn.textContent = lang === "en" ? "中" : "EN";
    btn.title = lang === "en" ? "切换到中文 (Switch to Chinese)" : "Switch to English (切换到英文)";
    btn.setAttribute("aria-label", btn.title);
    btn.addEventListener("click", function () {
      try { localStorage.setItem(LANG_KEY, lang === "en" ? "zh" : "en"); } catch (e) { /* ignore */ }
      window.location.reload();
    });
    document.body.appendChild(btn);
  }
})();
