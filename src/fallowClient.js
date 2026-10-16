const { spawn, execFile } = require("node:child_process");

const JSON_OUTPUT_ARGS = ["--format", "json", "--quiet"];

class FallowClient {
  constructor({ cwd, signal, timeoutMs = 60000 }) {
    if (!cwd) throw new Error("FallowClient requires a project root.");
    this.cwd = cwd;
    this.signal = signal;
    this.timeoutMs = timeoutMs;
    this.launcherPath = require.resolve("fallow/bin/fallow");
  }

  analyze() { return this.runJson(JSON_OUTPUT_ARGS); }
  listProject() { return this.runJson(["list", ...JSON_OUTPUT_ARGS]); }
  resolvedConfig() { return this.runJson(["config", ...JSON_OUTPUT_ARGS]); }
  inspectFile(filePath) { return this.runJson(["inspect", "--file", filePath, ...JSON_OUTPUT_ARGS]); }

  runJson(args) {
    if (this.signal?.aborted) return Promise.reject(this.signal.reason);
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [this.launcherPath, ...args], {
        cwd: this.cwd,
        env: process.env,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      });
      const stdout = [];
      const stderr = [];
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(result);
      };
      const stop = (error) => {
        terminateProcessTree(child);
        finish(error);
      };
      const abort = () => stop(this.signal.reason || new Error("Fallow command was cancelled."));
      const timer = setTimeout(() => stop(new Error(`Fallow command timed out after ${this.timeoutMs} ms.`)), this.timeoutMs);
      this.signal?.addEventListener("abort", abort, { once: true });
      if (this.signal?.aborted) abort();

      child.stdout.on("data", (chunk) => { if (!settled) stdout.push(chunk); });
      child.stderr.on("data", (chunk) => { if (!settled) stderr.push(chunk); });
      child.once("error", (error) => finish(error));
      child.once("close", (exitCode, signal) => {
        if (settled) return;
        const errorText = Buffer.concat(stderr).toString("utf8").trim();
        if (signal || (exitCode !== 0 && exitCode !== 1)) {
          finish(new Error(`Fallow failed (${signal || `exit ${exitCode}`}). ${errorText}`.trim()));
          return;
        }
        try {
          finish(null, { data: JSON.parse(Buffer.concat(stdout).toString("utf8")), exitCode });
        } catch (error) {
          finish(new Error(`Could not parse Fallow JSON output. ${errorText || error.message}`));
        }
      });
    });
  }
}

function terminateProcessTree(child) {
  if (!child.pid) return;
  // The upstream launcher owns a native child; terminate both on cancellation.
  if (process.platform === "win32") {
    execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], (error) => {
      if (error) child.kill("SIGKILL");
    });
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") child.kill("SIGKILL");
  }
}

module.exports = { FallowClient };
