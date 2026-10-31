import assert from "node:assert/strict";
import test from "node:test";
import { hasCallSite, matchingSavedState, readLocation } from "../public/app/source-navigation.js";

test("validates deep-link call locations and binds saved state to source identity", () => {
  const hash = "a".repeat(64);
  const params = new URLSearchParams({ line: "12", column: "3", hash });
  const { location, invalid } = readLocation(params);
  assert.equal(invalid, false); assert.deepEqual(location, { line: 12, column: 3, hash });
  assert.equal(readLocation(new URLSearchParams()).invalid, false);
  for (const value of ["line=12", `line=12&column=no&hash=${hash}`, `line=0&column=3&hash=${hash}`, "line=12&column=3&hash=bad"]) assert.equal(readLocation(new URLSearchParams(value)).invalid, true);
  const data = { hash, calls: [{ ownerId: "f", line: 12, column: 3 }] };
  assert.equal(hasCallSite(data, { id: "f" }, location), true);
  assert.equal(hasCallSite(data, { id: "other" }, location), false);
  assert.equal(hasCallSite({ ...data, hash: "changed" }, { id: "f" }, location), false);
  const saved = { file: "a.js", symbol: "f", location, sourceHash: hash, focus: "code", scrollLeft: 15 };
  assert.equal(matchingSavedState(saved, "a.js", "f", location), saved);
  assert.equal(matchingSavedState(saved, "b.js", "f", location), null);
  assert.equal(matchingSavedState(saved, "a.js", "other", location), null);
  assert.equal(matchingSavedState(saved, "a.js", "f", null), null);
  assert.equal(matchingSavedState({ ...saved, sourceHash: "" }, "a.js", "f", location), null);
});
