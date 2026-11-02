const { property, symbol } = require("./symbols");

function unsafeClassMutation(data, cls, name, className, classBinding) {
  let unsafe = false;
  const mutates = (node) =>
    node.type === "MemberExpression" &&
    node.object.type === "ThisExpression" &&
    (!property(node) || property(node) === name);
  cls.traverse({
    ThisExpression(q) {
      if (!q.parentPath.isMemberExpression() || q.parentPath.node.object !== q.node) unsafe = true;
    },
    AssignmentExpression(q) {
      if (mutates(q.node.left)) unsafe = true;
    },
    UpdateExpression(q) {
      if (mutates(q.node.argument)) unsafe = true;
    },
    UnaryExpression(q) {
      if (q.node.operator === "delete" && mutates(q.node.argument)) unsafe = true;
    },
  });
  if (className)
    data.program.traverse({
      Class(q) {
        if (q.node.superClass?.type === "Identifier" && q.node.superClass.name === className)
          unsafe = true;
      },
      MemberExpression(q) {
        if (
          q.node.object.type !== "Identifier" ||
          q.node.object.name !== className ||
          q.scope.getBinding(className) !== classBinding
        )
          return;
        if (property(q.node) === "prototype") unsafe = true;
        const parent = q.parentPath;
        if (
          (!property(q.node) || property(q.node) === name) &&
          ((parent.isAssignmentExpression() && parent.node.left === q.node) ||
            parent.isUpdateExpression() ||
            (parent.isUnaryExpression() && parent.node.operator === "delete"))
        )
          unsafe = true;
      },
    });
  return unsafe || unsafeClassReferences(classBinding);
}
function unsafeClassReferences(classBinding) {
  let unsafe = false;
  for (const ref of classBinding?.referencePaths || []) {
    const parent = ref.parentPath;
    if (parent.isCallExpression() && parent.node.callee !== ref.node) unsafe = true;
    if (parent.isVariableDeclarator() && parent.node.init === ref.node) unsafe = true;
    if (
      parent.isNewExpression() &&
      parent.node.callee === ref.node &&
      parent.parentPath.isVariableDeclarator()
    ) {
      if (unsafeInstance(parent)) unsafe = true;
    }
  }
  return unsafe;
}
function unsafeInstance(parent) {
  const id = parent.parentPath.node.id;
  const instance = id.type === "Identifier" && parent.scope.getBinding(id.name);
  return (
    !instance?.constant ||
    instance.referencePaths.some((use) => {
      const member = use.parentPath;
      return (
        !member.isMemberExpression() ||
        member.node.object !== use.node ||
        !member.parentPath.isCallExpression() ||
        member.parentPath.node.callee !== member.node
      );
    })
  );
}
function classContext(p) {
  let context = p.parentPath;
  while (
    context &&
    !context.isClassMethod() &&
    !context.isClassPrivateMethod() &&
    !context.isClassProperty() &&
    !context.isClassPrivateProperty()
  ) {
    if (context.isFunction() && !context.isArrowFunctionExpression()) return null;
    context = context.parentPath;
  }
  return context;
}
function classMember(cls, context, name) {
  const matches = cls.get("body.body").filter((member) => {
    const node = member.node;
    const memberName =
      node.key?.type === "PrivateName"
        ? `#${node.key.id.name}`
        : !node.computed
          ? node.key?.name
          : null;
    return memberName === name && !!node.static === !!context.node.static;
  });
  return matches.length === 1 ? matches[0] : null;
}
function resolveThisTarget(data, p, callee) {
  const name = property(callee);
  if (!name || callee.object.type !== "ThisExpression") return null;
  const context = classContext(p);
  if (!context) return null;
  const cls = context.parentPath.parentPath;
  if (!cls?.isClass() || cls.node.superClass) return null;
  const className =
    cls.parentPath.isVariableDeclarator() && cls.parentPath.node.id.type === "Identifier"
      ? cls.parentPath.node.id.name
      : cls.node.id?.name;
  const classBinding =
    className && (cls.parentPath.scope.getBinding(className) || cls.scope.getBinding(className));
  const member = classMember(cls, context, name);
  if (!member || unsafeClassMutation(data, cls, name, className, classBinding)) return null;
  return classMemberSymbol(data, member);
}
function classMemberSymbol(data, member) {
  if ((member.isClassMethod() || member.isClassPrivateMethod()) && member.node.kind === "method")
    return symbol(data, member.node, data.file);
  if (
    (member.isClassProperty() || member.isClassPrivateProperty()) &&
    member.get("value").isArrowFunctionExpression()
  )
    return symbol(data, member.node.value, data.file);
  return null;
}

module.exports = { resolveThisTarget };
