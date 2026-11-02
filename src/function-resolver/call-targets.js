const { symbol, property } = require("./symbols");
const { createCommonJsResolver, COMMONJS_VALUE } = require("./commonjs");
const { esmCandidates } = require("./esm-exports");
const { resolveThisTarget } = require("./class-targets");

const MAX_DEPTH = 8;

function createCallResolver(repository) {
  const { load, resolvePath } = repository;
  const { requireFile, requireMutated, commonExport } = createCommonJsResolver({
    resolvePath,
    symbol,
    resolveBinding: bindingTarget,
    resolveExport: exported,
  });
  async function variableTarget(data, binding, file, seen, depth) {
    const p = binding.path;
    const init = p.node.init;
    if (
      init &&
      ["ArrowFunctionExpression", "FunctionExpression"].includes(init.type) &&
      p.node.id.type === "Identifier"
    )
      return symbol(data, init, file);
    if (p.node.id.type === "Identifier" && p.get("init").isMemberExpression()) {
      const initPath = p.get("init");
      const target = requireFile(initPath.get("object"), file);
      const name = property(initPath.node);
      if (target && name && !requireMutated(data, target))
        return exported(target, name, seen, depth + 1);
    }
    return requiredBindingTarget(data, binding, file, seen, depth);
  }
  async function requiredBindingTarget(data, binding, file, seen, depth) {
    const p = binding.path;
    const target = requireFile(p.get("init"), file);
    if (target && !requireMutated(data, target)) {
      if (p.node.id.type === "Identifier") return exported(target, COMMONJS_VALUE, seen, depth + 1);
      if (p.node.id.type === "ObjectPattern") {
        const item = p.node.id.properties.find(
          (prop) =>
            prop.type === "ObjectProperty" &&
            !prop.computed &&
            prop.value.type === "Identifier" &&
            prop.value.name === binding.identifier.name,
        );
        if (item) return exported(target, item.key.name ?? item.key.value, seen, depth + 1);
      }
    }
    return null;
  }
  async function bindingTarget(data, binding, file, seen, depth) {
    if (!binding || !binding.constant) return null;
    const p = binding.path;
    if (p.isFunctionDeclaration()) return symbol(data, p.node, file);
    if (p.isFunctionExpression() && p.node.id?.name === binding.identifier.name)
      return symbol(data, p.node, file);
    if (p.isVariableDeclarator()) return variableTarget(data, binding, file, seen, depth);
    if (p.isImportSpecifier() || p.isImportDefaultSpecifier())
      return importedBindingTarget(p, file, seen, depth);
    return null;
  }
  function importedBindingTarget(p, file, seen, depth) {
    const declaration = p.parentPath.node;
    if (declaration.importKind === "type" || p.node.importKind === "type") return null;
    const target = resolvePath(file, declaration.source.value);
    const name = p.isImportDefaultSpecifier()
      ? "default"
      : p.node.imported.name || p.node.imported.value;
    return target ? exported(target, name, seen, depth + 1) : null;
  }
  async function exported(file, name, seen = new Set(), depth = 0) {
    const visit = `${file}:${name}`;
    if (depth > MAX_DEPTH || seen.has(visit)) return null;
    seen = new Set(seen).add(visit);
    const data = await load(file);
    if (!data || data.unavailable) return null;
    const candidates = await esmCandidates(data, file, name, seen, depth, {
      resolvePath,
      resolveExport: exported,
      resolveBinding: bindingTarget,
      symbol,
    });
    const common = await commonExport(data, file, name, seen, depth);
    if (common) candidates.push(common);
    const unique = new Map(
      candidates.filter(Boolean).map((item) => [JSON.stringify([item.file, item.id]), item]),
    );
    return candidates.every(Boolean) && unique.size === 1 ? [...unique.values()][0] : null;
  }
  async function namespaceTarget(data, p, callee) {
    let target = null;
    const binding = p.scope.getBinding(callee.object.name);
    if (
      binding?.constant &&
      binding.path.isImportNamespaceSpecifier() &&
      binding.path.parentPath.node.importKind !== "type"
    ) {
      const targetFile = resolvePath(data.file, binding.path.parentPath.node.source.value);
      if (targetFile) target = await exported(targetFile, callee.property.name);
    }
    if (
      binding?.constant &&
      binding.path.isVariableDeclarator() &&
      binding.path.node.id.type === "Identifier"
    ) {
      const targetFile = requireFile(binding.path.get("init"), data.file);
      const safe = binding.referencePaths.every((ref) => {
        const member = ref.parentPath;
        return (
          member.isMemberExpression() &&
          member.node.object === ref.node &&
          !member.node.computed &&
          member.parentPath.isCallExpression() &&
          member.parentPath.node.callee === member.node
        );
      });
      if (targetFile && safe && !requireMutated(data, targetFile))
        target = await exported(targetFile, callee.property.name);
    }
    return target;
  }
  async function callTarget(data, p) {
    const callee = p.node.callee;
    if (callee.type === "Identifier")
      return bindingTarget(data, p.scope.getBinding(callee.name), data.file, new Set(), 0);
    if (callee.type === "CallExpression") {
      const targetFile = requireFile(p.get("callee"), data.file);
      return targetFile && !requireMutated(data, targetFile)
        ? exported(targetFile, COMMONJS_VALUE)
        : null;
    }
    if (callee.type !== "MemberExpression") return null;
    if (callee.object.type === "ThisExpression") return resolveThisTarget(data, p, callee);
    if (property(callee) && callee.object.type === "CallExpression") {
      const targetFile = requireFile(p.get("callee.object"), data.file);
      return targetFile && !requireMutated(data, targetFile)
        ? exported(targetFile, property(callee))
        : null;
    }
    if (
      !callee.computed &&
      callee.object.type === "Identifier" &&
      callee.property.type === "Identifier"
    )
      return namespaceTarget(data, p, callee);
    return null;
  }
  async function resolveCalls(data) {
    if (!data || data.unavailable) return;
    const callsByRange = new Map(data.calls.map((call) => [`${call.start}:${call.end}`, call]));
    for (const p of data.callPaths) {
      const call = callsByRange.get(`${p.node.start}:${p.node.end}`);
      if (!call) continue;
      const target = await callTarget(data, p);
      Object.assign(
        call,
        target
          ? { status: "resolved", target }
          : { status: "unresolved", reason: "Target cannot be proven" },
      );
    }
  }
  return { resolveCalls };
}

module.exports = { createCallResolver };
