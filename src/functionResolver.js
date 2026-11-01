const path = require("node:path");
const traverse = require("@babel/traverse").default;
const { exploreSource, parseSource } = require("./sourceExplorer");

const LIMIT = 40;
const NODE_LIMIT = 80;
const EDGE_LIMIT = 200;
const MAX_DEPTH = 8;
const COMMONJS_VALUE = "\0commonjs-value";
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
  function symbol(data, node, file) {
    const found = data.symbols.find((item) => item.id === nodeId(node));
    return found ? { file, hash: data.hash, ...found } : null;
  }
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
  function property(node) {
    if (!node.computed && node.property?.type === "Identifier") return node.property.name;
    if (node.computed && node.property?.type === "StringLiteral") return node.property.value;
    if (!node.computed && node.property?.type === "PrivateName") return `#${node.property.id.name}`;
    return null;
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
    if (value.reexport) return exported(value.reexport, value.name, seen, depth + 1);
    if (value.isIdentifier())
      return bindingTarget(data, value.scope.getBinding(value.node.name), file, seen, depth);
    if (value.isFunctionExpression() || value.isArrowFunctionExpression() || value.isObjectMethod())
      return symbol(data, value.node, file);
    if (value.isMemberExpression()) {
      const target = requireFile(value.get("object"), file);
      const prop = property(value.node);
      if (target && prop && !requireMutated(data, target))
        return exported(target, prop, seen, depth + 1);
    }
    return null;
  }
  function unsafeClassMutation(data, cls, name, className, classBinding) {
    let unsafe = false;
    const mutates = (node) =>
      node.type === "MemberExpression" &&
      node.object.type === "ThisExpression" &&
      (!property(node) || property(node) === name);
    cls.traverse({
      ThisExpression(q) {
        if (!q.parentPath.isMemberExpression() || q.parentPath.node.object !== q.node)
          unsafe = true;
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
  function thisTarget(data, p, callee) {
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
  async function esmCandidates(data, file, name, seen, depth) {
    const candidates = [];
    for (const statement of data.ast.program.body) {
      if (statement.type === "ExportDefaultDeclaration" && name === "default") {
        candidates.push(
          ...(await defaultCandidates(data, file, seen, depth, statement.declaration)),
        );
      }
      if (statement.type === "ExportNamedDeclaration" && statement.exportKind !== "type") {
        candidates.push(...(await namedCandidates(data, file, name, seen, depth, statement)));
      }
      if (
        statement.type === "ExportAllDeclaration" &&
        statement.exportKind !== "type" &&
        name !== "default"
      ) {
        const target = resolvePath(file, statement.source.value);
        candidates.push(target ? await exported(target, name, seen, depth + 1) : null);
      }
    }
    return candidates;
  }
  async function defaultCandidates(data, file, seen, depth, decl) {
    if (decl.type === "FunctionDeclaration" && decl.id)
      return [
        await bindingTarget(data, data.program.scope.getBinding(decl.id.name), file, seen, depth),
      ];
    if (
      ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(decl.type)
    )
      return [symbol(data, decl, file)];
    if (decl.type === "Identifier")
      return [
        await bindingTarget(data, data.program.scope.getBinding(decl.name), file, seen, depth),
      ];
    return [];
  }
  async function namedCandidates(data, file, name, seen, depth, statement) {
    const candidates = [];
    const decl = statement.declaration;
    if (decl?.type === "FunctionDeclaration" && decl.id?.name === name)
      candidates.push(
        await bindingTarget(data, data.program.scope.getBinding(name), file, seen, depth),
      );
    if (decl?.type === "VariableDeclaration")
      for (const item of decl.declarations) {
        if (item.id.type === "Identifier" && item.id.name === name)
          candidates.push(
            await bindingTarget(data, data.program.scope.getBinding(name), file, seen, depth),
          );
      }
    candidates.push(...(await specifierCandidates(data, file, name, seen, depth, statement)));
    return candidates;
  }
  async function specifierCandidates(data, file, name, seen, depth, statement) {
    const candidates = [];
    for (const spec of statement.specifiers) {
      if (spec.exportKind === "type" || (spec.exported?.name || spec.exported?.value) !== name)
        continue;
      const local = spec.local?.name || spec.local?.value;
      const target = statement.source && resolvePath(file, statement.source.value);
      candidates.push(
        target
          ? await exported(target, local, seen, depth + 1)
          : statement.source
            ? null
            : await bindingTarget(data, data.program.scope.getBinding(local), file, seen, depth),
      );
    }
    return candidates;
  }
  async function exported(file, name, seen = new Set(), depth = 0) {
    const visit = `${file}:${name}`;
    if (depth > MAX_DEPTH || seen.has(visit)) return null;
    seen = new Set(seen).add(visit);
    const data = await load(file);
    if (!data || data.unavailable) return null;
    const candidates = await esmCandidates(data, file, name, seen, depth);
    const common = await commonExport(data, file, name, seen, depth);
    if (common) candidates.push(common);
    const unique = new Map(
      candidates.filter(Boolean).map((item) => [key(item.file, item.id), item]),
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
    if (callee.object.type === "ThisExpression") return thisTarget(data, p, callee);
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
  async function source(file) {
    // Preserve the explorer's path and snapshot errors for the requested file.
    const original = await exploreSource(root, file, snapshot);
    const data = await load(file);
    if (!data || data.unavailable)
      return {
        ...original,
        diagnostics: original.diagnostics.length
          ? original.diagnostics
          : [{ message: "Resolution unavailable" }],
        calls: original.calls.map((call) => ({
          ...call,
          status: "unresolved",
          reason: "Resolution unavailable",
        })),
      };
    await resolveCalls(data);
    return {
      file: data.file,
      source: data.source,
      hash: data.hash,
      symbols: data.symbols,
      calls: data.calls,
      diagnostics: data.diagnostics,
    };
  }
  function importerFiles(file) {
    const reverse = new Map();
    for (const edge of graph.edges || []) {
      if (!allowed.has(edge.source) || !allowed.has(edge.target)) continue;
      if (!reverse.has(edge.target)) reverse.set(edge.target, []);
      reverse.get(edge.target).push(edge.source);
    }
    return collectImporters(file, reverse);
  }
  function collectImporters(file, reverse) {
    const files = [file];
    const discovered = new Set(files);
    for (let i = 0; i < files.length; i++)
      for (const importer of reverse.get(files[i]) || []) {
        if (discovered.has(importer)) continue;
        discovered.add(importer);
        if (files.length < LIMIT) files.push(importer);
        else truncated = true;
      }
    return files;
  }
  function addGraphCall({ call, data, candidate, file, id, nodes, edges, unresolved }) {
    const outgoing = candidate === file && call.ownerId === id;
    const incoming = call.target?.file === file && call.target?.id === id;
    if (outgoing && call.status === "unresolved") {
      if (unresolved.length < EDGE_LIMIT) unresolved.push({ ...call, file: candidate });
      else truncated = true;
    }
    if ((!outgoing && !incoming) || !call.target || !call.ownerId) return;
    const owner = data.symbols.find((item) => item.id === call.ownerId);
    if (!owner) return;
    const newNodes = [key(candidate, owner.id), key(call.target.file, call.target.id)].filter(
      (k, i, all) => all.indexOf(k) === i && !nodes.has(k),
    );
    if (edges.length >= EDGE_LIMIT || nodes.size + newNodes.length > NODE_LIMIT) {
      truncated = true;
      return;
    }
    nodes.set(key(candidate, owner.id), { file: candidate, hash: data.hash, ...owner });
    nodes.set(key(call.target.file, call.target.id), call.target);
    edges.push({
      source: { file: candidate, id: owner.id },
      target: { file: call.target.file, id: call.target.id },
      file: candidate,
      line: call.line,
      column: call.column,
    });
  }
  async function functionGraph(file, id) {
    if (typeof id !== "string" || !id || id.length > 200)
      throw Object.assign(new Error("Invalid symbol"), { code: "INVALID_SYMBOL", status: 400 });
    const requested = await source(file);
    const selected = requested.symbols.find((s) => s.id === id);
    if (!selected)
      throw Object.assign(new Error("Symbol not found"), { code: "SYMBOL_NOT_FOUND", status: 404 });
    if (requested.diagnostics.length)
      throw Object.assign(new Error("Resolution unavailable for this source"), {
        code: "RESOLUTION_UNAVAILABLE",
        status: 422,
      });
    const rootNode = { file, hash: requested.hash, ...selected };
    const nodes = new Map([[key(file, id), rootNode]]);
    const edges = [];
    const unresolved = [];
    for (const candidate of importerFiles(file)) {
      const data = await load(candidate);
      if (!data || data.unavailable) continue;
      await resolveCalls(data);
      for (const call of data.calls) {
        addGraphCall({ call, data, candidate, file, id, nodes, edges, unresolved });
      }
    }
    return {
      root: rootNode,
      nodes: [...nodes.values()],
      edges,
      unresolved,
      coverage: {
        files: [...cache.keys()],
        limit: LIMIT,
        nodeLimit: NODE_LIMIT,
        edgeLimit: EDGE_LIMIT,
        truncated,
        incoming: "current file and bounded transitive snapshot importers",
        snapshotComplete: !!graph.complete,
      },
      diagnostics,
    };
  }
  return { source, functionGraph };
}

module.exports = { createResolver };
