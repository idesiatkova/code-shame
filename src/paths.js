const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");

const PACKAGE_ROOT = path.resolve(__dirname, "..");
const PROJECT_ROOT = path.resolve(process.env.CODE_SCAN_ROOT || process.cwd());
const PUBLIC_ROOT = path.resolve(__dirname, "../public");
const PID_FILE_PATH = path.join(os.tmpdir(), `code-shame-${projectHash(PROJECT_ROOT)}.pid`);

function projectHash(projectRoot) {
  return crypto.createHash("sha256").update(projectRoot).digest("hex").slice(0, 12);
}

function resolvePublicPath(requestPathname) {
  const requestedPath = requestPathname === "/" ? "/index.html" : requestPathname;
  const resolvedPath = path.resolve(PUBLIC_ROOT, `.${decodeURIComponent(requestedPath)}`);

  if (resolvedPath !== PUBLIC_ROOT && !resolvedPath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) {
    throw new Error("Requested path is outside the public root");
  }

  return resolvedPath;
}

module.exports = {
  PACKAGE_ROOT,
  PID_FILE_PATH,
  PROJECT_ROOT,
  resolvePublicPath
};
