import assert from "node:assert/strict";
import test from "node:test";
import { createDemoModel } from "./helpers/architecture-fixtures.mjs";

test("projects full graph, including hidden files, with unique directed dependencies", async () => {
  const { overview } =
    await import("../public/app/features/architecture/architectureProjection.js");
  const { focus } = await import("../public/app/features/architecture/graph/neighborhood.js");
  const model = createDemoModel();
  model.nodes = model.nodes.filter((node) => node.path !== "domain/checkout.ts");
  model.projectGraph.edges.push({ ...model.projectGraph.edges[3], kind: "dynamic" });
  const map = overview(model);
  assert.equal(map.edgeCount, 8);
  assert.ok(map.edges.every((edge) => edge.source !== edge.target));
  assert.equal(
    map.edges.find((edge) => edge.source === "layer:ui" && edge.target === "layer:domain").weight,
    2,
  );
  const out = focus(model, "ui/Checkout.tsx", "outbound", 2);
  assert.ok(out.nodes.some((node) => node.path === "api/checkout-api.ts"));
  assert.ok(
    !focus(model, "ui/Checkout.tsx", "outbound", 1).nodes.some(
      (node) => node.path === "api/checkout-api.ts",
    ),
  );
  assert.ok(
    focus(model, "domain/checkout.ts", "inbound", 1).nodes.some(
      (node) => node.path === "ui/Checkout.tsx",
    ),
  );
  const neighborhood = focus(model, "domain/checkout.ts", "both", 1);
  assert.ok(
    neighborhood.edges.every(
      (edge) =>
        edge.source === "file:domain/checkout.ts" || edge.target === "file:domain/checkout.ts",
    ),
  );
  const capped = focus(model, "ui/Checkout.tsx", "outbound", 2, 1);
  assert.equal(capped.shownFiles, 1);
  assert.ok(capped.totalFiles > capped.shownFiles);
  model.projectGraph.complete = false;
  model.projectGraph.nodes.push({ id: "unknown", path: "unknown", layerId: null });
  assert.equal(overview(model).complete, false);
  assert.ok(overview(model).nodes.some((node) => node.label === "Unknown layer"));
});

test("directory graph aggregates canonical imports between immediate children", async () => {
  const { directoryGraph, directoryPage } =
    await import("../public/app/features/architecture/architectureProjection.js");
  const paths = ["src/a.js", "src/nested/b.js", "src/nested/c.js", "test/a.js", "root.js"];
  const model = {
    nodes: [],
    projectGraph: {
      complete: false,
      nodes: paths.map((path) => ({ id: path, path })),
      edges: [
        { source: paths[0], target: paths[1] },
        { source: paths[0], target: paths[2] },
        { source: paths[1], target: paths[2] },
        { source: paths[3], target: paths[0] },
      ],
    },
  };
  const root = directoryGraph(model);
  assert.deepEqual(
    root.nodes.map((node) => node.path),
    ["root.js", "src", "test"],
  );
  assert.equal(root.edges.length, 1);
  assert.equal(root.complete, false);
  const nested = directoryGraph(model, "src");
  assert.deepEqual(
    nested.nodes.map((node) => [node.path, node.type]),
    [
      ["src/a.js", "file"],
      ["src/nested", "directory"],
    ],
  );
  assert.equal(nested.edges[0].weight, 2);
  assert.equal(directoryGraph(model, "src/nested").edges.length, 1);
  assert.ok(
    directoryGraph(model, "src", ["src/uninspected.js"]).nodes.some(
      (node) => node.path === "src/uninspected.js",
    ),
  );
  const many = directoryGraph(
    model,
    ".",
    Array.from({ length: 14 }, (_, i) => `extra${i}.js`),
  );
  const last = directoryPage(many, 999);
  assert.equal(last.page, last.pages - 1);
  assert.ok(last.nodes.length <= 6);
  assert.ok(
    last.edges.every(
      (edge) =>
        last.nodes.some((node) => node.id === edge.source) &&
        last.nodes.some((node) => node.id === edge.target),
    ),
  );
  const pages = {
    nodes: Array.from({ length: 8 }, (_, i) => ({ id: String(i), path: `${i}.js` })),
    edges: [
      { id: "internal", source: "0", target: "1", weight: 1 },
      { id: "out", source: "0", target: "6", weight: 2 },
      { id: "in", source: "7", target: "1", weight: 1 },
      { id: "other", source: "6", target: "7", weight: 1 },
    ],
  };
  const first = directoryPage(pages, 0);
  assert.deepEqual(
    first.edges.map((edge) => edge.id),
    ["internal"],
  );
  assert.deepEqual(
    first.boundary.map((edge) => [
      edge.sourceNode.path,
      edge.targetNode.path,
      edge.destination.page,
      edge.weight,
    ]),
    [
      ["0.js", "6.js", 1, 2],
      ["7.js", "1.js", 1, 1],
    ],
  );
  assert.deepEqual(
    first.other.map((edge) => edge.id),
    ["other"],
  );
});

