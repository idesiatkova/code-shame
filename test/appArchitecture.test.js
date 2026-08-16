const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../public/app-architecture.js"), "utf8");
const context = { Intl, window: {} };
vm.runInNewContext(source, context);
const architecture = context.window.codeShameArchitecture;

test("creates a representative demo architecture", () => {
  const model = architecture.createDemoModel();

  assert.equal(model.state, "ready");
  assert.ok(model.nodes.some((node) => node.type === "layer" && node.label.includes("Zustand")));
  assert.ok(model.nodes.some((node) => node.type === "file"));
  assert.ok(model.edges.every((edge) => edge.type === "imports"));
});

test("maps graph nodes and edges to Cytoscape elements", () => {
  const model = architecture.createDemoModel();
  const positions = architecture.calculatePositions(model.nodes, 1200);
  const elements = architecture.toCytoscapeElements(model, positions);
  const fileElement = elements.find((element) => element.data.type === "file");

  assert.ok(fileElement.position);
  assert.equal(elements.filter((element) => element.data.type === "imports").length, model.edges.length);
});

test("keeps the architecture map fixed in place", () => {
  const model = architecture.createDemoModel();
  const options = architecture.createGraphOptions({}, model, new Map());

  assert.equal(options.autoungrabify, true);
  assert.equal(options.userPanningEnabled, false);
  assert.equal(options.boxSelectionEnabled, false);
});

test("keeps compound layer bounds from overlapping", () => {
  const model = architecture.createDemoModel();
  const positions = architecture.calculatePositions(model.nodes, 1100);
  const layerBounds = model.nodes
    .filter((node) => node.type === "layer")
    .map((layerNode) => {
      const childPositions = model.nodes
        .filter((node) => node.parent === layerNode.id)
        .map((node) => positions.get(node.id));
      const xs = childPositions.map((position) => position.x);
      const ys = childPositions.map((position) => position.y);
      return {
        left: Math.min(...xs) - 99,
        right: Math.max(...xs) + 99,
        top: Math.min(...ys) - 52,
        bottom: Math.max(...ys) + 52
      };
    });

  layerBounds.forEach((bounds, index) => {
    layerBounds.slice(index + 1).forEach((other) => {
      const separated = bounds.right <= other.left
        || other.right <= bounds.left
        || bounds.bottom <= other.top
        || other.bottom <= bounds.top;
      assert.equal(separated, true);
    });
  });
});
