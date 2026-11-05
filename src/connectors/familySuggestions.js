const BIRTHDAY_KEYWORDS = /birthday|生日|生辰|过生日/i;
const SECRET_KEYWORDS = /surprise|secret|do not tell|don't tell|不要告诉|别告诉|保密|秘密|惊喜/i;
import { resolveFamilyReferences } from "./familyMemberResolver.js";

// Daily surprise classes. Any matched class is private by default:
// the target person must be excluded from recommendation recipients.
const SURPRISE_EVENT_CATEGORIES = [
  {
    id: "birthday",
    label: "生日惊喜",
    pattern: /birthday|生日|生辰|过生日/i,
  },
  {
    id: "anniversary",
    label: "纪念日惊喜",
    pattern: /anniversary|纪念日|周年/i,
  },
  {
    id: "gift",
    label: "礼物惊喜",
    pattern: /gift|present|礼物|送礼|买什么/i,
  },
  {
    id: "surprise_party",
    label: "惊喜聚会",
    pattern: /surprise party|party|聚会|派对|惊喜聚餐|生日餐/i,
  },
  {
    id: "date_or_meal",
    label: "惊喜餐厅/约会",
    pattern: /restaurant|dinner|lunch|meal|餐厅|晚餐|午餐|约会/i,
  },
  {
    id: "trip_or_ticket",
    label: "惊喜出行/门票",
    pattern: /trip|travel|ticket|theme park|旅行|出行|门票|游乐园/i,
  },
];

export async function generateFamilySuggestions(input = {}) {
  const text = String(input.text || "").trim();
  const plan = input.familyPlan || {};
  const memory = input.memory || {};
  const actions = Array.isArray(input.actions) ? input.actions : [];
  const members = buildPeopleList({ planMembers: plan.members, familyUsers: input.familyUsers });
  const memberResolution = resolveFamilyReferences(text, {
    members,
    currentUser: input.currentUser || null,
  });
  const resolvedText = memberResolution.resolvedText || text;

  if (!shouldSuggest(text, actions)) {
    return {
      triggered: false,
      suggestions: [],
      privacy: null,
      report: "",
    };
  }

  const targetMember = findTargetMember({ text: resolvedText, members, actions });
  const surpriseCategory = classifySurpriseEvent({ text: resolvedText, actions });
  const privateMode =
    Boolean(surpriseCategory) ||
    SECRET_KEYWORDS.test(resolvedText) ||
    actions.some((action) => action.private || action.excludeMembers?.length);
  const excludedIdentityTokens = privateMode && targetMember ? collectIdentityTokens(targetMember) : [];
  const excludedPeople = privateMode && targetMember ? findMatchingPeopleByIdentity({ members, identityTokens: excludedIdentityTokens }) : [];
  const excludedMembers = excludedPeople.length ? excludedPeople.map((member) => member.name) : targetMember ? [targetMember.name] : [];
  const recipients = chooseSuggestionRecipients({ members, privateMode, excludedMembers, excludedIdentityTokens });
  const query = buildGiftQuery({ text: resolvedText, targetMember, memory });
  const restaurantQuery = buildRestaurantQuery({ targetMember, currentUser: input.currentUser });
  const links = buildQuickLinks({ giftQuery: query, restaurantQuery });
  const webResults = await safeWebSearch(input.searchWeb, restaurantQuery);

  const suggestion = {
    type: "birthday_recommendation",
    title: targetMember ? `${targetMember.name} ${surpriseCategory?.label || "惊喜"}智能推送` : `${surpriseCategory?.label || "惊喜"}智能推送`,
    surpriseCategory: surpriseCategory?.id || null,
    surpriseCategoryLabel: surpriseCategory?.label || "",
    targetMember: targetMember?.name || null,
    private: privateMode,
    excludedMembers,
    excludedIdentityTokens,
    recipients,
    query,
    restaurantQuery,
    links,
    webResults,
    note: targetMember
      ? "已按惊喜事项处理，仅给适合参与准备的成年人家庭成员。"
      : "已按惊喜事项处理，优先给成年人家庭成员。",
  };

  return {
    triggered: true,
    suggestions: [suggestion],
    privacy: {
      private: privateMode,
      excludedMembers,
      recipients,
    },
    report: formatSuggestionReport([suggestion]),
  };
}

