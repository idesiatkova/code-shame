const {
  DEFAULT_MAX_FILES,
  buildProjectArchitecture,
  createArchitecturePlan
} = require("./projectArchitecture");
const { mapConcurrent } = require("./concurrency");
const { parseFallowGraph } = require("./fallowGraphAdapter");

const DEFAULT_INSPECTION_CONCURRENCY = 4;

class ProjectArchitectureAnalyzer {
  constructor({
    client,
    maxFiles = DEFAULT_MAX_FILES,
    inspectionConcurrency = DEFAULT_INSPECTION_CONCURRENCY
  }) {
    if (!client) throw new Error("ProjectArchitectureAnalyzer requires a Fallow client.");
    this.client = client;
    this.maxFiles = maxFiles;
    this.inspectionConcurrency = inspectionConcurrency;
  }

  async analyze({ rawReport }) {
    const [listResult, configResult] = await Promise.all([
      this.client.listProject(),
      this.client.resolvedConfig()
    ]);
    const plan = createArchitecturePlan({
      listOutput: listResult.data,
      configOutput: configResult.data,
      fileScores: rawReport && rawReport.health && rawReport.health.file_scores,
      maxFiles: this.maxFiles
    });
    let graphError;
    if (typeof this.client.exportGraph === "function") {
      try {
        const dot = await this.client.exportGraph();
        const listed = listResult.data?.files;
        const count = listResult.data?.file_count;
        if (!Array.isArray(listed) || listed.some((file) => typeof file !== "string" || !file)
            || listed.length !== plan.files.length || (count !== undefined && count !== listed.length)) {
          throw new Error("Fallow returned an invalid project file list.");
        }
        const edges = parseFallowGraph(dot, plan.files);
        return buildProjectArchitecture(plan, [], {
          edges,
          diagnostics: graphDiagnostics(listResult.data, rawReport)
        });
      } catch (error) {
        graphError = error;
      }
    }
    const inspections = await mapConcurrent(
      plan.visibleAssignments,
      this.inspectionConcurrency,
      (assignment) => inspectAssignment(this.client, assignment)
    );
    const result = buildProjectArchitecture(plan, inspections);
    const diagnostics = graphDiagnostics(listResult.data, rawReport);
    if (graphError) diagnostics.unshift(`Fallow DOT extraction failed: ${graphError.message || String(graphError)}`);
    result.projectGraph.diagnostics.push(...diagnostics);
    result.projectGraph.complete = result.projectGraph.complete && diagnostics.length === 0;
    return result;
  }

  fallback(error) {
    return {
      state: "failed",
      source: "fallow",
      error: error.message || String(error),
      nodes: [],
      edges: []
    };
  }
}

function graphDiagnostics(listOutput, rawReport) {
  const check = rawReport?.check;
  const diagnostics = [];
  const groups = [listOutput?.workspace_diagnostics, rawReport?.workspace_diagnostics, check?.workspace_diagnostics];
  for (const item of groups.flatMap((group) => Array.isArray(group) ? group : [])) {
    if (item?.degrades_analysis) diagnostics.push(`Fallow analysis degraded: ${item.message || item.kind || "unknown reason"}`);
  }
  const unresolved = check?.summary?.unresolved_imports;
  const imports = Array.isArray(check?.unresolved_imports) ? check.unresolved_imports : [];
  if (unresolved > 0 || imports.length > 0) {
    const detailed = imports.filter((item) => typeof item?.path === "string" && typeof item?.specifier === "string");
    const details = [...new Set(detailed.map((item) => `${item.path}: Fallow could not resolve import ${item.specifier}.`))];
    diagnostics.push("Fallow reported unresolved imports; some dependencies may be missing.");
    diagnostics.push(...details.slice(0, 20));
    const missingDetails = Math.max(0, Number(unresolved) - imports.length || 0) + imports.length - detailed.length + Math.max(0, details.length - 20);
    if (missingDetails > 0) diagnostics.push(`${missingDetails} unresolved import(s) not shown or without details.`);
    if (detailed.length === 0) diagnostics.push("Fallow did not provide file and import details.");
  }
  return [...new Set(diagnostics)];
}

async function inspectAssignment(client, assignment) {
  try {
    const result = await client.inspectFile(assignment.filePath);
    return { filePath: assignment.filePath, report: result.data };
  } catch (error) {
    return {
      filePath: assignment.filePath,
      error: error.message || String(error)
    };
  }
}

module.exports = {
  ProjectArchitectureAnalyzer
};
