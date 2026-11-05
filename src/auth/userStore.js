import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";

const DEFAULT_USERS_PATH = path.join(process.cwd(), "data", "users.json");
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_DIGEST = "sha256";

const DEFAULT_STORE = {
  users: [],
  sessions: [],
  families: [],
};

const REQUIRED_ROLES = new Set(["father", "mother", "child", "grandparent", "adult", "minor", "parent", "guardian"]);
const GENDERS = new Set(["male", "female", "unknown"]);
const REMINDER_STYLES = new Set(["app", "browser", "lark", "none"]);
const CONTACT_CHANNELS = new Set(["app", "lark", "email", "phone"]);
const FAMILY_CODE_PATTERN = /\b(\d{5})\b/;

export function registerUser(input = {}, storePath = DEFAULT_USERS_PATH) {
  const store = readUserStore(storePath);
  ensureFamilyRecords(store);
  const family = resolveRegistrationFamily(input, store);
  const profile = sanitizeProfileInput({ ...input, familyId: family.id });
  const password = String(input.password || "");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (store.users.some((user) => user.loginId.toLowerCase() === profile.loginId.toLowerCase())) {
    throw new Error("This email or phone is already registered.");
  }

  const passwordRecord = hashPassword(password);
  const user = {
    id: randomUUID(),
    ...profile,
    passwordHash: passwordRecord.hash,
    passwordSalt: passwordRecord.salt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.users.push(user);
  const session = createSession(user.id);
  store.sessions.push(session);
  writeUserStore(store, storePath);
  return { user: publicUser(user), token: session.token, family: publicFamily(family) };
}

export function loginUser(input = {}, storePath = DEFAULT_USERS_PATH) {
  const store = readUserStore(storePath);
  ensureFamilyRecords(store);
  const loginId = normalizeLoginId(input.loginId);
  const password = String(input.password || "");
  const user = findLoginUser(store.users, loginId);
  if (!user || !verifyPassword(password, user)) throw new Error("Login details are not correct.");
  const session = createSession(user.id);
  store.sessions.push(session);
  pruneSessions(store);
  writeUserStore(store, storePath);
  return { user: publicUser(user), token: session.token, family: familyForUser(store, user) };
}

export function createFamilyInvite(storePath = DEFAULT_USERS_PATH) {
  const store = readUserStore(storePath);
  ensureFamilyRecords(store);
  const family = {
    id: `family-${randomUUID()}`,
    code: createUniqueFamilyCode(store.families),
    createdAt: new Date().toISOString(),
  };
  store.families.push(family);
  writeUserStore(store, storePath);
  return publicFamily(family);
}

export function getFamilyForToken(token, storePath = DEFAULT_USERS_PATH) {
  if (!token) return null;
  const store = readUserStore(storePath);
  ensureFamilyRecords(store);
  const session = store.sessions.find((entry) => entry.token === token && new Date(entry.expiresAt).getTime() > Date.now());
  const user = session ? store.users.find((entry) => entry.id === session.userId) : null;
  return user ? familyForUser(store, user) : null;
}

function findLoginUser(users, loginId) {
  const normalized = normalizeLoginId(loginId);
  if (!normalized) return null;
  return users.find((entry) => {
    const candidates = [entry.loginId, entry.displayName, entry.nickname]
      .filter(Boolean)
      .map((value) => normalizeLoginId(value));
    return candidates.includes(normalized);
  });
}

export function getUserByToken(token, storePath = DEFAULT_USERS_PATH) {
  if (!token) return null;
  const store = readUserStore(storePath);
  const session = store.sessions.find((entry) => entry.token === token && new Date(entry.expiresAt).getTime() > Date.now());
  if (!session) return null;
  const user = store.users.find((entry) => entry.id === session.userId);
  return user ? publicUser(user) : null;
}

export function listPublicUsers(storePath = DEFAULT_USERS_PATH, familyId = null) {
  const store = readUserStore(storePath);
  return store.users.map(publicUser).filter((user) => !familyId || user.familyId === familyId);
}

export function updateUserProfile(input = {}, token, storePath = DEFAULT_USERS_PATH) {
  if (!token) throw new Error("Login is required.");
  const store = readUserStore(storePath);
  const session = store.sessions.find((entry) => entry.token === token && new Date(entry.expiresAt).getTime() > Date.now());
  if (!session) throw new Error("Session has expired.");
  const user = store.users.find((entry) => entry.id === session.userId);
  if (!user) throw new Error("User not found.");

  const profile = sanitizeProfileInput({ ...user, ...input });
  Object.assign(user, profile, { updatedAt: new Date().toISOString() });
  writeUserStore(store, storePath);
  return { user: publicUser(user) };
}

export function logoutUser(token, storePath = DEFAULT_USERS_PATH) {
  const store = readUserStore(storePath);
  store.sessions = store.sessions.filter((entry) => entry.token !== token);
  writeUserStore(store, storePath);
  return { ok: true };
}

export function readUserStore(storePath = DEFAULT_USERS_PATH) {
  ensureStoreFile(storePath);
  const parsed = JSON.parse(fs.readFileSync(storePath, "utf8"));
  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    families: Array.isArray(parsed.families) ? parsed.families : [],
  };
}

