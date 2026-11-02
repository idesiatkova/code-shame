function graphDiagnostics(listOutput, rawReport) {
  const check = rawReport?.check;
  const diagnostics = [];
  const groups = [
    listOutput?.workspace_diagnostics,
    rawReport?.workspace_diagnostics,
    check?.workspace_diagnostics,
  ];
  for (const item of groups.flatMap((group) => (Array.isArray(group) ? group : []))) {
    if (item?.degrades_analysis)
      diagnostics.push(
        `Fallow analysis degraded: ${item.message || item.kind || "unknown reason"}`,
      );
  }
  const unresolved = check?.summary?.unresolved_imports;
  const imports = Array.isArray(check?.unresolved_imports) ? check.unresolved_imports : [];
  if (unresolved > 0 || imports.length > 0) {
    const detailed = imports.filter(
      (item) => typeof item?.path === "string" && typeof item?.specifier === "string",
    );
    const details = [
      ...new Set(
        detailed.map((item) => `${item.path}: Fallow could not resolve import ${item.specifier}.`),
      ),
    ];
    diagnostics.push("Fallow reported unresolved imports; some dependencies may be missing.");
    diagnostics.push(...details.slice(0, 20));
    const missingDetails =
      Math.max(0, Number(unresolved) - imports.length || 0) +
      imports.length -
      detailed.length +
      Math.max(0, details.length - 20);
    if (missingDetails > 0)
      diagnostics.push(`${missingDetails} unresolved import(s) not shown or without details.`);
    if (detailed.length === 0) diagnostics.push("Fallow did not provide file and import details.");
  }
  return [...new Set(diagnostics)];
}

module.exports = { graphDiagnostics };
