const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs/promises");

const MAX_GRAPH_BYTES = 16 * 1024 * 1024;
const MAX_COMMAND_OUTPUT_BYTES = 4 * 1024 * 1024;

function runFallowCommand(client, args, { output } = {}) {
  if (client.signal?.aborted) return Promise.reject(client.signal.reason);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [client.launcherPath, ...args], {
      cwd: client.cwd,
      env: process.env,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
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
      client.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(result);
    };
    const stop = (error) => {
      if (settled || stoppedError) return;
      stoppedError = error;
      terminateProcessTree(child);
    };
    const abort = () => stop(client.signal.reason || new Error("Fallow command was cancelled."));
    const timer = setTimeout(
      () => stop(new Error(`Fallow command timed out after ${client.timeoutMs} ms.`)),
      client.timeoutMs,
    );
    client.signal?.addEventListener("abort", abort, { once: true });
    if (client.signal?.aborted) abort();

    if (output) {
      sizeTimer = setInterval(async () => {
        if (checkingSize || stoppedError) return;
        checkingSize = true;
        try {
          const stats = await fs.stat(output);
          if (stats.size > MAX_GRAPH_BYTES) stop(new Error("Fallow DOT exceeds the size limit."));
        } catch (error) {
          if (error.code !== "ENOENT") stop(error);
        } finally {
          checkingSize = false;
        }
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

module.exports = { runFallowCommand, MAX_GRAPH_BYTES };
