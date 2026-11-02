const { buildProjectArchitecture } = require("./projectArchitecture");
const { parseFallowGraph } = require("./fallowGraphAdapter");
const { graphDiagnostics } = require("./architectureDiagnostics");

async function extractArchitectureGraph(client, listOutput, plan, rawReport) {
  const dot = await client.exportGraph();
  const listed = listOutput?.files;
  const count = listOutput?.file_count;
  if (
    !Array.isArray(listed) ||
    listed.some((file) => typeof file !== "string" || !file) ||
    listed.length !== plan.files.length ||
    (count !== undefined && count !== listed.length)
  ) {
    throw new Error("Fallow returned an invalid project file list.");
  }
  const edges = parseFallowGraph(dot, plan.files);
  return buildProjectArchitecture(plan, [], {
    edges,
    diagnostics: graphDiagnostics(listOutput, rawReport),
  });
}

module.exports = { extractArchitectureGraph };
