const path = require("node:path");
const traverse = require("@babel/traverse").default;
const { exploreSource, parseSource } = require("./sourceExplorer");

const LIMIT = 40;
const NODE_LIMIT = 80;
const EDGE_LIMIT = 200;
const MAX_DEPTH = 8;
const EXTENSIONS = ["", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", "/index.js", "/index.ts", "/index.tsx"];
const key = (file, id) => JSON.stringify([file, id]);
const nodeId = (node) => `${node.type}:${node.start}:${node.end}`;

function createResolver(root, snapshot) {
  const graph = snapshot?.report?.architecture?.projectGraph || {};
  const allowed = new Set((graph.nodes || []).map((node) => node.path));
  const cache = new Map();
  const diagnostics = [];
  let truncated = false;
  function resolvePath(file, specifier) {
    if (!specifier?.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const matches = EXTENSIONS.map((ext) => base + ext).filter((candidate) => allowed.has(candidate));
    return matches.length === 1 ? matches[0] : null;
  }
  async function load(file) {
    if (cache.has(file)) return cache.get(file);
    if (cache.size >= LIMIT) { truncated = true; return null; }
    const promise = (async () => {
      try {
        const result = await exploreSource(root, file, snapshot);
        if (result.diagnostics.length) {
          diagnostics.push({ file, message: "Source has parse diagnostics; resolution unavailable" });
          return { ...result, unavailable: true };
        }
        const ast = parseSource(result.source, file);
        const callPaths = [];
        let program;
        traverse(ast, {
          Program(p) { program = p; },
          CallExpression(p) { callPaths.push(p); },
          OptionalCallExpression(p) { callPaths.push(p); },
          NewExpression(p) { callPaths.push(p); }
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
  function symbol(data, node, file) {
    const found = data.symbols.find((item) => item.id === nodeId(node));
    return found ? { file, hash: data.hash, ...found } : null;
  }
  async function bindingTarget(data, binding, file, seen, depth) {
    if (!binding || !binding.constant) return null;
    const p = binding.path;
    if (p.isFunctionDeclaration()) return symbol(data, p.node, file);
    if (p.isFunctionExpression() && p.node.id?.name === binding.identifier.name) return symbol(data, p.node, file);
    if (p.isVariableDeclarator()) {
      const init = p.node.init;
      if (init && ["ArrowFunctionExpression", "FunctionExpression"].includes(init.type) && p.node.id.type === "Identifier") return symbol(data, init, file);
    }
    if (p.isImportSpecifier() || p.isImportDefaultSpecifier()) {
      const declaration = p.parentPath.node;
      if (declaration.importKind === "type" || p.node.importKind === "type") return null;
      const target = resolvePath(file, declaration.source.value);
      const name = p.isImportDefaultSpecifier() ? "default" : (p.node.imported.name || p.node.imported.value);
      return target ? exported(target, name, seen, depth + 1) : null;
    }
    return null;
  }
  async function exported(file, name, seen = new Set(), depth = 0) {
    const visit = `${file}:${name}`;
    if (depth > MAX_DEPTH || seen.has(visit)) return null;
    seen = new Set(seen).add(visit);
    const data = await load(file);
    if (!data || data.unavailable) return null;
    const candidates = [];
    for (const statement of data.ast.program.body) {
      if (statement.type === "ExportDefaultDeclaration" && name === "default") {
        const decl = statement.declaration;
        if (decl.type === "FunctionDeclaration" && decl.id) candidates.push(await bindingTarget(data, data.program.scope.getBinding(decl.id.name), file, seen, depth));
        else if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(decl.type)) candidates.push(symbol(data, decl, file));
        else if (decl.type === "Identifier") candidates.push(await bindingTarget(data, data.program.scope.getBinding(decl.name), file, seen, depth));
      }
      if (statement.type === "ExportNamedDeclaration" && statement.exportKind !== "type") {
        const decl = statement.declaration;
        if (decl?.type === "FunctionDeclaration" && decl.id?.name === name) candidates.push(await bindingTarget(data, data.program.scope.getBinding(name), file, seen, depth));
        if (decl?.type === "VariableDeclaration") for (const item of decl.declarations) {
          if (item.id.type === "Identifier" && item.id.name === name) candidates.push(await bindingTarget(data, data.program.scope.getBinding(name), file, seen, depth));
        }
        for (const spec of statement.specifiers) {
          if (spec.exportKind === "type" || (spec.exported?.name || spec.exported?.value) !== name) continue;
          const local = spec.local?.name || spec.local?.value;
          const target = statement.source && resolvePath(file, statement.source.value);
          candidates.push(target ? await exported(target, local, seen, depth + 1) : statement.source ? null : await bindingTarget(data, data.program.scope.getBinding(local), file, seen, depth));
        }
      }
      if (statement.type === "ExportAllDeclaration" && statement.exportKind !== "type" && name !== "default") {
        const target = resolvePath(file, statement.source.value);
        candidates.push(target ? await exported(target, name, seen, depth + 1) : null);
      }
    }
    const unique = new Map(candidates.filter(Boolean).map((item) => [key(item.file, item.id), item]));
    return candidates.every(Boolean) && unique.size === 1 ? [...unique.values()][0] : null;
  }
  async function resolveCalls(data) {
    if (!data || data.unavailable) return;
    const callsByRange = new Map(data.calls.map((call) => [`${call.start}:${call.end}`, call]));
    for (let i = 0; i < data.callPaths.length; i++) {
      const p = data.callPaths[i];
      const call = callsByRange.get(`${p.node.start}:${p.node.end}`);
      if (!call) continue;
      let target = null;
      const callee = p.node.callee;
      if (callee.type === "Identifier") target = await bindingTarget(data, p.scope.getBinding(callee.name), data.file, new Set(), 0);
      else if (callee.type === "MemberExpression" && !callee.computed && callee.object.type === "Identifier" && callee.property.type === "Identifier") {
        const binding = p.scope.getBinding(callee.object.name);
        if (binding?.constant && binding.path.isImportNamespaceSpecifier() && binding.path.parentPath.node.importKind !== "type") {
          const targetFile = resolvePath(data.file, binding.path.parentPath.node.source.value);
          if (targetFile) target = await exported(targetFile, callee.property.name);
        }
      }
      Object.assign(call, target ? { status: "resolved", target } : { status: "unresolved", reason: "Target cannot be proven" });
    }
  }
  async function source(file) {
    // Preserve the explorer's path and snapshot errors for the requested file.
    const original = await exploreSource(root, file, snapshot);
    const data = await load(file);
    if (!data || data.unavailable) return { ...original, diagnostics: original.diagnostics.length ? original.diagnostics : [{ message: "Resolution unavailable" }], calls: original.calls.map((call) => ({ ...call, status: "unresolved", reason: "Resolution unavailable" })) };
    await resolveCalls(data);
    return { file: data.file, source: data.source, hash: data.hash, symbols: data.symbols, calls: data.calls, diagnostics: data.diagnostics };
  }
  async function functionGraph(file, id) {
    if (typeof id !== "string" || !id || id.length > 200) throw Object.assign(new Error("Invalid symbol"), { code: "INVALID_SYMBOL", status: 400 });
    const requested = await source(file);
    const selected = requested.symbols.find((s) => s.id === id);
    if (!selected) throw Object.assign(new Error("Symbol not found"), { code: "SYMBOL_NOT_FOUND", status: 404 });
    if (requested.diagnostics.length) throw Object.assign(new Error("Resolution unavailable for this source"), { code: "RESOLUTION_UNAVAILABLE", status: 422 });
    const rootNode = { file, hash: requested.hash, ...selected };
    const nodes = new Map([[key(file, id), rootNode]]);
    const edges = [];
    const unresolved = [];
    const reverse = new Map();
    for (const edge of graph.edges || []) {
      if (!allowed.has(edge.source) || !allowed.has(edge.target)) continue;
      if (!reverse.has(edge.target)) reverse.set(edge.target, []);
      reverse.get(edge.target).push(edge.source);
    }
    const files = [file];
    const discovered = new Set(files);
    for (let i = 0; i < files.length; i++) for (const importer of reverse.get(files[i]) || []) {
      if (discovered.has(importer)) continue;
      discovered.add(importer);
      if (files.length < LIMIT) files.push(importer);
      else truncated = true;
    }
    for (const candidate of files) {
      const data = await load(candidate);
      if (!data || data.unavailable) continue;
      await resolveCalls(data);
      for (const call of data.calls) {
        const outgoing = candidate === file && call.ownerId === id;
        const incoming = call.target?.file === file && call.target?.id === id;
        if (outgoing && call.status === "unresolved") {
          if (unresolved.length < EDGE_LIMIT) unresolved.push({ ...call, file: candidate });
          else truncated = true;
        }
        if ((!outgoing && !incoming) || !call.target || !call.ownerId) continue;
        const owner = data.symbols.find((item) => item.id === call.ownerId);
        if (!owner) continue;
        const newNodes = [key(candidate, owner.id), key(call.target.file, call.target.id)].filter((k, i, all) => all.indexOf(k) === i && !nodes.has(k));
        if (edges.length >= EDGE_LIMIT || nodes.size + newNodes.length > NODE_LIMIT) { truncated = true; continue; }
        nodes.set(key(candidate, owner.id), { file: candidate, hash: data.hash, ...owner });
        nodes.set(key(call.target.file, call.target.id), call.target);
        edges.push({ source: { file: candidate, id: owner.id }, target: { file: call.target.file, id: call.target.id }, file: candidate, line: call.line, column: call.column });
      }
    }
    return { root: rootNode, nodes: [...nodes.values()], edges, unresolved, coverage: { files: [...cache.keys()], limit: LIMIT, nodeLimit: NODE_LIMIT, edgeLimit: EDGE_LIMIT, truncated, incoming: "current file and bounded transitive snapshot importers", snapshotComplete: !!graph.complete }, diagnostics };
  }
  return { source, functionGraph };
}

module.exports = { createResolver };
