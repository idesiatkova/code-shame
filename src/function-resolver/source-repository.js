const path = require("node:path");
const traverse = require("@babel/traverse").default;
const { exploreSource, parseSource } = require("../sourceExplorer");

const LIMIT = 40;
const EXTENSIONS = [
  "",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  "/index.js",
  "/index.ts",
  "/index.tsx",
];

function createSourceRepository(root, snapshot) {
  const graph = snapshot?.report?.architecture?.projectGraph || {};
  const allowed = new Set((graph.nodes || []).map((node) => node.path));
  const cache = new Map();
  const diagnostics = [];
  let truncated = false;
  function resolvePath(file, specifier) {
    if (!specifier?.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const matches = EXTENSIONS.map((ext) => base + ext).filter((candidate) =>
      allowed.has(candidate),
    );
    return matches.length === 1 ? matches[0] : null;
  }
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (cache.size >= LIMIT) {
      truncated = true;
      return null;
    }
    const promise = (async () => {
      try {
        const result = await exploreSource(root, file, snapshot);
        if (result.diagnostics.length) {
          diagnostics.push({
            file,
            message: "Source has parse diagnostics; resolution unavailable",
          });
          return { ...result, unavailable: true };
        }
        const ast = parseSource(result.source, file);
        const callPaths = [];
        let program;
        traverse(ast, {
          Program(p) {
            program = p;
          },
          CallExpression(p) {
            callPaths.push(p);
          },
          OptionalCallExpression(p) {
            callPaths.push(p);
          },
          NewExpression(p) {
            callPaths.push(p);
          },
        });
        return { ...result, ast, program, callPaths };
      } catch (error) {
        diagnostics.push({ file, message: error.message, code: error.code });
        return null;
      }
    })();
    cache.set(file, promise);
    return promise;
  }
  return {
    load,
    resolvePath,
    explore: (file) => exploreSource(root, file, snapshot),
    allowed,
    coverage: () => ({ files: [...cache.keys()], truncated, diagnostics }),
  };
}

module.exports = { createSourceRepository, LIMIT };
