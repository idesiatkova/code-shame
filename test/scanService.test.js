const assert = require("node:assert/strict");
const test = require("node:test");
const { createScanService } = require("../src/scanService");

test("publishes the primary report before architecture finishes and coalesces scans", async () => {
  let finishList;
  let beginList;
  const listed = new Promise((resolve) => { beginList = resolve; });
  const listing = new Promise((resolve) => { finishList = resolve; });
  const service = createScanService({
    createClient: () => ({
      analyze: async () => ({ data: {}, exitCode: 0 }),
      listProject: () => { beginList(); return listing; },
      resolvedConfig: async () => ({ data: {} })
    })
  });
  const scan = service.start();
  assert.equal(service.start(), scan);
  await listed;
  const primary = service.getSnapshot();
  assert.equal(primary.state, "ready");
  assert.equal(primary.running, true);
  assert.equal(primary.report.architecture.state, "running");
  finishList({ data: { files: [] } });
  await scan;
  assert.equal(service.getSnapshot().running, false);
  assert.equal(service.getSnapshot().report.architecture.state, "ready");
  assert.equal(primary.report.architecture.state, "running");
  await service.close();
});

test("keeps primary results when the graph fails and permits another scan", async () => {
  const service = createScanService({ createClient: () => ({
    analyze: async () => ({ data: {}, exitCode: 0 }),
    listProject: async () => { throw new Error("inspection failed"); },
    resolvedConfig: async () => ({ data: {} })
  }) });
  await service.start();
  assert.equal(service.getSnapshot().state, "ready");
  assert.equal(service.getSnapshot().report.architecture.state, "failed");
  await service.start();
  assert.equal(service.getSnapshot().running, false);
  await service.close();
});

test("cancels active work on shutdown and isolates service instances", async () => {
  let started;
  const begun = new Promise((resolve) => { started = resolve; });
  const first = createScanService({ projectRoot: "/project-a", createClient: ({ signal }) => ({
    analyze: () => new Promise((resolve, reject) => {
      started();
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    })
  }) });
  const second = createScanService({ projectRoot: "/project-b" });
  first.start();
  await begun;
  await first.close();
  assert.equal(first.getSnapshot().running, false);
  assert.equal(second.getSnapshot().state, "idle");
  assert.notEqual(first.getSnapshot().projectId, second.getSnapshot().projectId);
  await first.start();
  assert.equal(first.getSnapshot().running, false);
  await second.close();
});
