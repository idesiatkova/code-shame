export function createSymbolContext(symbols = []) {
  const byId = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const nameOf = (symbol) =>
    typeof symbol?.name === "string" && symbol.name ? symbol.name : "<anonymous>";
  const ownerName = (symbol) => {
    const name = nameOf(symbol);
    return name === "<anonymous>" && Number.isInteger(symbol.startLine)
      ? `${name} · line ${symbol.startLine}`
      : name;
  };

  function describe(symbolOrId) {
    const symbol =
      typeof symbolOrId === "object" && symbolOrId !== null ? symbolOrId : byId.get(symbolOrId);
    if (!symbol) return { label: "", ownerPath: "", searchText: "" };
    const owners = [],
      seen = new Set([symbol.id]);
    let parentId = symbol.parentId;
    while (parentId != null && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      owners.unshift(ownerName(parent));
      parentId = parent.parentId;
    }
    const ownerPath = owners.join(".");
    const name = nameOf(symbol);
    const label =
      name === "<anonymous>"
        ? `${name}${ownerPath ? ` in ${ownerPath}` : ""}${Number.isInteger(symbol.startLine) ? ` · line ${symbol.startLine}` : ""}`
        : [ownerPath, name].filter(Boolean).join(".");
    const searchText = [name, symbol.kind, symbol.signature, ownerPath, label]
      .filter((value) => typeof value === "string")
      .join(" ");
    return { label, ownerPath, searchText };
  }

  return { describe };
}