export function formatSuggestionReport(suggestions = []) {
  if (!suggestions.length) return "";
  const lines = ["", "智能建议"];
  for (const suggestion of suggestions) {
    lines.push(`- ${suggestion.title}`);
    lines.push(`  推送对象: ${suggestion.recipients.length ? suggestion.recipients.join(", ") : "none"}`);
    if (suggestion.private) lines.push("  隐私: 惊喜内容仅给适合参与准备的人");
    lines.push(`  搜索词: ${suggestion.query}`);
    for (const link of suggestion.links.slice(0, 2)) {
      lines.push(`  ${link.label}: ${link.url}`);
    }
    for (const result of suggestion.webResults.slice(0, 3)) {
      lines.push(`  参考: ${result.title} - ${result.url}`);
    }
  }
  return lines.join("\n");
}

function shouldSuggest(text, actions) {
  return Boolean(classifySurpriseEvent({ text, actions }));
}

function isBirthdayRelated(text, actions = []) {
  if (BIRTHDAY_KEYWORDS.test(text)) return true;
  return actions.some((action) => BIRTHDAY_KEYWORDS.test(`${action.title || ""} ${action.item || ""} ${action.sourceText || ""}`));
}

function classifySurpriseEvent({ text, actions = [] }) {
  const combined = [
    text,
    ...actions.map((action) => [action.title, action.item, action.sourceText].filter(Boolean).join(" ")),
  ].join(" ");
  return SURPRISE_EVENT_CATEGORIES.find((category) => category.pattern.test(combined)) || null;
}

function buildPeopleList({ planMembers = [], familyUsers = [] }) {
  const people = new Map();
  const scopedPlanMembers = familyUsers.length
    ? planMembers.filter((member) => matchesFamilyUser(member, familyUsers))
    : planMembers;

  for (const member of Array.isArray(scopedPlanMembers) ? scopedPlanMembers : []) {
    if (!member?.name) continue;
    people.set(String(member.name).toLowerCase(), {
      id: member.id || String(member.name).toLowerCase(),
      name: member.name,
      role: normalizeRole(member.role),
      aliases: [...new Set([...(member.aliases || []), ...roleAliases(member.role)])],
      age: member.age ?? null,
      birthday: member.birthday || "",
      addresses: member.addresses || {},
      preferences: member.preferences || {},
    });
  }

  for (const user of Array.isArray(familyUsers) ? familyUsers : []) {
    if (!user?.displayName) continue;
    const key = String(user.displayName).toLowerCase();
    const existing = people.get(key) || {};
    people.set(key, {
      ...existing,
      id: user.id || existing.id || key,
      name: user.displayName,
      role: normalizeRole(user.familyRole || existing.role),
      aliases: [
        ...new Set([
          ...(existing.aliases || []),
          user.displayName,
          user.nickname,
          user.loginId,
          ...roleAliases(user.familyRole),
        ].filter(Boolean)),
      ],
      age: typeof user.age === "number" ? user.age : existing.age ?? null,
      birthday: user.birthday || existing.birthday || "",
      addresses: user.addresses || existing.addresses || {},
      preferences: user.preferences || existing.preferences || {},
      isAdult: Boolean(user.isAdult),
    });
  }

  return [...people.values()];
}

function matchesFamilyUser(member, familyUsers) {
  const memberTokens = [member?.id, member?.name, ...(member?.aliases || [])]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  return familyUsers.some((user) => {
    const userTokens = [user?.id, user?.displayName, user?.name, user?.nickname, user?.loginId]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase());
    return memberTokens.some((token) => userTokens.includes(token));
  });
}

function findTargetMember({ text, members, actions }) {
  const directTarget = findMemberInText({ text, members });
  if (directTarget) return directTarget;
  const actionText = actions
    .map((action) => [action.title, action.item, action.assignee, ...(action.participants || [])].filter(Boolean).join(" "))
    .join(" ");
  return findMemberInText({ text: actionText, members });
}

function findMemberInText({ text, members }) {
  const haystack = String(text || "").toLowerCase();
  return members.find((member) => {
    const names = [member.name, ...(member.aliases || [])].filter(Boolean);
    return names.some((name) => haystack.includes(String(name).toLowerCase()));
  });
}

