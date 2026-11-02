async function esmCandidates(
  data,
  file,
  name,
  seen,
  depth,
  { resolvePath, resolveExport, resolveBinding, symbol },
) {
  const candidates = [];
  for (const statement of data.ast.program.body) {
    if (statement.type === "ExportDefaultDeclaration" && name === "default") {
      candidates.push(
        ...(await defaultCandidates(data, file, seen, depth, statement.declaration, {
          resolveBinding,
          symbol,
        })),
      );
    }
    if (statement.type === "ExportNamedDeclaration" && statement.exportKind !== "type") {
      candidates.push(
        ...(await namedCandidates(data, file, name, seen, depth, statement, {
          resolvePath,
          resolveExport,
          resolveBinding,
        })),
      );
    }
    if (
      statement.type === "ExportAllDeclaration" &&
      statement.exportKind !== "type" &&
      name !== "default"
    ) {
      const target = resolvePath(file, statement.source.value);
      candidates.push(target ? await resolveExport(target, name, seen, depth + 1) : null);
    }
  }
  return candidates;
}

async function defaultCandidates(data, file, seen, depth, decl, { resolveBinding, symbol }) {
  if (decl.type === "FunctionDeclaration" && decl.id)
    return [
      await resolveBinding(data, data.program.scope.getBinding(decl.id.name), file, seen, depth),
    ];
  if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(decl.type))
    return [symbol(data, decl, file)];
  if (decl.type === "Identifier")
    return [
      await resolveBinding(data, data.program.scope.getBinding(decl.name), file, seen, depth),
    ];
  return [];
}
async function namedCandidates(
  data,
  file,
  name,
  seen,
  depth,
  statement,
  { resolvePath, resolveExport, resolveBinding },
) {
  const candidates = [];
  const decl = statement.declaration;
  if (decl?.type === "FunctionDeclaration" && decl.id?.name === name)
    candidates.push(
      await resolveBinding(data, data.program.scope.getBinding(name), file, seen, depth),
    );
  if (decl?.type === "VariableDeclaration")
    for (const item of decl.declarations) {
      if (item.id.type === "Identifier" && item.id.name === name)
        candidates.push(
          await resolveBinding(data, data.program.scope.getBinding(name), file, seen, depth),
        );
    }
  candidates.push(
    ...(await specifierCandidates(data, file, name, seen, depth, statement, {
      resolvePath,
      resolveExport,
      resolveBinding,
    })),
  );
  return candidates;
}
async function specifierCandidates(
  data,
  file,
  name,
  seen,
  depth,
  statement,
  { resolvePath, resolveExport, resolveBinding },
) {
  const candidates = [];
  for (const spec of statement.specifiers) {
    if (spec.exportKind === "type" || (spec.exported?.name || spec.exported?.value) !== name)
      continue;
    const local = spec.local?.name || spec.local?.value;
    const target = statement.source && resolvePath(file, statement.source.value);
    candidates.push(
      target
        ? await resolveExport(target, local, seen, depth + 1)
        : statement.source
          ? null
          : await resolveBinding(data, data.program.scope.getBinding(local), file, seen, depth),
    );
  }
  return candidates;
}

module.exports = { esmCandidates };
