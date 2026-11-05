const ROLE_ALIASES = {
  father: ["dad", "daddy", "father", "爸爸", "父亲", "爸"],
  mother: ["mum", "mom", "mommy", "mummy", "mother", "妈妈", "母亲", "妈"],
  grandparent: ["grandparent", "grandma", "grandmother", "grandpa", "grandfather", "爷爷", "奶奶", "外公", "外婆", "姥爷", "姥姥", "祖父母"],
  child: ["child", "kid", "孩子", "小孩"],
};

const RELATION_PATTERNS = [
  { relation: "mother", pattern: /\b(mommy|mummy|mom|mum|mother)\b|妈妈|母亲|妈/i },
  { relation: "father", pattern: /\b(daddy|dad|father)\b|爸爸|父亲|爸/i },
  { relation: "grandparent", pattern: /\b(grandma|grandmother|grandpa|grandfather|grandparent)\b|爷爷|奶奶|外公|外婆|姥爷|姥姥|祖父母/i },
  { relation: "older_male_sibling", pattern: /\b(older brother|big brother|brother)\b|哥哥|兄长/i },
  { relation: "older_female_sibling", pattern: /\b(older sister|big sister|sister)\b|姐姐|姊姊/i },
  { relation: "younger_male_sibling", pattern: /\b(younger brother|little brother)\b|弟弟/i },
  { relation: "younger_female_sibling", pattern: /\b(younger sister|little sister)\b|妹妹/i },
];

export function buildFamilyMembers({ planMembers = [], familyUsers = [], currentUser = null } = {}) {
  const members = new Map();
  for (const member of Array.isArray(planMembers) ? planMembers : []) {
    addMember(members, member, member.role);
  }
  for (const user of [...(Array.isArray(familyUsers) ? familyUsers : []), currentUser].filter(Boolean)) {
    addMember(members, user, user.familyRole || user.role);
  }
  return [...members.values()];
}

export function resolveFamilyReferences(text, context = {}) {
  const originalText = String(text || "");
  const members = buildFamilyMembers({
    planMembers: context.members || context.planMembers || [],
    familyUsers: context.familyUsers || [],
    currentUser: context.currentUser || null,
  });
  const currentUser = findCurrentUser(members, context.currentUser);
  let resolvedText = originalText;
  const matches = [];

  // Named aliases are checked first, so "Mommy" maps to the registered mother
  // before relation words are considered.
  const aliases = members
    .flatMap((member) => [member.name, ...(member.aliases || [])].filter(Boolean).map((alias) => ({ alias, member })))
    .sort((a, b) => String(b.alias).length - String(a.alias).length);
  for (const { alias, member } of aliases) {
    const pattern = aliasPattern(alias);
    if (!pattern.test(resolvedText)) continue;
    if (normalizeText(alias) === normalizeText(member.name)) continue;
    resolvedText = resolvedText.replace(pattern, member.name);
    matches.push({ input: alias, member: member.name, type: "alias" });
  }

  for (const entry of RELATION_PATTERNS) {
    const match = resolvedText.match(entry.pattern);
    if (!match) continue;
    const target = resolveRelation(entry.relation, members, currentUser);
    if (!target) continue;
    resolvedText = replaceFirst(resolvedText, entry.pattern, target.name);
    matches.push({ input: match[0], member: target.name, type: entry.relation });
  }

  return {
    originalText,
    resolvedText,
    matches,
    members,
    currentUser: currentUser || null,
  };
}

export function resolveFamilyReferencesInActions(actions, context = {}) {
  if (!Array.isArray(actions)) return actions;
  const members = context.members || buildFamilyMembers(context);
  return actions.map((action) => {
    const sourceText = action?.sourceText || action?.title || action?.item || "";
    const resolution = resolveFamilyReferences(sourceText, { ...context, members });
    return {
      ...action,
      sourceText: resolution.resolvedText || action?.sourceText,
      title: resolveMemberValue(action?.title, members, context),
      item: resolveMemberValue(action?.item, members, context),
      assignee: resolveMemberValue(action?.assignee, members, context),
      participants: resolveMemberValues(action?.participants, members, context),
      excludeMembers: resolveMemberValues(action?.excludeMembers, members, context),
    };
  });
}

export function resolveMemberValue(value, members = [], context = {}) {
  if (!value) return value;
  const resolution = resolveFamilyReferences(String(value), { ...context, members });
  return resolution.resolvedText;
}