function chooseSuggestionRecipients({ members, privateMode, excludedMembers, excludedIdentityTokens = [] }) {
  const excluded = new Set(excludedMembers.map(lowerText));
  const excludedTokens = new Set(excludedIdentityTokens.map(lowerText));
  return members
    .filter((member) => !excluded.has(lowerText(member.name)))
    .filter((member) => !hasIdentityOverlap(member, excludedTokens))
    .filter((member) => {
      if (!privateMode) return true;
      if (member.isAdult) return true;
      return ["parent", "adult", "father", "mother", "grandparent", "guardian"].includes(member.role);
    })
    .map((member) => member.name);
}

function lowerText(value) {
  return String(value || "").toLowerCase();
}

function collectIdentityTokens(member = {}) {
  return [
    member.id,
    member.name,
    member.nickname,
    member.loginId,
    ...(member.aliases || []),
  ]
    .filter(Boolean)
    .map(lowerText);
}

function findMatchingPeopleByIdentity({ members, identityTokens }) {
  const tokens = new Set(identityTokens.map(lowerText));
  return members.filter((member) => hasIdentityOverlap(member, tokens));
}

function hasIdentityOverlap(member = {}, identityTokens = new Set()) {
  if (!identityTokens.size) return false;
  return collectIdentityTokens(member).some((token) => identityTokens.has(token));
}

function buildGiftQuery({ text, targetMember, memory }) {
  const preferenceText = extractPreferenceText({ targetMember, memory });
  const target = targetMember?.name || "family member";
  const ageHint = typeof targetMember?.age === "number" ? `${targetMember.age} year old` : targetMember?.role === "child" ? "teen" : "adult";
  const base = `${ageHint} ${target} birthday gift ideas`;
  if (preferenceText) return `${base} ${preferenceText}`;
  const profilePreferences = [
    ...(targetMember?.preferences?.interests || []),
    ...(targetMember?.preferences?.foodPreferences || []),
  ].join(" ");
  if (profilePreferences) return `${base} ${profilePreferences}`;
  if (/football|足球/i.test(text)) return `${base} football`;
  if (/game|gaming|游戏/i.test(text)) return `${base} gaming`;
  if (/book|reading|书|阅读/i.test(text)) return `${base} books`;
  return base;
}

function buildRestaurantQuery({ targetMember, currentUser }) {
  const address =
    targetMember?.addresses?.home ||
    currentUser?.addresses?.home ||
    currentUser?.addresses?.company ||
    currentUser?.addresses?.school ||
    "near me";
  return `birthday restaurant for family near ${address}`;
}

function extractPreferenceText({ targetMember, memory }) {
  if (!targetMember) return "";
  const facts = Array.isArray(memory.facts) ? memory.facts : [];
  const name = targetMember.name.toLowerCase();
  const related = facts
    .map((entry) => String(entry.fact || entry || ""))
    .filter((fact) => fact.toLowerCase().includes(name))
    .slice(-3);
  return related.join(" ");
}

function buildQuickLinks({ giftQuery, restaurantQuery }) {
  const encodedGift = encodeURIComponent(giftQuery);
  const encodedRestaurant = encodeURIComponent(restaurantQuery);
  return [
    {
      label: "Amazon 礼物搜索",
      url: `https://www.amazon.com/s?k=${encodedGift}`,
    },
    {
      label: "同城生日餐厅",
      url: `https://www.google.com/maps/search/${encodedRestaurant}`,
    },
    {
      label: "Google 礼物搜索",
      url: `https://www.google.com/search?q=${encodedGift}`,
    },
  ];
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase();
  if (["father", "mother", "parent"].includes(value)) return "parent";
  return value;
}

function roleAliases(role) {
  const value = String(role || "").toLowerCase();
  if (value === "father") return ["dad", "daddy", "father", "爸爸", "父亲"];
  if (value === "mother") return ["mum", "mom", "mommy", "mummy", "mother", "妈妈", "母亲", "妈"];
  if (value === "parent") return [];
  if (value === "child" || value === "minor") return ["child", "kid", "孩子", "小孩"];
  if (value === "grandparent") return ["grandparent", "grandma", "grandpa", "祖父母"];
  return [];
}

async function safeWebSearch(searchWeb, query) {
  if (typeof searchWeb !== "function") return [];
  try {
    const results = await searchWeb({ query, limit: 3 });
    return Array.isArray(results)
      ? results.map((item) => ({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
        }))
      : [];
  } catch {
    return [];
  }
}
