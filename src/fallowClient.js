const { spawn } = require("node:child_process");

const JSON_OUTPUT_ARGS = ["--format", "json", "--quiet"];

class FallowClient {
  constructor({ binaryPath, cwd, spawnProcess = spawn }) {
    if (!binaryPath) throw new Error("FallowClient requires a binary path.");
    if (!cwd) throw new Error("FallowClient requires a project root.");

    this.binaryPath = binaryPath;
    this.cwd = cwd;
    this.spawnProcess = spawnProcess;
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

  runJson(args) {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(this.binaryPath, args, {
        cwd: this.cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });
      const stdout = [];
      const stderr = [];

      child.stdout.on("data", (chunk) => stdout.push(chunk));
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.once("error", reject);
      child.once("close", (exitCode) => {
        const output = Buffer.concat(stdout).toString("utf8");
        const errorText = Buffer.concat(stderr).toString("utf8").trim();

        try {
          resolve({ data: JSON.parse(output), exitCode: Number(exitCode) || 0 });
        } catch (error) {
          const detail = errorText ? `${error.message}: ${errorText}` : error.message;
          reject(new Error(`Could not parse Fallow JSON output. ${detail}`));
        }
      });
    });
  }
}

module.exports = {
  FallowClient
};
