const assert = require("node:assert/strict");
const test = require("node:test");

const { AnalysisPipeline } = require("../src/analysisPipeline");

test("composes additional analyses onto a normalized primary report", async () => {
  const pipeline = new AnalysisPipeline({
    runPrimary: async () => ({ data: { version: "3.7.1" }, exitCode: 0 }),
    normalizePrimary: (data, meta) => ({ version: data.version, exitCode: meta.exitCode }),
    enrichers: [{
      key: "architecture",
      analyze: async ({ report }) => ({ state: "ready", reportVersion: report.version })
    }]
  });

  const report = await pipeline.run();
  assert.deepEqual(report.architecture, { state: "ready", reportVersion: "3.7.1" });
});

test("isolates optional analysis failures with an enricher fallback", async () => {
  const pipeline = new AnalysisPipeline({
    runPrimary: async () => ({ data: {}, exitCode: 0 }),
    normalizePrimary: () => ({ status: "clear" }),
    enrichers: [{
      key: "architecture",
      analyze: async () => { throw new Error("trace unavailable"); },
      fallback: (error) => ({ state: "failed", error: error.message })
    }]
  });

  const report = await pipeline.run();
  assert.equal(report.status, "clear");
  assert.deepEqual(report.architecture, { state: "failed", error: "trace unavailable" });
});
