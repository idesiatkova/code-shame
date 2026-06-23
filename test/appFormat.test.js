const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app-format.js"), "utf8");
const context = { Intl, window: {} };
vm.runInNewContext(source, context);

const format = context.window.codeScanFormat;

test("maps metric tones to shame labels", () => {
  assert.equal(format.shameLabel("good"), "No shame");
  assert.equal(format.shameLabel("neutral"), "No shame");
  assert.equal(format.shameLabel("warn"), "A little shame");
  assert.equal(format.shameLabel("critical"), "Secondhand embarrassment");
});

test("only highlights coupling values when a numeric threshold exists", () => {
  assert.equal(format.isAboveCouplingThreshold(1, null), false);
  assert.equal(format.isAboveCouplingThreshold(1, undefined), false);
  assert.equal(format.isAboveCouplingThreshold(1, ""), false);
  assert.equal(format.isAboveCouplingThreshold(1, 0), false);
  assert.equal(format.isAboveCouplingThreshold(8, 8), false);
  assert.equal(format.isAboveCouplingThreshold(9, 8), true);
});
