const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const process = require("node:process");
const test = require("node:test");

test("Fallow gate rejects targets, invalid reports, and CLI errors", () => {
  const dir = mkdtempSync(join(tmpdir(), "fallow-gate-"));
  const preload = join(dir, "preload.cjs");
  writeFileSync(
    preload,
    'require("node:child_process").spawnSync = () => JSON.parse(process.env.FALLOW_RESULT);',
  );
  const report = {
    kind: "combined",
    check: { total_issues: 0 },
    health: { sections: ["targets"], summary: { functions_above_threshold: 0 } },
    dupes: { clone_groups: [] },
  };
  const run = (result) =>
    spawnSync(process.execPath, ["--require", preload, "scripts/check-fallow.cjs"], {
      encoding: "utf8",
      env: { ...process.env, FALLOW_RESULT: JSON.stringify(result) },
    });
  try {
    assert.equal(run({ status: 0, stdout: JSON.stringify(report) }).status, 0);
    report.health.targets = [{ path: "example.js", recommendation: "Split it" }];
    const target = run({ status: 0, stdout: JSON.stringify(report) });
    assert.equal(target.status, 1);
    assert.match(target.stderr, /example\.js: Split it/);
    assert.equal(run({ status: 0, stdout: "{" }).status, 1);
    report.health.sections = [];
    assert.equal(run({ status: 0, stdout: JSON.stringify(report) }).status, 1);
    assert.equal(run({ status: 2, stderr: "CLI failed" }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
