const { property } = require("./symbols");
const COMMONJS_VALUE = "\0commonjs-value";

function createCommonJsResolver({ resolvePath, symbol, resolveBinding, resolveExport }) {
  function requireFile(p, file) {
    const node = p.node;
    if (
      !p.isCallExpression() ||
      node.callee.type !== "Identifier" ||
      node.callee.name !== "require" ||
      p.scope.getBinding("require") ||
      node.arguments.length !== 1 ||
      node.arguments[0].type !== "StringLiteral"
    )
      return null;
    return resolvePath(file, node.arguments[0].value);
  }
  function requireMutated(data, target) {
    data.requireMutations ||= new Map();
    if (data.requireMutations.has(target)) return data.requireMutations.get(target);
    let unsafe = false;
    data.program.traverse({
      CallExpression(p) {
        if (unsafeRequireUse(data, target, p)) unsafe = true;
      },
    });
    data.requireMutations.set(target, unsafe);
    return unsafe;
  }
  function unsafeRequireUse(data, target, p) {
    if (requireFile(p, data.file) !== target) return;
    const parent = p.parentPath;
    if (parent.isMemberExpression() && parent.node.object === p.node) {
      const use = parent.parentPath;
      return (
        (use.isAssignmentExpression() && use.node.left === parent.node) ||
        use.isUpdateExpression() ||
        (use.isUnaryExpression() && use.node.operator === "delete")
      );
    } else if (parent.isVariableDeclarator() && parent.node.id.type === "Identifier") {
      const binding = parent.scope.getBinding(parent.node.id.name);
      return (
        !binding?.constant ||
        binding.referencePaths.some((ref) => {
          const member = ref.parentPath;
          if (!member.isMemberExpression() || member.node.object !== ref.node)
            return !(member.isCallExpression() && member.node.callee === ref.node);
          const use = member.parentPath;
          return !(use.isCallExpression() && use.node.callee === member.node);
        })
      );
    }
    return (
      !parent.isVariableDeclarator() &&
      !parent.isExpressionStatement() &&
      !(parent.isCallExpression() && parent.node.callee === p.node) &&
      !isModuleReexport(parent, p)
    );
  }
  function isModuleReexport(parent, p) {
    return (
      parent.isAssignmentExpression() &&
      parent.node.right === p.node &&
      parent.get("left").isMemberExpression() &&
      parent.node.left.object.type === "Identifier" &&
      parent.node.left.object.name === "module" &&
      property(parent.node.left) === "exports" &&
      !parent.scope.getBinding("module")
    );
  }
  function commonAssignments(data) {
    let unsafe = false;
    const assignments = [];
    data.program.traverse({
      AssignmentExpression(p) {
        if (
          p.node.left.type === "Identifier" &&
          ["module", "exports"].includes(p.node.left.name) &&
          !p.scope.getBinding(p.node.left.name)
        )
          unsafe = true;
      },
      ReferencedIdentifier(p) {
        if (!["module", "exports"].includes(p.node.name) || p.scope.getBinding(p.node.name)) return;
        let member = p.parentPath;
        if (!member.isMemberExpression() || member.node.object !== p.node) {
          unsafe = true;
          return;
        }
        if (p.node.name === "module") {
          if (property(member.node) !== "exports") {
            unsafe = true;
            return;
          }
          if (
            member.parentPath.isMemberExpression() &&
            member.parentPath.node.object === member.node
          )
            member = member.parentPath;
        }
        const assign = member.parentPath;
        if (
          !assign.isAssignmentExpression({ operator: "=" }) ||
          assign.node.left !== member.node ||
          !assign.parentPath.isExpressionStatement() ||
          !assign.parentPath.parentPath.isProgram()
        ) {
          unsafe = true;
          return;
        }
        assignments.push({ assign, member, root: p.node.name });
      },
    });
    return { assignments, unsafe };
  }
  function wholeCommonValue(data, file, name, right) {
    if (right.isObjectExpression()) return commonObjectValue(right, name);
    const target = right.isCallExpression() && requireFile(right, file);
    if (target)
      return {
        value: requireMutated(data, target) ? null : { reexport: target, name },
        unsafe: false,
      };
    return { value: name === COMMONJS_VALUE ? right : null, unsafe: false };
  }
  function commonObjectValue(right, name) {
    let value = null,
      unsafe = false;
    for (const prop of right.get("properties")) {
      if (
        prop.isSpreadElement() ||
        prop.node.computed ||
        !["ObjectProperty", "ObjectMethod"].includes(prop.node.type)
      ) {
        unsafe = true;
        continue;
      }
      const propName = prop.node.key.name ?? prop.node.key.value;
      if (propName === name)
        value =
          prop.isObjectMethod() && prop.node.kind !== "method"
            ? null
            : prop.isObjectMethod()
              ? prop
              : prop.get("value");
    }
    return { value, unsafe };
  }
  function commonValue(data, file, name) {
    let value = null,
      detached = false;
    const collected = commonAssignments(data);
    let unsafe = collected.unsafe;
    for (const { assign, member, root } of collected.assignments) {
      const whole = root === "module" && member.node.object.type === "Identifier";
      if (whole) {
        detached = true;
        const result = wholeCommonValue(data, file, name, assign.get("right"));
        value = result.value;
        unsafe ||= result.unsafe;
        continue;
      }
      const propName = property(member.node);
      if (!propName) {
        unsafe = true;
        continue;
      }
      if (root === "exports" && detached) continue;
      if (propName === name) value = assign.get("right");
    }
    return unsafe ? null : value;
  }
  async function commonExport(data, file, name, seen, depth) {
    const value = commonValue(data, file, name);
    return value ? resolveCommonValue(data, file, value, seen, depth) : null;
  }
  async function resolveCommonValue(data, file, value, seen, depth) {
    if (value.reexport) return resolveExport(value.reexport, value.name, seen, depth + 1);
    if (value.isIdentifier())
      return resolveBinding(data, value.scope.getBinding(value.node.name), file, seen, depth);
    if (value.isFunctionExpression() || value.isArrowFunctionExpression() || value.isObjectMethod())
      return symbol(data, value.node, file);
    if (value.isMemberExpression()) {
      const target = requireFile(value.get("object"), file);
      const prop = property(value.node);
      if (target && prop && !requireMutated(data, target))
        return resolveExport(target, prop, seen, depth + 1);
    }
    return null;
  }
  return { requireFile, requireMutated, commonExport };
}

module.exports = { createCommonJsResolver, COMMONJS_VALUE };
