const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const { resolvePublicPath } = require("./paths");
const { createScanService } = require("./scanService");

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);
const VENDOR_SCRIPT_PATHS = new Map([
  ["/vendor/cytoscape.js", resolveCytoscapeScriptPath()],
  ["/vendor/lucide.js", resolveLucideScriptPath()]
]);

function createServer({ scanService, ...options } = {}) {
  const scans = scanService || createScanService(options);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const route = `${request.method} ${url.pathname}`;
      if (route === "GET /api/health") return sendJson(response, 200, { ok: true });
      if (route === "GET /api/report") return sendJson(response, 200, scans.getSnapshot());
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
      sendJson(response, 500, { error: error.message || String(error) });
    }
  });
  server.once("close", () => scans.close());
  return server;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
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


module.exports = { createServer };
