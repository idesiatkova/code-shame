const assert = require("node:assert/strict");
const test = require("node:test");

const { ProjectArchitectureAnalyzer } = require("../src/architectureAnalyzer");
const { mapConcurrent } = require("../src/concurrency");

test("architecture analyzer composes Fallow list, config, and inspect queries", async () => {
  const inspected = [];
  const client = {
    listProject: async () => ({
      data: { files: ["src/store/session.js", "src/components/App.js"] },
    }),
    resolvedConfig: async () => ({ data: { boundaries: { zones: [] } } }),
    inspectFile: async (filePath) => {
      inspected.push(filePath);
      return {
        data: {
          evidence: {
            trace_file: { data: { file: filePath, imports_from: [], imported_by: [] } },
          },
        },
      };
    },
  };
  const analyzer = new ProjectArchitectureAnalyzer({ client, inspectionConcurrency: 2 });
  const graph = await analyzer.analyze({ rawReport: { health: { file_scores: [] } } });

  assert.deepEqual(inspected.sort(), ["src/components/App.js", "src/store/session.js"]);
  assert.equal(graph.state, "ready");
  assert.equal(graph.visibleFileCount, 2);
  assert.equal(graph.projectGraph.complete, true);
});

test("architecture input queries start together", async () => {
  const started = [];
  let finishList;
  const client = {
    listProject: () => {
      started.push("list");
      return new Promise((resolve) => {
        finishList = resolve;
      });
    },
    resolvedConfig: async () => {
      started.push("config");
      return { data: {} };
    },
  };
  const analysis = new ProjectArchitectureAnalyzer({ client }).analyze({});
  assert.deepEqual(started, ["list", "config"]);
  finishList({ data: { files: [] } });
  assert.equal((await analysis).state, "ready");
});

test("a capped scan reports partial coverage even when every requested inspection succeeds", async () => {
  const client = {
    listProject: async () => ({ data: { files: ["a.js", "b.js"] } }),
    resolvedConfig: async () => ({ data: {} }),
    inspectFile: async (file) => ({
      data: {
        evidence: { trace_file: { data: { file, imports_from: ["b.js"], imported_by: [] } } },
      },
    }),
  };
  const graph = await new ProjectArchitectureAnalyzer({ client, maxFiles: 1 }).analyze({});
  assert.equal(graph.projectGraph.complete, false);
  assert.equal(graph.projectGraph.nodes.length, 2);
  assert.equal(graph.projectGraph.edges.length, 1);
  assert.equal(graph.edges.length, 0);
});

test("mapConcurrent preserves input ordering", async () => {
  const results = await mapConcurrent([3, 1, 2], 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, value));
    return value * 10;
  });

  assert.deepEqual(results, [30, 10, 20]);
});

test("unresolved import summaries disclose when details are unavailable", async () => {
  const client = {
    listProject: async () => ({ data: { files: [] } }),
    resolvedConfig: async () => ({ data: {} }),
    exportGraph: async () => "digraph fallow {}",
  };
  const graph = await new ProjectArchitectureAnalyzer({ client }).analyze({
    rawReport: { check: { summary: { unresolved_imports: 3 } } },
  });
  assert.equal(graph.projectGraph.complete, false);
  assert.match(
    graph.projectGraph.diagnostics.join(" "),
    /3 unresolved import\(s\) not shown or without details/,
  );
  assert.match(graph.projectGraph.diagnostics.join(" "), /did not provide file and import details/);
  const many = await new ProjectArchitectureAnalyzer({ client }).analyze({
    rawReport: {
      check: {
        unresolved_imports: Array.from({ length: 21 }, (_, i) => ({
          path: `file${i}.js`,
          specifier: "./missing",
        })),
      },
    },
  });
  assert.equal(
    many.projectGraph.diagnostics.filter((item) => item.includes("could not resolve")).length,
    20,
  );
  assert.match(
    many.projectGraph.diagnostics.join(" "),
    /1 unresolved import\(s\) not shown or without details/,
  );
  const repeated = await new ProjectArchitectureAnalyzer({ client }).analyze({
    rawReport: {
      check: {
        unresolved_imports: [
          ...Array.from({ length: 20 }, (_, line) => ({
            path: "same.js",
            specifier: "missing",
            line,
          })),
          { path: "other.js", specifier: "other-missing" },
        ],
      },
    },
  });
  assert.equal(
    repeated.projectGraph.diagnostics.filter((item) => item.includes("could not resolve")).length,
    2,
  );
  assert.ok(repeated.projectGraph.diagnostics.some((item) => item.includes("other.js")));
  assert.ok(!repeated.projectGraph.diagnostics.some((item) => item.includes("not shown")));
});
