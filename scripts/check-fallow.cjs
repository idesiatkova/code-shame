const { spawnSync } = require("node:child_process");
const console = require("node:console");
const process = require("node:process");

const result = spawnSync(
  process.execPath,
  [
    require.resolve("fallow/bin/fallow"),
    "--no-production",
    "--fail-on-issues",
    "--fail-on-parse-error",
    "--format",
    "json",
    "--quiet",
  ],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);

if (result.error || result.status !== 0) {
  process.stderr.write(
    result.stderr || result.error?.message || `Fallow exited ${result.status}\n`,
  );
  if (result.stdout) process.stderr.write(result.stdout);
  process.exit(result.status || 1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("Fallow returned invalid JSON");
  process.exit(1);
}
if (
  report.kind !== "combined" ||
  !Array.isArray(report.health?.sections) ||
  !report.health.sections.includes("targets") ||
  (report.health.targets !== undefined && !Array.isArray(report.health.targets))
) {
  console.error("Fallow returned an unexpected report; expected combined health targets");
  process.exit(1);
}

const targets = report.health.targets ?? [];
if (targets.length) {
  for (const target of targets) console.error(`${target.path}: ${target.recommendation}`);
  process.exit(1);
}

console.log(
  `Fallow: ${report.check.total_issues} dead-code issues, ${report.health.summary.functions_above_threshold} health findings, ${report.dupes.clone_groups.length} duplicate groups, ${targets.length} targets`,
);
