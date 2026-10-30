const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { parse } = require("@babel/parser");

const MAX_BYTES = 512 * 1024;
const EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);

function sourceError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

async function exploreSource(root, file, snapshot) {
  if (typeof file !== "string" || !file || file.includes("\0") || path.isAbsolute(file) || file.includes("\\") || file.split("/").some((part) => part === ".." || part === "." || !part)) {
    throw sourceError("INVALID_PATH", "Invalid project-relative path");
  }
  if (!EXTENSIONS.has(path.extname(file).toLowerCase())) throw sourceError("UNSUPPORTED_FILE", "Unsupported source file");
  const nodes = snapshot?.report?.architecture?.projectGraph?.nodes;
  if (!Array.isArray(nodes) || !nodes.some((node) => node.path === file)) throw sourceError("NOT_IN_SNAPSHOT", "File is not in the current scan", 404);
  let handle;
  let bytes;
  try {
    const realRoot = await fs.realpath(root);
    const realFile = await fs.realpath(path.join(realRoot, file));
    const relative = path.relative(realRoot, realFile);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw sourceError("OUTSIDE_ROOT", "File is outside the project");
    handle = await fs.open(realFile, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) throw sourceError("NOT_FILE", "Path is not a regular file");
    if (stat.size > MAX_BYTES) throw sourceError("TOO_LARGE", "Source file exceeds 512 KiB", 413);
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    if (result.bytesRead > MAX_BYTES) throw sourceError("TOO_LARGE", "Source file exceeds 512 KiB", 413);
    bytes = buffer.subarray(0, result.bytesRead);
  } catch (error) {
    if (error.status) throw error;
    if (["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code)) throw sourceError("NOT_FOUND", "Source file unavailable", 404);
    throw sourceError("READ_FAILED", "Source file could not be read", 500);
  } finally {
    await handle?.close();
  }
  const source = bytes.toString("utf8");
  return { file, source, hash: createHash("sha256").update(bytes).digest("hex"), ...inventory(source, file) };
}

function inventory(source, file) {
  const symbols = [];
  const calls = [];
  const diagnostics = [];
  let ast;
  try {
    const ext = path.extname(file).toLowerCase();
    ast = parse(source, { sourceType: "unambiguous", allowReturnOutsideFunction: true, errorRecovery: true, plugins: [...(/\.[cm]?tsx?$/.test(ext) ? ["typescript"] : []), ...([".jsx", ".tsx", ".js"].includes(ext) ? ["jsx"] : []), "decorators-legacy"] });
    diagnostics.push(...ast.errors.map((error) => ({ message: error.message, line: error.loc?.line, column: error.loc?.column + 1 })));
  } catch (error) {
    return { symbols, calls, diagnostics: [{ message: error.message, line: error.loc?.line, column: error.loc?.column + 1 }] };
  }
  function visit(node, parent, ownerId) {
    if (!node || typeof node !== "object" || typeof node.type !== "string") return;
    const kinds = { FunctionDeclaration: "function", FunctionExpression: "function", ArrowFunctionExpression: "arrow", ClassDeclaration: "class", ClassExpression: "class", ClassMethod: "method", ClassPrivateMethod: "method", ObjectMethod: "method", TSDeclareFunction: "function", TSDeclareMethod: "method" };
    const kind = kinds[node.type];
    if (kind) {
      const named = node.id || node.key || (parent?.type === "VariableDeclarator" ? parent.id : null) || (parent?.type === "ClassProperty" || parent?.type === "ObjectProperty" ? parent.key : null);
      const name = named ? source.slice(named.start, named.end) : "<anonymous>";
      const id = `${node.type}:${node.start}:${node.end}`;
      const signatureEnd = node.body?.start ?? node.end;
      symbols.push({ id, name, kind, parentId: ownerId, startLine: node.loc.start.line, endLine: node.loc.end.line, signature: source.slice(node.start, signatureEnd).trim() });
      ownerId = id;
    }
    if (["CallExpression", "OptionalCallExpression", "NewExpression"].includes(node.type)) {
      calls.push({ name: source.slice(node.callee.start, node.callee.end), line: node.loc.start.line, column: node.loc.start.column + 1, ownerId });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach((child) => visit(child, node, ownerId));
      else if (value && typeof value === "object" && typeof value.type === "string") visit(value, node, ownerId);
    }
  }
  visit(ast.program, null, null);
  return { symbols, calls, diagnostics };
}

module.exports = { exploreSource, inventory, MAX_BYTES };
