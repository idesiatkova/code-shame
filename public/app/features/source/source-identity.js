export function hasCallSite(data, symbol, site) {
  return !!(
    site &&
    symbol &&
    site.hash === data.hash &&
    data.calls.some(
      (call) =>
        call.ownerId === symbol.id && call.line === site.line && call.column === site.column,
    )
  );
}

export function matchingSavedState(saved, file, symbol, location) {
  return /^[a-f0-9]{64}$/.test(saved?.sourceHash || "") &&
    saved.file === file &&
    saved.symbol === (symbol || "") &&
    JSON.stringify(saved.location || null) === JSON.stringify(location)
    ? saved
    : null;
}
