import assert from "node:assert/strict";
import test from "node:test";
import * as format from "../public/app/format.js";

test("maps metric tones to shame labels", () => {
  assert.equal(format.shameLabel("good"), "No shame");
  assert.equal(format.shameLabel("neutral"), "No shame");
  assert.equal(format.shameLabel("warn"), "A little shame");
  assert.equal(format.shameLabel("critical"), "Secondhand embarrassment");
});

test("labels copied output as a Fallow report without dashboard branding", () => {
  const report = {
    generatedAt: "2026-07-20T00:00:00.000Z",
    status: "clear",
    hardFindings: { count: 0, sections: [] },
    health: { targets: [] }
  };

  const text = format.formatReportText(report);
  assert.match(text, /^Fallow report\n/);
  assert.doesNotMatch(text, /Code Shame/i);
});

test("only highlights coupling values when a numeric threshold exists", () => {
  assert.equal(format.isAboveCouplingThreshold(1, null), false);
  assert.equal(format.isAboveCouplingThreshold(1, undefined), false);
  assert.equal(format.isAboveCouplingThreshold(1, ""), false);
  assert.equal(format.isAboveCouplingThreshold(1, 0), false);
  assert.equal(format.isAboveCouplingThreshold(8, 8), false);
  assert.equal(format.isAboveCouplingThreshold(9, 8), true);
});
