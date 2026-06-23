const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { URL } = require("node:url");

const { resolveFallowBinary } = require("./fallowBinary");
const { normalizeFallowReport } = require("./fallowReport");
const { PACKAGE_ROOT, PID_FILE_PATH, PROJECT_ROOT, resolvePublicPath } = require("./paths");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5179);
const FALLOW_ARGS = ["--format", "json", "--quiet"];
const COMMAND_LABEL = "fallow --format json --quiet";
const LUCIDE_SCRIPT_PATH = resolveLucideScriptPath();

let activeScan = null;
let latestSnapshot = {
  state: "idle",
  report: null,
  error: null,
  startedAt: null,
  finishedAt: null
};

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);

const API_ROUTES = new Map([
  ["GET /api/health", handleHealthApi],
  ["GET /api/report", handleReportApi],
  ["POST /api/scan", handleScanApi]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function currentPayload() {
  return {
    ...latestSnapshot,
    running: Boolean(activeScan)
  };
}

function startFallowScan() {
  if (activeScan) return currentPayload();

  const startedAt = new Date();
  latestSnapshot = {
    state: "running",
    report: latestSnapshot.report,
    error: null,
    startedAt: startedAt.toISOString(),
    finishedAt: null
  };

  activeScan = runFallow(startedAt)
    .then((report) => {
      latestSnapshot = {
        state: "ready",
        report,
        error: null,
        startedAt: latestSnapshot.startedAt,
        finishedAt: new Date().toISOString()
      };
    })
    .catch((error) => {
      latestSnapshot = {
        state: "failed",
        report: latestSnapshot.report,
        error: error.message || String(error),
        startedAt: latestSnapshot.startedAt,
        finishedAt: new Date().toISOString()
      };
    })
    .finally(() => {
      activeScan = null;
    });

  return currentPayload();
}

function runFallow(startedAt) {
  return new Promise((resolve, reject) => {
    let command;
    try {
      command = resolveFallowBinary(PACKAGE_ROOT);
    } catch (error) {
      reject(error);
      return;
    }

    const child = spawn(command, FALLOW_ARGS, {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (exitCode) => {
      const finishedAt = Date.now();
      const output = Buffer.concat(stdout).toString("utf8");
      const errorText = Buffer.concat(stderr).toString("utf8").trim();

      try {
        const parsedReport = JSON.parse(output);
        resolve(
          normalizeFallowReport(parsedReport, {
            command: COMMAND_LABEL,
            durationMs: finishedAt - startedAt.getTime(),
            exitCode,
            generatedAt: new Date(finishedAt).toISOString()
          })
        );
      } catch (error) {
        const detail = errorText ? `${error.message}: ${errorText}` : error.message;
        reject(new Error(`Could not parse Fallow JSON output. ${detail}`));
      }
    });
  });
}

function resolveLucideScriptPath() {
  try {
    return require.resolve("lucide/dist/umd/lucide.min.js");
  } catch {
    const manifestPath = require.resolve("lucide/package.json");
    return path.join(path.dirname(manifestPath), "dist", "umd", "lucide.min.js");
  }
}

async function handleHealthApi(_request, response) {
  sendJson(response, 200, { ok: true });
}

async function handleReportApi(_request, response) {
  sendJson(response, 200, currentPayload());
}

async function handleScanApi(_request, response) {
  sendJson(response, 202, startFallowScan());
}

async function handleApi(request, response) {
  const route = API_ROUTES.get(`${request.method} ${new URL(request.url, fallbackOrigin(request)).pathname}`);
  if (!route) {
    sendJson(response, 404, { error: "Unknown API endpoint" });
    return;
  }

  await route(request, response);
}

async function serveStatic(response, pathname) {
  const filePath = pathname === "/vendor/lucide.js"
    ? LUCIDE_SCRIPT_PATH
    : resolvePublicPath(pathname);
  const content = await readStatic(filePath);

  if (!content) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream"
  });
  response.end(content);
}

async function readStatic(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return null;
    throw error;
  }
}

function createServer() {
  return http.createServer(handleRequest);
}

async function handleRequest(request, response) {
  try {
    const url = new URL(request.url, fallbackOrigin(request));
    await routeRequest(request, response, url);
  } catch (error) {
    sendJson(response, 500, { error: error.message || String(error) });
  }
}

async function routeRequest(request, response, url) {
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response);
    return;
  }

  await serveStatic(response, url.pathname);
}

function fallbackOrigin(request) {
  return `http://${request.headers.host || "localhost"}`;
}

function removePreviousPidFile() {
  const previousPid = readPreviousPid();
  if (!previousPid || previousPid === process.pid || !isProcessRunning(previousPid)) {
    removePidFile();
  }
}

function readPreviousPid() {
  const content = readPidFileContent();
  const pid = Number(content);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function readPidFileContent() {
  try {
    return fsSync.readFileSync(PID_FILE_PATH, "utf8").trim();
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function removePidFile() {
  try {
    fsSync.unlinkSync(PID_FILE_PATH);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function writePidFile() {
  fsSync.writeFileSync(PID_FILE_PATH, `${process.pid}\n`, "utf8");
}

function cleanupPidFile() {
  if (readPreviousPid() === process.pid) removePidFile();
}

function startServer(port) {
  const server = createServer();
  attachServerErrorHandler(server, port);
  listenOnPort(server, port);
}

function attachServerErrorHandler(server, port) {
  server.once("error", (error) => handleServerError(port, error));
}

function listenOnPort(server, port) {
  server.listen(port, HOST, () => {
    writePidFile();
    console.log(`Code Shame: http://${HOST}:${port}`);
    console.log(`Project: ${PROJECT_ROOT}`);
  });
}

function handleServerError(port, error) {
  const message = error.code === "EADDRINUSE"
    ? `Code Shame could not start: http://${HOST}:${port} is already in use.`
    : error.stack || error.message || String(error);
  console.error(message);
  process.exitCode = 1;
}

function exitAfterCleanup(exitCode) {
  cleanupPidFile();
  process.exit(exitCode);
}

function registerProcessCleanup() {
  process.once("exit", cleanupPidFile);
  process.once("SIGINT", () => exitAfterCleanup(130));
  process.once("SIGTERM", () => exitAfterCleanup(143));
}

registerProcessCleanup();
removePreviousPidFile();
startServer(PORT);
