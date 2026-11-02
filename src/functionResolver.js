const { createSourceRepository } = require("./function-resolver/source-repository");
const { createCallResolver } = require("./function-resolver/call-targets");
const { createFunctionGraph } = require("./function-resolver/function-graph");

function createResolver(root, snapshot) {
  const repository = createSourceRepository(root, snapshot);
  const { load } = repository;
  const { resolveCalls } = createCallResolver(repository);
  async function source(file) {
    // Preserve the explorer's path and snapshot errors for the requested file.
    const original = await repository.explore(file);
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
  const functionGraph = createFunctionGraph({
    repository,
    resolveCalls,
    source,
    snapshotGraph: snapshot?.report?.architecture?.projectGraph || {},
  });
  return { source, functionGraph };
}

module.exports = { createResolver };