function resolveRegistrationFamily(input, store) {
  const supplied = String(input.familyCode || input.familyInvite || input.inviteLink || "").trim();
  if (supplied && !FAMILY_CODE_PATTERN.test(supplied)) {
    throw new Error("Family code or invite link is not valid.");
  }
  const codeMatch = supplied.match(FAMILY_CODE_PATTERN);
  if (codeMatch) {
    const family = store.families.find((entry) => entry.code === codeMatch[1]);
    if (!family) throw new Error("Family code or invite link is not valid.");
    return family;
  }

  const family = {
    id: `family-${randomUUID()}`,
    code: createUniqueFamilyCode(store.families),
    createdAt: new Date().toISOString(),
  };
  store.families.push(family);
  return family;
}

function ensureFamilyRecords(store) {
  const families = Array.isArray(store.families) ? store.families : [];
  store.families = families;
  const knownIds = new Set(families.map((family) => family.id));
  for (const user of store.users) {
    const familyId = user.familyId || "default";
    if (knownIds.has(familyId)) continue;
    const family = {
      id: familyId,
      code: createUniqueFamilyCode(store.families),
      createdAt: user.createdAt || new Date().toISOString(),
    };
    store.families.push(family);
    knownIds.add(familyId);
  }
}

function createUniqueFamilyCode(families) {
  const used = new Set(families.map((family) => family.code));
  let code = "";
  do {
    code = String(Math.floor(10000 + Math.random() * 90000));
  } while (used.has(code));
  return code;
}

function familyForUser(store, user) {
  const family = store.families.find((entry) => entry.id === (user.familyId || "default"));
  return family ? publicFamily(family) : null;
}

function publicFamily(family) {
  return {
    id: family.id,
    code: family.code,
    invitePath: `/app?familyCode=${encodeURIComponent(family.code)}`,
  };
}

function sanitizeProfileInput(input) {
  const displayName = cleanText(input.displayName || input.name, 80);
  const loginId = normalizeLoginId(input.loginId);
  const familyRole = String(input.familyRole || input.role || "").trim();
  const birthday = normalizeDate(input.birthday);
  if (!displayName) throw new Error("Name is required.");
  if (!loginId) throw new Error("Email or phone is required.");
  if (!REQUIRED_ROLES.has(familyRole)) throw new Error("Family role is required.");
  if (!birthday) throw new Error("Birth date is required.");

  return {
    displayName,
    loginId,
    familyId: cleanText(input.familyId || "default", 80),
    familyRole,
    gender: GENDERS.has(input.gender) ? input.gender : "unknown",
    isAdult: normalizeBoolean(input.isAdult, familyRole, input.birthday),
    nickname: cleanText(input.nickname, 60),
    birthday,
    contactChannels: cleanStringList(input.contactChannels).filter((item) => CONTACT_CHANNELS.has(item)),
    reminderStyle: REMINDER_STYLES.has(input.reminderStyle) ? input.reminderStyle : "app",
    defaultReminderTime: normalizeTime(input.defaultReminderTime),
    addresses: {
      home: cleanText(input.addresses?.home || input.homeAddress, 180),
      company: cleanText(input.addresses?.company || input.companyAddress, 180),
      school: cleanText(input.addresses?.school || input.schoolAddress, 180),
    },
    preferences: {
      interests: cleanStringList(input.preferences?.interests || input.interests),
      foodPreferences: cleanStringList(input.preferences?.foodPreferences || input.foodPreferences),
      allergies: cleanStringList(input.preferences?.allergies || input.allergies),
      dislikes: cleanStringList(input.preferences?.dislikes || input.dislikes),
    },
    learning: normalizeLearning(input.learning),
    aiNotes: cleanText(input.aiNotes, 240),
  };
}

