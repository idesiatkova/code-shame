const {
  DEFAULT_MAX_FILES,
  buildProjectArchitecture,
  createArchitecturePlan,
} = require("./projectArchitecture");
const { inspectAssignments } = require("./architectureInspection");
const { graphDiagnostics } = require("./architectureDiagnostics");
const { extractArchitectureGraph } = require("./architectureGraph");
const { readArchitectureInputs } = require("./fallowClient");

const DEFAULT_INSPECTION_CONCURRENCY = 4;

class ProjectArchitectureAnalyzer {
  constructor({
    client,
    maxFiles = DEFAULT_MAX_FILES,
    inspectionConcurrency = DEFAULT_INSPECTION_CONCURRENCY,
  }) {
    if (!client) throw new Error("ProjectArchitectureAnalyzer requires a Fallow client.");
    this.client = client;
    this.maxFiles = maxFiles;
    this.inspectionConcurrency = inspectionConcurrency;
  }

  async analyze({ rawReport }) {
    const [listResult, configResult] = await readArchitectureInputs(this.client);
    const plan = createArchitecturePlan({
      listOutput: listResult.data,
      configOutput: configResult.data,
      fileScores: rawReport && rawReport.health && rawReport.health.file_scores,
      maxFiles: this.maxFiles,
    });
    let graphError;
    if (typeof this.client.exportGraph === "function") {
      try {
        return await extractArchitectureGraph(this.client, listResult.data, plan, rawReport);
      } catch (error) {
        graphError = error;
      }
    }
    const inspections = await inspectAssignments(
      this.client,
      plan.visibleAssignments,
      this.inspectionConcurrency,
    );
    const result = buildProjectArchitecture(plan, inspections);
    const diagnostics = graphDiagnostics(listResult.data, rawReport);
    if (graphError)
      diagnostics.unshift(
        `Fallow DOT extraction failed: ${graphError.message || String(graphError)}`,
      );
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
      edges: [],
    };
  }
}

module.exports = {
  ProjectArchitectureAnalyzer,
};
