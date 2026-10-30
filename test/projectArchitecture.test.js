const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildProjectArchitecture,
  createArchitecturePlan
} = require("../src/projectArchitecture");

test("classifies discovered files into architectural layers", () => {
  const plan = createArchitecturePlan({
    listOutput: {
      files: [
        "src/styles/tokens.css",
        "src/store/session.js",
        "src/components/Button.js",
        "src/api/products.js",
        "src/domain/order.js",
        "src/utils/id.js",
        "src/server.js",
        "test/order.test.js"
      ],
      entry_points: [{ path: "src/server.js" }]
    },
    configOutput: {},
    maxFiles: 20
  });

  const layerFor = (filePath) => plan.assignments.find((item) => item.filePath === filePath).layer.id;
  assert.equal(layerFor("src/styles/tokens.css"), "styles");
  assert.equal(layerFor("src/store/session.js"), "state");
  assert.equal(layerFor("src/components/Button.js"), "ui");
  assert.equal(layerFor("src/api/products.js"), "api");
  assert.equal(layerFor("src/domain/order.js"), "domain");
  assert.equal(layerFor("src/utils/id.js"), "shared");
  assert.equal(layerFor("src/server.js"), "server");
  assert.equal(layerFor("test/order.test.js"), "tests");
  assert.equal(plan.assignments.find((item) => item.filePath === "src/server.js").entryPoint, true);
});

test("prefers configured Fallow boundary zones over automatic classification", () => {
  const plan = createArchitecturePlan({
    listOutput: { files: ["src/components/Button.js"] },
    configOutput: {
      boundaries: {
        zones: [{ name: "Presentation", patterns: ["src/components/**"] }]
      }
    }
  });
  const assignment = plan.assignments[0];

  assert.equal(assignment.layer.label, "Presentation");
  assert.equal(assignment.layer.source, "fallow-boundary");
});

test("builds compound nodes and de-duplicated cross-layer import edges", () => {
  const plan = createArchitecturePlan({
    listOutput: {
      files: ["src/components/Button.js", "src/store/session.js", "src/styles/theme.css"],
      entry_points: []
    },
    configOutput: {},
    fileScores: [
      { path: "src/components/Button.js", fan_in: 3, fan_out: 2, lines: 70, maintainability_index: 81 }
    ]
  });
  const inspections = [
    inspection("src/components/Button.js", ["src/store/session.js", "src/styles/theme.css"], []),
    inspection("src/store/session.js", [], ["src/components/Button.js"]),
    inspection("src/styles/theme.css", [], ["src/components/Button.js"])
  ];
  const graph = buildProjectArchitecture(plan, inspections);

  assert.ok(graph.nodes.some((node) => node.type === "layer" && node.layerId === "ui"));
  assert.ok(graph.nodes.some((node) => node.type === "file" && node.id === "file:src/components/Button.js"));
  assert.equal(graph.edges.length, 2);
  assert.equal(graph.edges.every((edge) => edge.weight === 1), true);
  assert.equal(graph.edges.every((edge) => edge.type === "imports"), true);
  assert.equal(graph.edges.every((edge) => edge.crossLayer), true);
  assert.equal(graph.crossLayerEdgeCount, 2);
});

test("preserves known hidden dependencies in the canonical graph while projecting the UI", () => {
  const plan = createArchitecturePlan({
    listOutput: { files: ["./src/A.js", "src\\B.js", "src/C.js"] }, configOutput: {}, maxFiles: 2
  });
  const graph = buildProjectArchitecture(plan, [
    inspection("src/A.js", ["./src/B.js"], []),
    inspection("src/B.js", ["src/C.js", "external-package"], ["src/A.js"])
  ]);
  assert.deepEqual(graph.projectGraph.nodes.map((node) => node.path), ["src/A.js", "src/B.js", "src/C.js", "external-package"]);
  assert.deepEqual(graph.projectGraph.edges.map((edge) => [edge.source, edge.target]), [
    ["src/A.js", "src/B.js"], ["src/B.js", "src/C.js"], ["src/B.js", "external-package"]
  ]);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].weight, 1);
  assert.equal(graph.projectGraph.complete, false);
  assert.ok(graph.projectGraph.diagnostics.some((message) => message.includes("external-package")));
});

test("complete requires a valid unique trace for each listed file", () => {
  const plan = createArchitecturePlan({ listOutput: { files: ["a.js", "b.js"] }, configOutput: {} });
  const incomplete = buildProjectArchitecture(plan, [inspection("a.js", [], []), inspection("a.js", [], []), { filePath: "b.js", report: {} }]);
  assert.equal(incomplete.projectGraph.schemaVersion, 1);
  assert.equal(incomplete.projectGraph.complete, false);
  assert.ok(incomplete.projectGraph.diagnostics.length);
  const complete = buildProjectArchitecture(plan, [inspection("a.js", [], []), inspection("b.js", [], [])]);
  assert.equal(complete.projectGraph.complete, true);
  assert.deepEqual(complete.projectGraph.diagnostics, []);
});

test("preserves valid relationships from a partially malformed trace", () => {
  const plan = createArchitecturePlan({ listOutput: { files: ["a.js", "b.js"] }, configOutput: {} });
  const partial = inspection("a.js", ["b.js"], null);
  const graph = buildProjectArchitecture(plan, [partial, inspection("b.js", [], [])]);
  assert.deepEqual(graph.projectGraph.edges.map(({ source, target }) => [source, target]), [["a.js", "b.js"]]);
  assert.equal(graph.projectGraph.complete, false);
});

test("represents files omitted from a capped graph with summary nodes", () => {
  const plan = createArchitecturePlan({
    listOutput: {
      files: ["src/components/A.js", "src/components/B.js", "src/components/C.js"]
    },
    configOutput: {},
    maxFiles: 1
  });
  const graph = buildProjectArchitecture(plan, []);

  assert.equal(graph.truncated, true);
  assert.equal(graph.visibleFileCount, 1);
  assert.ok(graph.nodes.some((node) => node.type === "summary" && node.hiddenFileCount === 2));
});

function inspection(filePath, importsFrom, importedBy) {
  return {
    filePath,
    report: {
      evidence: {
        trace_file: {
          data: {
            file: filePath,
            imports_from: importsFrom,
            imported_by: importedBy
          }
        }
      }
    }
  };
}
