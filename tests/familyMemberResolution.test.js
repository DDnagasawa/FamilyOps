import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { previewFamilyPlanning } from "../src/connectors/familyPlanner.js";
import { generateFamilySuggestions } from "../src/connectors/familySuggestions.js";

const familyUsers = [
  { displayName: "Mr Beecham", familyRole: "father", birthday: "1976-03-15", gender: "male", isAdult: true },
  { displayName: "Mrs Beecham", familyRole: "mother", birthday: "1978-10-20", gender: "female", isAdult: true },
  { displayName: "John", familyRole: "adult", birthday: "2000-02-10", gender: "male", isAdult: true },
  { displayName: "Anna", familyRole: "adult", birthday: "2004-04-12", gender: "female", isAdult: true },
  { displayName: "Thomas", familyRole: "adult", birthday: "2006-12-05", gender: "male", isAdult: true },
  { displayName: "Lisa", familyRole: "minor", birthday: "2011-06-20", gender: "female", isAdult: false },
];

function tempPlan() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "familyops-member-resolution-"));
  const planPath = path.join(directory, "family_plan.json");
  fs.writeFileSync(planPath, JSON.stringify({ members: [], events: [], tasks: [], shopping: [], decisions: [] }));
  return planPath;
}

test("resolves mommy to the registered mother and keeps birthday private", () => {
  const action = previewFamilyPlanning({
    text: "Mommy 10/4 birthday",
    familyUsers,
    currentUser: familyUsers[2],
  }, tempPlan()).actions[0];

  assert.equal(action.title, "Mrs Beecham birthday");
  assert.equal(action.date, "2026-10-04");
  assert.deepEqual(action.excludeMembers, ["Mrs Beecham"]);
  assert.ok(!action.recipients.includes("Mrs Beecham"));
  assert.ok(!action.recipients.includes("Lisa"));
});

test("resolves sibling words using age and gender", () => {
  const planPath = tempPlan();
  const olderBrother = previewFamilyPlanning({ text: "哥哥 football", familyUsers, currentUser: familyUsers[4] }, planPath).actions[0];
  const olderSister = previewFamilyPlanning({ text: "姐姐 football", familyUsers, currentUser: familyUsers[4] }, planPath).actions[0];
  const youngerSister = previewFamilyPlanning({ text: "妹妹 football", familyUsers, currentUser: familyUsers[4] }, planPath).actions[0];

  assert.equal(olderBrother.title, "John football");
  assert.equal(olderSister.title, "Anna football");
  assert.equal(youngerSister.title, "Lisa football");
});

test("birthday recommendations use the resolved member instead of the first action participant", async () => {
  const result = await generateFamilySuggestions({
    text: "Mommy 10/4 birthday",
    familyUsers,
    currentUser: familyUsers[2],
    familyPlan: { members: [], events: [], tasks: [], shopping: [] },
    actions: [{
      type: "event",
      title: "Mrs Beecham's birthday",
      sourceText: "Mrs Beecham 10/4 birthday",
      participants: familyUsers.map((member) => member.displayName),
    }],
  });

  assert.equal(result.suggestions[0].targetMember, "Mrs Beecham");
  assert.deepEqual(result.suggestions[0].excludedMembers, ["Mrs Beecham"]);
  assert.ok(!result.suggestions[0].recipients.includes("Mrs Beecham"));
});
