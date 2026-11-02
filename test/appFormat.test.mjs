import assert from "node:assert/strict";
import test from "node:test";
import { shameLabel } from "../public/app/features/report/overview.js";
import * as format from "../public/app/features/report/report-format.js";
import { formatReportText } from "../public/app/features/report/report-text.js";

test("maps metric tones to shame labels", () => {
  assert.equal(shameLabel("good"), "No shame");
  assert.equal(shameLabel("neutral"), "No shame");
  assert.equal(shameLabel("warn"), "A little shame");
  assert.equal(shameLabel("critical"), "Secondhand embarrassment");
});

test("labels copied output as a Fallow report without dashboard branding", () => {
  const report = {
    generatedAt: "2026-07-20T00:00:00.000Z",
    status: "clear",
    hardFindings: { count: 0, sections: [] },
    health: { targets: [] },
  };

  const text = formatReportText(report);
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