function addMember(members, rawMember, rawRole) {
  const name = rawMember?.displayName || rawMember?.name;
  if (!name) return;
  const key = normalizeText(name);
  const existing = members.get(key) || {};
  const role = normalizeRole(rawRole || existing.role);
  const aliases = [
    ...(existing.aliases || []),
    ...(Array.isArray(rawMember.aliases) ? rawMember.aliases : []),
    name,
    rawMember.nickname,
    rawMember.loginId,
    ...roleAliases(rawRole),
    ...roleAliases(role),
  ].filter(Boolean);
  const inferredGender = inferGender(rawMember, role, aliases);
  members.set(key, {
    ...existing,
    id: rawMember.id || existing.id || key,
    name,
    role,
    familyRole: rawMember.familyRole || existing.familyRole || rawRole || "",
    aliases: [...new Set(aliases)],
    birthday: rawMember.birthday || existing.birthday || "",
    age: typeof rawMember.age === "number" ? rawMember.age : existing.age ?? ageFromBirthday(rawMember.birthday),
    isAdult: typeof rawMember.isAdult === "boolean" ? rawMember.isAdult : existing.isAdult,
    gender: inferredGender !== "unknown" ? inferredGender : existing.gender || "unknown",
  });
}

function resolveRelation(relation, members, currentUser) {
  if (relation === "mother") return chooseUnique(members.filter((member) => member.role === "parent" && member.gender === "female"));
  if (relation === "father") return chooseUnique(members.filter((member) => member.role === "parent" && member.gender === "male"));
  if (relation === "grandparent") return chooseUnique(members.filter((member) => member.role === "grandparent"));
  if (!currentUser || typeof currentUser.age !== "number") return null;

  const candidates = members
    .filter((member) => member.name !== currentUser.name)
    .filter((member) => !["parent", "grandparent", "guardian"].includes(member.role))
    .filter((member) => typeof member.age === "number")
    .filter((member) => {
      const older = member.age > currentUser.age;
      const male = member.gender === "male";
      const female = member.gender === "female";
      if (relation === "older_male_sibling") return older && male;
      if (relation === "older_female_sibling") return older && female;
      if (relation === "younger_male_sibling") return !older && male;
      if (relation === "younger_female_sibling") return !older && female;
      return false;
    })
    .sort((a, b) => Math.abs(a.age - currentUser.age) - Math.abs(b.age - currentUser.age));
  return candidates[0] || null;
}

function chooseUnique(members) {
  return members.length === 1 ? members[0] : members[0] || null;
}

function findCurrentUser(members, currentUser) {
  if (!currentUser) return null;
  const name = currentUser.displayName || currentUser.name;
  if (!name) return null;
  return members.find((member) => normalizeText(member.name) === normalizeText(name)) || null;
}

function resolveMemberValues(values, members, context) {
  return Array.isArray(values) ? values.map((value) => resolveMemberName(value, members, context)).filter(Boolean) : values;
}

function resolveMemberName(value, members, context) {
  if (!value) return value;
  const text = String(value);
  const exact = members.find((member) => [member.name, ...(member.aliases || [])].some((alias) => normalizeText(alias) === normalizeText(text)));
  if (exact) return exact.name;
  return resolveMemberValue(text, members, context);
}

function roleAliases(role) {
  const value = String(role || "").toLowerCase().trim();
  if (value === "father") return ROLE_ALIASES.father;
  if (value === "mother") return ROLE_ALIASES.mother;
  if (value === "grandparent") return ROLE_ALIASES.grandparent;
  if (value === "child" || value === "minor") return ROLE_ALIASES.child;
  return [];
}

function normalizeRole(role) {
  const value = String(role || "").toLowerCase().trim();
  if (["father", "mother", "parent", "guardian"].includes(value)) return "parent";
  if (["child", "minor"].includes(value)) return "child";
  return value || "adult";
}

function inferGender(member, role, aliases) {
  const explicit = String(member.gender || member.sex || "").toLowerCase();
  if (["male", "m", "man", "boy", "男性", "男"].includes(explicit)) return "male";
  if (["female", "f", "woman", "girl", "女性", "女"].includes(explicit)) return "female";
  if (String(member.familyRole || member.role || "").toLowerCase() === "father") return "male";
  if (String(member.familyRole || member.role || "").toLowerCase() === "mother") return "female";
  const text = normalizeText([member.name, member.nickname, ...(aliases || [])].join(" "));
  if (/(^| )(mr|dad|daddy|father|grandpa|grandfather|哥哥|弟弟|爸爸|父亲)( |$)/i.test(text)) return "male";
  if (/(^| )(mrs|mum|mom|mommy|mummy|mother|grandma|grandmother|姐姐|妹妹|妈妈|母亲)( |$)/i.test(text)) return "female";
  return "unknown";
}

function ageFromBirthday(birthday) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthday || ""))) return null;
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

function aliasPattern(alias) {
  const escaped = String(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return /^[\p{L}\p{N} ]+$/u.test(alias) && /[A-Za-z0-9]/.test(alias)
    ? new RegExp(`\\b${escaped}\\b`, "i")
    : new RegExp(escaped, "i");
}

function replaceFirst(text, pattern, replacement) {
  return text.replace(pattern, replacement);
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
