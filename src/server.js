const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { resolvePublicPath } = require("./paths");
const { createScanService } = require("./scanService");
const { createResolver } = require("./functionResolver");
const codeShameVersion = require("../package.json").version;
const fallowVersion = require("fallow/package.json").version;

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);
const VENDOR_SCRIPT_PATHS = new Map([
  ["/vendor/cytoscape.js", resolveCytoscapeScriptPath()],
  ["/vendor/cytoscape-dagre.js", require.resolve("cytoscape-dagre")],
  ["/vendor/lucide.js", resolveLucideScriptPath()],
]);

function createServer({ scanService, ...options } = {}) {
  const scans = scanService || createScanService(options);
  const server = http.createServer((request, response) =>
    handleRequest(request, response, scans, options),
  );
  server.once("close", () => scans.close());
  return server;
}

async function handleSourceRequest(response, url, route, scans, options) {
  const snapshot = scans.getSnapshot();
  const resolver = createResolver(options.projectRoot || process.cwd(), snapshot);
  const file = url.searchParams.get("file");
  const result =
    route === "GET /api/source"
      ? await resolver.source(file)
      : await resolver.functionGraph(file, url.searchParams.get("symbol"));
  if (scans.getSnapshot().report !== snapshot.report)
    return sendJson(response, 409, {
      error: "Scan changed while reading source",
      code: "STALE_SCAN",
    });
  return sendJson(response, 200, result);
}

async function handleRequest(request, response, scans, options) {
  try {
    const url = new URL(request.url, "http://localhost");
    const route = `${request.method} ${url.pathname}`;
    if (route === "GET /api/health") return sendJson(response, 200, { ok: true });
    if (route === "GET /api/report") return sendJson(response, 200, scans.getSnapshot());
    if (route === "GET /api/source" || route === "GET /api/function-graph") {
      return await handleSourceRequest(response, url, route, scans, options);
    }
    if (route === "POST /api/scan") {
      scans.start();
      return sendJson(response, 202, scans.getSnapshot());
    }
    if (url.pathname.startsWith("/api/")) {
      return sendJson(response, 404, { error: "Unknown API endpoint" });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" });
      return response.end();
    }
    await serveStatic(response, url.pathname);
  } catch (error) {
    sendJson(response, error.status || 500, {
      error: error.message || String(error),
      ...(error.code ? { code: error.code } : {}),
    });
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function resolveLucideScriptPath() {
  try {
    return require.resolve("lucide/dist/umd/lucide.min.js");
  } catch {
    const manifestPath = require.resolve("lucide/package.json");
    return path.join(path.dirname(manifestPath), "dist", "umd", "lucide.min.js");
  }
}

function resolveCytoscapeScriptPath() {
  const entryPath = require.resolve("cytoscape");
  return path.join(path.dirname(entryPath), "cytoscape.min.js");
}

async function serveStatic(response, pathname) {
  const filePath = VENDOR_SCRIPT_PATHS.get(pathname) || resolvePublicPath(pathname);
  let content = await readStatic(filePath);

  if (!content) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }

  if (filePath === resolvePublicPath("/index.html")) {
    const escapeHtml = (value) =>
      String(value).replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
      );
    content = content
      .toString("utf8")
      .replace("{{CODE_SHAME_VERSION}}", escapeHtml(codeShameVersion))
      .replace("{{FALLOW_VERSION}}", escapeHtml(fallowVersion));
  }

  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": MIME_TYPES.get(path.extname(filePath)) || "application/octet-stream",
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

module.exports = { createServer };
