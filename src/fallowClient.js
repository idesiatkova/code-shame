const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const MAX_GRAPH_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;

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

  async exportGraph() {
    if (this.signal?.aborted) throw this.signal.reason;
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-graph-"));
    const output = path.join(directory, "graph.dot");
    try {
      await this.runJson(["viz", "--viz-format", "dot", "--no-open", "--out", output, "--quiet"], { output });
      const file = await fs.open(output, "r");
      try {
        const stats = await file.stat();
        if (stats.size > MAX_GRAPH_BYTES) throw new Error("Fallow DOT exceeds the size limit.");
        const buffer = Buffer.alloc(stats.size + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > stats.size) throw new Error("Fallow DOT changed while being read.");
        this.signal?.throwIfAborted();
        return buffer.subarray(0, bytesRead).toString("utf8");
      } finally {
        await file.close();
      }
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  }

  runJson(args, { output } = {}) {
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
      let stoppedError = null;
      let outputBytes = 0;
      let checkingSize = false;
      let sizeTimer;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearInterval(sizeTimer);
        this.signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(result);
      };
      const stop = (error) => {
        if (settled || stoppedError) return;
        stoppedError = error;
        terminateProcessTree(child);
      };
      const abort = () => stop(this.signal.reason || new Error("Fallow command was cancelled."));
      const timer = setTimeout(() => stop(new Error(`Fallow command timed out after ${this.timeoutMs} ms.`)), this.timeoutMs);
      this.signal?.addEventListener("abort", abort, { once: true });
      if (this.signal?.aborted) abort();

      if (output) {
        sizeTimer = setInterval(async () => {
          if (checkingSize || stoppedError) return;
          checkingSize = true;
          try {
            const stats = await fs.stat(output);
            if (stats.size > MAX_GRAPH_BYTES) stop(new Error("Fallow DOT exceeds the size limit."));
          } catch (error) {
            if (error.code !== "ENOENT") stop(error);
          } finally { checkingSize = false; }
        }, 100);
      }
      const collect = (chunks, chunk) => {
        if (settled || stoppedError) return;
        outputBytes += chunk.length;
        if (output && outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
          stop(new Error("Fallow graph command output exceeds the size limit."));
        } else chunks.push(chunk);
      };
      child.stdout.on("data", (chunk) => collect(stdout, chunk));
      child.stderr.on("data", (chunk) => collect(stderr, chunk));
      child.once("error", (error) => finish(error));
      child.once("close", (exitCode, signal) => {
        if (settled) return;
        if (stoppedError) return finish(stoppedError);
        const errorText = Buffer.concat(stderr).toString("utf8").trim();
        if (signal || (exitCode !== 0 && (output || exitCode !== 1))) {
          finish(new Error(`Fallow failed (${signal || `exit ${exitCode}`}). ${errorText}`.trim()));
          return;
        }
        if (output) return finish(null, { exitCode });
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
