export function readLocation(params) {
  const fields = ["line", "column", "hash"];
  if (!fields.some((field) => params.has(field))) return { location: null, invalid: false };
  const line = Number(params.get("line")),
    column = Number(params.get("column")),
    hash = params.get("hash");
  const valid =
    fields.every((field) => params.has(field)) &&
    Number.isSafeInteger(line) &&
    line > 0 &&
    Number.isSafeInteger(column) &&
    column > 0 &&
    /^[a-f0-9]{64}$/.test(hash || "");
  return { location: valid ? { line, column, hash } : null, invalid: !valid };
}