function cleanText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeLoginId(value) {
  return String(value || "").trim().toLowerCase().slice(0, 120);
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return /^\d{2}:\d{2}$/.test(text) ? text : "";
}

function normalizeBoolean(value, role, birthday) {
  const date = normalizeDate(birthday);
  if (date) return calculateAge(date) >= 18;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  if (role === "adult" || role === "father" || role === "mother" || role === "grandparent" || role === "parent" || role === "guardian") return true;
  if (role === "child" || role === "minor") return false;
  return false;
}

function cleanStringList(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,，、]/);
  return [...new Set(list.map((item) => cleanText(item, 60)).filter(Boolean))].slice(0, 20);
}

function normalizeLearning(value = {}) {
  return {
    frequentTaskTypes: cleanStringList(value.frequentTaskTypes),
    clickedRecommendations: cleanStringList(value.clickedRecommendations),
    ignoredRecommendations: cleanStringList(value.ignoredRecommendations),
    savedSuggestions: cleanStringList(value.savedSuggestions),
    reminderPatterns: cleanStringList(value.reminderPatterns),
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const expected = Buffer.from(user.passwordHash || "", "hex");
  const actual = Buffer.from(
    pbkdf2Sync(password, user.passwordSalt || "", PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, PASSWORD_DIGEST).toString("hex"),
    "hex"
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function createSession(userId) {
  const now = Date.now();
  return {
    token: `${randomUUID()}.${randomBytes(18).toString("hex")}`,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function pruneSessions(store) {
  const now = Date.now();
  store.sessions = store.sessions.filter((session) => new Date(session.expiresAt).getTime() > now).slice(-80);
}

function publicUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    loginId: user.loginId,
    familyId: user.familyId || "default",
    familyRole: user.familyRole,
    gender: GENDERS.has(user.gender) ? user.gender : "unknown",
    isAdult: Boolean(user.isAdult),
    nickname: user.nickname || "",
    birthday: user.birthday || "",
    age: user.birthday ? calculateAge(user.birthday) : null,
    contactChannels: Array.isArray(user.contactChannels) && user.contactChannels.length ? user.contactChannels : ["app"],
    reminderStyle: user.reminderStyle || "app",
    defaultReminderTime: user.defaultReminderTime || "",
    addresses: {
      home: user.addresses?.home || "",
      company: user.addresses?.company || "",
      school: user.addresses?.school || "",
    },
    preferences: {
      interests: user.preferences?.interests || [],
      foodPreferences: user.preferences?.foodPreferences || [],
      allergies: user.preferences?.allergies || [],
      dislikes: user.preferences?.dislikes || [],
    },
    learning: normalizeLearning(user.learning),
    aiNotes: user.aiNotes || "",
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function calculateAge(birthday) {
  const birth = new Date(`${birthday}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const currentMonth = today.getMonth();
  const birthMonth = birth.getMonth();
  const currentDay = today.getDate();
  const birthDay = birth.getDate();
  const passedMonth = currentMonth > birthMonth;
  const sameMonth = currentMonth === birthMonth;
  const passedDay = currentDay >= birthDay;
  const hadBirthday = passedMonth || (sameMonth && passedDay);
  if (!hadBirthday) age -= 1;
  return Math.max(0, age);
}

function ensureStoreFile(storePath) {
  if (fs.existsSync(storePath)) return;
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(DEFAULT_STORE, null, 2)}\n`, "utf8");
}

function writeUserStore(store, storePath) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}