test("focus counts follow direction and depth while direct lists remain project-wide", async () => {
  const { focus } = await import("../public/app/features/architecture/graph/neighborhood.js");
  const { analytics } = await import("../public/app/features/architecture/graph/cycles.js");
  const paths = ["a", "b", "c", "d"];
  const model = {
    nodes: [],
    projectGraph: {
      complete: true,
      nodes: paths.map((path) => ({ id: path, path })),
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
        { source: "d", target: "a" },
      ],
    },
  };
  const analysis = analytics(model);
  assert.deepEqual(analysis.outgoing.get("a"), ["b"]);
  assert.deepEqual(analysis.incoming.get("a"), ["d"]);
  assert.equal(analysis.outgoing.has("a"), true);
  assert.equal(analysis.incoming.has("missing"), false);
  assert.throws(() => analysis.outgoing.get("a").push("c"), TypeError);
  assert.throws(() => (analysis.incoming.get("a")[0] = "c"), TypeError);
  assert.equal(analysis.outgoing.set, undefined);
  assert.equal(analysis.incoming.delete, undefined);
  assert.deepEqual(analysis.outgoing.get("a"), ["b"]);
  assert.deepEqual(analysis.incoming.get("a"), ["d"]);
  for (const [direction, depth, files, edges] of [
    ["outbound", 1, 2, 1],
    ["outbound", 2, 3, 2],
    ["inbound", 1, 2, 1],
    ["both", 1, 3, 2],
    ["both", 2, 4, 3],
  ]) {
    const result = focus(model, "a", direction, depth);
    assert.deepEqual(
      [result.totalFiles, result.shownFiles, result.totalEdges, result.shownEdges],
      [files, files, edges, edges],
    );
  }
});

test("analytics uses the full graph for unique consumers and cycle groups", async () => {
  const { analytics } = await import("../public/app/features/architecture/graph/cycles.js");
  const { impact, projectSelection } =
    await import("../public/app/features/architecture/graph/selection.js");
  const ids = ["A", "B", "C", "D", "E", "F", "G"];
  const pairs = [
    ["A", "B"],
    ["B", "C"],
    ["A", "C"],
    ["D", "B"],
    ["D", "A"],
    ["E", "F"],
    ["F", "E"],
    ["F", "G"],
    ["G", "G"],
  ];
  const model = {
    nodes: [],
    projectGraph: {
      complete: false,
      nodes: ids.map((id) => ({ id, path: id })),
      edges: [...pairs, ["A", "B"]].map(([source, target]) => ({ source, target })),
    },
  };
  const a = analytics(model);
  assert.equal(a.outgoing.get("A").length, 2);
  assert.equal(a.incoming.get("B").length, 2);
  const result = impact(a, "C", 1);
  assert.equal(result.direct, 2);
  assert.equal(result.transitive, 1);
  assert.deepEqual(result.directIds, ["B", "A"]);
  assert.deepEqual(result.reachableIds, ["D"]);
  assert.equal(result.totalFiles, 4);
  assert.equal(result.shownFiles, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(a.cycles, [["E", "F"], ["G"]]);
  assert.equal(projectSelection(a, a.cycles[0], 1).totalEdges, 2);
  assert.equal(impact(a, "E").direct, 1);
  assert.equal(impact(a, "E").transitive, 0);
  const chain = {
    nodes: [],
    projectGraph: {
      complete: true,
      nodes: ["A", "B", "C", "isolated"].map((id) => ({ id, path: id })),
      edges: [
        { source: "A", target: "B" },
        { source: "B", target: "C" },
      ],
    },
  };
  const chainImpact = impact(analytics(chain), "C");
  assert.equal(chainImpact.direct, 1);
  assert.equal(chainImpact.transitive, 1);
  assert.equal(chainImpact.totalFiles, 3);
  assert.equal(analytics({ nodes: [] }), null);
});
