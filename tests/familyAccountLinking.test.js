import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createFamilyInvite, loginUser, readUserStore, registerUser } from "../src/auth/userStore.js";

function tempStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "familyops-family-code-"));
  return path.join(directory, "users.json");
}

const common = {
  password: "family-test-2026",
  familyRole: "adult",
  birthday: "1990-01-01",
  gender: "unknown",
};

test("family code and invite path join accounts to the same family", () => {
  const storePath = tempStore();
  const invite = createFamilyInvite(storePath);
  const alice = registerUser({ ...common, displayName: "Alice", loginId: "alice@example.test", familyCode: invite.code }, storePath);
  const bob = registerUser({ ...common, displayName: "Bob", loginId: "bob@example.test", familyInvite: invite.invitePath }, storePath);
  const carol = registerUser({ ...common, displayName: "Carol", loginId: "carol@example.test" }, storePath);
  const login = loginUser({ loginId: "alice@example.test", password: common.password }, storePath);

  assert.equal(alice.user.familyId, bob.user.familyId);
  assert.notEqual(alice.user.familyId, carol.user.familyId);
  assert.equal(login.family.id, invite.id);
  assert.equal(readUserStore(storePath).families.length, 2);
});

test("an invalid family code cannot silently create a new linked family", () => {
  assert.throws(
    () => registerUser({ ...common, displayName: "Invalid", loginId: "invalid@example.test", familyCode: "00000" }, tempStore()),
    /not valid/
  );
});
