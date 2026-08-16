const assert = require("node:assert/strict");
const test = require("node:test");

const { ProjectArchitectureAnalyzer, mapConcurrent } = require("../src/architectureAnalyzer");

test("architecture analyzer composes Fallow list, config, and inspect queries", async () => {
  const inspected = [];
  const client = {
    listProject: async () => ({ data: { files: ["src/store/session.js", "src/components/App.js"] } }),
    resolvedConfig: async () => ({ data: { boundaries: { zones: [] } } }),
    inspectFile: async (filePath) => {
      inspected.push(filePath);
      return {
        data: {
          evidence: {
            trace_file: { data: { file: filePath, imports_from: [], imported_by: [] } }
          }
        }
      };
    }
  };
  const analyzer = new ProjectArchitectureAnalyzer({ client, inspectionConcurrency: 2 });
  const graph = await analyzer.analyze({ rawReport: { health: { file_scores: [] } } });

  assert.deepEqual(inspected.sort(), ["src/components/App.js", "src/store/session.js"]);
  assert.equal(graph.state, "ready");
  assert.equal(graph.visibleFileCount, 2);
});

test("mapConcurrent preserves input ordering", async () => {
  const results = await mapConcurrent([3, 1, 2], 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, value));
    return value * 10;
  });

  assert.deepEqual(results, [30, 10, 20]);
});
