import assert from "node:assert/strict";
import test from "node:test";
import { createSymbolContext } from "../public/app/features/source/symbol-context.js";

test("describes duplicate names with their real owners and searchable context", () => {
  const symbols = [
    { id: "a", name: "Box", kind: "class" },
    { id: "b", name: "run", kind: "method", parentId: "a", signature: "run(value)" },
    { id: "c", name: "outer", kind: "function" },
    { id: "d", name: "run", kind: "function", parentId: "c", signature: "run()" },
  ];
  const context = createSymbolContext(symbols);
  assert.equal(context.describe("b").label, "Box.run");
  assert.equal(context.describe(symbols[3]).label, "outer.run");
  assert.equal(context.describe("b").ownerPath, "Box");
  assert.match(context.describe("b").searchText, /run method run\(value\) Box/);
  assert.ok(context.describe("b").searchText.includes("Box.run"));
});

test("identifies anonymous symbols using owners and source lines", () => {
  const context = createSymbolContext([
    { id: "a", name: "createServer" },
    { id: "b", name: "<anonymous>", parentId: "a", startLine: 25 },
    { id: "c", name: "inner", parentId: "b" },
  ]);
  assert.equal(context.describe("b").label, "<anonymous> in createServer · line 25");
  assert.ok(context.describe("b").searchText.includes("<anonymous> in createServer · line 25"));
  assert.equal(context.describe("c").label, "createServer.<anonymous> · line 25.inner");
});

test("handles missing parents and cycles without inventing owners", () => {
  const context = createSymbolContext([
    { id: "a", name: "first", parentId: "b" },
    { id: "b", name: "second", parentId: "a" },
    { id: "c", name: "orphan", parentId: "missing" },
  ]);
  assert.equal(context.describe("a").label, "second.first");
  assert.equal(context.describe("c").label, "orphan");
  assert.deepEqual(context.describe("missing"), { label: "", ownerPath: "", searchText: "" });
});
