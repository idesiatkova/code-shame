const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GraphModelBuilder,
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
  assert.equal(graph.edges.every((edge) => edge.type === "imports"), true);
  assert.equal(graph.edges.every((edge) => edge.crossLayer), true);
  assert.equal(graph.crossLayerEdgeCount, 2);
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

test("allows additional node and relationship contributors through composition", () => {
  const plan = createArchitecturePlan({
    listOutput: { files: ["src/components/A.js"] },
    configOutput: {}
  });
  const graph = buildProjectArchitecture(plan, [], {
    nodeContributors: [(_context, builder) => builder.addNode({ id: "custom:node", type: "custom" })],
    relationshipProviders: []
  });

  assert.deepEqual(graph.nodes, [{ id: "custom:node", type: "custom" }]);
});

test("GraphModelBuilder combines repeated relationship weights", () => {
  const builder = new GraphModelBuilder();
  builder.addNode({ id: "a", type: "custom" });
  builder.addNode({ id: "b", type: "custom" });
  builder.addEdge({ id: "a-b", type: "custom", source: "a", target: "b", weight: 1 });
  builder.addEdge({ id: "a-b", type: "custom", source: "a", target: "b", weight: 2 });

  assert.equal(builder.build().edges[0].weight, 3);
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
