const path = require("node:path");

const PUBLIC_ROOT = path.resolve(__dirname, "../public");

function resolvePublicPath(requestPathname) {
  const requestedPath = requestPathname === "/" ? "/index.html" : requestPathname;
  const resolvedPath = path.resolve(PUBLIC_ROOT, `.${decodeURIComponent(requestedPath)}`);
  if (resolvedPath !== PUBLIC_ROOT && !resolvedPath.startsWith(`${PUBLIC_ROOT}${path.sep}`)) {
    throw new Error("Requested path is outside the public root");
  }
  return resolvedPath;
}

module.exports = { resolvePublicPath };
