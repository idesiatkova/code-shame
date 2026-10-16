const {
  DEFAULT_MAX_FILES,
  buildProjectArchitecture,
  createArchitecturePlan
} = require("./projectArchitecture");
const { mapConcurrent } = require("./concurrency");

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
    const inspections = await mapConcurrent(
      plan.visibleAssignments,
      this.inspectionConcurrency,
      (assignment) => inspectAssignment(this.client, assignment)
    );
    return buildProjectArchitecture(plan, inspections);
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
