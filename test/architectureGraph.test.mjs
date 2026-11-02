import assert from "node:assert/strict";
import test from "node:test";
import { createGraphOptions } from "../public/app/features/architecture/graph/architecture-graph.js";
import { createDemoModel } from "./helpers/architecture-fixtures.mjs";

test("creates a representative demo architecture", () => {
  const model = createDemoModel();

  assert.equal(model.state, "ready");
  assert.ok(model.nodes.some((node) => node.type === "layer" && node.label.includes("Zustand")));
  assert.ok(model.nodes.some((node) => node.type === "file"));
  assert.ok(model.edges.every((edge) => edge.type === "imports"));
});

test("maps graph nodes and edges to Cytoscape elements", () => {
  const model = createDemoModel();
  const elements = createGraphOptions({}, model).elements;
  const fileElement = elements.find((element) => element.data.type === "file");

  assert.equal(fileElement.data.type, "file");
  assert.equal(
    elements.filter((element) => element.data.type === "imports").length,
    model.edges.length,
  );
});

test("allows panning and zooming while keeping nodes fixed", () => {
  const model = createDemoModel();
  const options = createGraphOptions({}, model, new Map());

  assert.equal(options.autoungrabify, true);
  assert.equal(options.userPanningEnabled, true);
  assert.notEqual(options.textureOnViewport, true);
  assert.equal(options.minZoom, 0.05);
  assert.equal(options.boxSelectionEnabled, false);
  assert.equal(createGraphOptions({ clientWidth: 800 }, model).layout.rankDir, "TB");
  assert.equal(createGraphOptions({ clientWidth: 1200 }, model).layout.rankDir, "LR");
});

test("Dagre lays out cyclic and isolated layers and routes their edges", async () => {
  const cytoscape = (await import("cytoscape")).default;
  cytoscape.use((await import("cytoscape-dagre")).default);
  const nodes = ["a", "b", "c", "isolated"].map((id) => ({
    id,
    type: "overview-layer",
    label: id,
    displayLabel: id,
    color: "#ffffff",
  }));
  const edges = [
    ["a", "b"],
    ["b", "c"],
    ["c", "a"],
    ["a", "c"],
  ].map(([source, target], index) => ({ id: `e${index}`, source, target, weight: 1 }));
  const options = createGraphOptions(undefined, { nodes, edges });
  const graph = cytoscape({ ...options, headless: true, styleEnabled: true });
  assert.equal(graph.nodes().length, 4);
  assert.ok(
    graph
      .nodes()
      .every((node) => Number.isFinite(node.position().x) && Number.isFinite(node.position().y)),
  );
  assert.ok(graph.edges().every((edge) => Array.isArray(edge.scratch("controlPointWeights"))));
  assert.ok(graph.edges().every((edge) => edge.style("curve-style") === "unbundled-bezier"));
  graph.destroy();
});
