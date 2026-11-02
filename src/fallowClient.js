const { runFallowCommand } = require("./fallowCommand");
const { exportFallowGraph } = require("./fallowGraphExport");

const JSON_OUTPUT_ARGS = ["--format", "json", "--quiet"];

class FallowClient {
  constructor({ cwd, signal, timeoutMs = 60000 }) {
    if (!cwd) throw new Error("FallowClient requires a project root.");
    this.cwd = cwd;
    this.signal = signal;
    this.timeoutMs = timeoutMs;
    this.launcherPath = require.resolve("fallow/bin/fallow");
  }

  analyze() {
    return this.runJson(JSON_OUTPUT_ARGS);
  }
  listProject() {
    return this.runJson(["list", ...JSON_OUTPUT_ARGS]);
  }
  resolvedConfig() {
    return this.runJson(["config", ...JSON_OUTPUT_ARGS]);
  }
  inspectFile(filePath) {
    return this.runJson(["inspect", "--file", filePath, ...JSON_OUTPUT_ARGS]);
  }

  exportGraph() {
    return exportFallowGraph(this);
  }

  runJson(args, options) {
    return runFallowCommand(this, args, options);
  }
}

module.exports = { FallowClient };
