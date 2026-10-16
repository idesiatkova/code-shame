const path = require("node:path");
const { createHash } = require("node:crypto");
const { FallowClient } = require("./fallowClient");
const { ProjectArchitectureAnalyzer } = require("./architectureAnalyzer");
const { normalizeFallowReport } = require("./fallowReport");

function createScanService({
  projectRoot = process.cwd(),
  maxFiles = 48,
  timeoutMs = 180000,
  commandTimeoutMs = 60000,
  createClient = (options) => new FallowClient(options)
} = {}) {
  const root = path.resolve(projectRoot);
  const projectId = createHash("sha256").update(root).digest("hex");
  let snapshot = { state: "idle", report: null, error: null, startedAt: null, finishedAt: null };
  let activeScan = null;
  let controller = null;
  let closed = false;

  function getSnapshot() {
    return { ...snapshot, projectId, running: Boolean(activeScan) };
  }

  function start() {
    if (activeScan) return activeScan;
    if (closed) return Promise.resolve();
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
    const startedAt = Date.now();
    snapshot = { ...snapshot, state: "running", error: null, startedAt: new Date(startedAt).toISOString(), finishedAt: null };
    activeScan = Promise.resolve().then(async () => {
      const client = createClient({ cwd: root, signal, timeoutMs: commandTimeoutMs });
      const primary = await client.analyze();
      signal.throwIfAborted();
      const generatedAt = new Date().toISOString();
      const report = normalizeFallowReport(primary.data, {
        exitCode: primary.exitCode,
        command: "fallow --format json --quiet",
        durationMs: Date.now() - startedAt,
        generatedAt
      });
      report.architecture = { state: "running", nodes: [], edges: [] };
      snapshot = { ...snapshot, state: "ready", report };

      const analyzer = new ProjectArchitectureAnalyzer({ client, maxFiles });
      try {
        const architecture = await analyzer.analyze({ rawReport: primary.data });
        signal.throwIfAborted();
        snapshot = { ...snapshot, report: { ...report, architecture } };
      } catch (error) {
        snapshot = { ...snapshot, report: { ...report, architecture: analyzer.fallback(error) } };
      }
    }).catch((error) => {
      snapshot = { ...snapshot, state: "failed", error: error.message || String(error) };
    }).finally(() => {
      controller.abort();
      activeScan = null;
      snapshot = { ...snapshot, finishedAt: new Date().toISOString() };
    });
    return activeScan;
  }

  async function close() {
    closed = true;
    controller?.abort(new Error("Code Shame is shutting down."));
    await activeScan;
  }

  return { getSnapshot, start, close };
}

module.exports = { createScanService };
