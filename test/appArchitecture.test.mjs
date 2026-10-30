import assert from "node:assert/strict";
import test from "node:test";
import { createDemoModel } from "../public/app/demo.js";
import * as architecture from "../public/app/architecture.js";

test("creates a representative demo architecture", () => {
  const model = createDemoModel();

  assert.equal(model.state, "ready");
  assert.ok(model.nodes.some((node) => node.type === "layer" && node.label.includes("Zustand")));
  assert.ok(model.nodes.some((node) => node.type === "file"));
  assert.ok(model.edges.every((edge) => edge.type === "imports"));
});

test("maps graph nodes and edges to Cytoscape elements", () => {
  const model = createDemoModel();
  const elements = architecture.toCytoscapeElements(model);
  const fileElement = elements.find((element) => element.data.type === "file");

  assert.equal(fileElement.data.type, "file");
  assert.equal(elements.filter((element) => element.data.type === "imports").length, model.edges.length);
});

test("keeps the architecture map fixed in place", () => {
  const model = createDemoModel();
  const options = architecture.createGraphOptions({}, model, new Map());

  assert.equal(options.autoungrabify, true);
  assert.equal(options.userPanningEnabled, false);
  assert.equal(options.boxSelectionEnabled, false);
  assert.equal(architecture.createGraphOptions({ clientWidth: 800 }, model).layout.rankDir, "TB");
  assert.equal(architecture.createGraphOptions({ clientWidth: 1200 }, model).layout.rankDir, "LR");
});

test("Dagre lays out cyclic and isolated layers and routes their edges", async () => {
  const cytoscape = (await import("cytoscape")).default;
  cytoscape.use((await import("cytoscape-dagre")).default);
  const nodes = ["a", "b", "c", "isolated"].map((id) => ({ id, type: "overview-layer", label: id, displayLabel: id, color: "#ffffff" }));
  const edges = [["a", "b"], ["b", "c"], ["c", "a"], ["a", "c"]].map(([source, target], index) => ({ id: `e${index}`, source, target, weight: 1 }));
  const options = architecture.createGraphOptions(undefined, { nodes, edges });
  const graph = cytoscape({ ...options, headless: true, styleEnabled: true });
  assert.equal(graph.nodes().length, 4);
  assert.ok(graph.nodes().every((node) => Number.isFinite(node.position().x) && Number.isFinite(node.position().y)));
  assert.ok(graph.edges().every((edge) => Array.isArray(edge.scratch("controlPointWeights"))));
  assert.ok(graph.edges().every((edge) => edge.style("curve-style") === "unbundled-bezier"));
  graph.destroy();
});

test("projects full graph, including hidden files, with unique directed dependencies", async () => {
  const { overview, searchFiles, focus } = await import("../public/app/architectureProjection.js");
  const model = createDemoModel();
  model.nodes = model.nodes.filter((node) => node.path !== "domain/checkout.ts");
  model.projectGraph.edges.push({ ...model.projectGraph.edges[3], kind: "dynamic" });
  const map = overview(model);
  assert.equal(map.edgeCount, 8);
  assert.ok(map.edges.every((edge) => edge.source !== edge.target));
  assert.equal(map.edges.find((edge) => edge.source === "layer:ui" && edge.target === "layer:domain").weight, 2);
  assert.equal(searchFiles(model, "CHECKOUT.TS").some((node) => node.path === "domain/checkout.ts"), true);
  const out = focus(model, "ui/Checkout.tsx", "outbound", 2);
  assert.ok(out.nodes.some((node) => node.path === "api/checkout-api.ts"));
  assert.ok(!focus(model, "ui/Checkout.tsx", "outbound", 1).nodes.some((node) => node.path === "api/checkout-api.ts"));
  assert.ok(focus(model, "domain/checkout.ts", "inbound", 1).nodes.some((node) => node.path === "ui/Checkout.tsx"));
  const capped = focus(model, "ui/Checkout.tsx", "outbound", 2, 1);
  assert.equal(capped.shownFiles, 1);
  assert.ok(capped.totalFiles > capped.shownFiles);
  model.projectGraph.complete = false;
  model.projectGraph.nodes.push({ id: "unknown", path: "unknown", layerId: null });
  assert.equal(overview(model).complete, false);
  assert.ok(overview(model).nodes.some((node) => node.label === "Unknown layer"));
});

test("renderer keeps focus and refreshes search results across snapshots", async () => {
  const cytoscape = (await import("cytoscape")).default;
  cytoscape.use((await import("cytoscape-dagre")).default);
  class Element {
    constructor() { this.children = []; this.listeners = {}; this.style = { setProperty() {} }; this.dataset = {}; this.attributes = {}; this.value = ""; this.clientWidth = 900; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    before(element) { this.beforeElement = element; }
    after(element) { this.afterElement = element; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] || key; }
    get options() { return this.children; }
    dispatchEvent(event) { this.fire(event.type); }
    focus() {}
    set innerHTML(value) {
      this.controls = Array.from({ length: 5 }, () => new Element());
      this.controls[2].value = "both"; this.controls[3].value = "1";
    }
    querySelectorAll(selector) { return selector === "input, select, button" ? this.controls : this.children.filter((child) => child.type === "button"); }
    fire(name) { this.listeners[name]?.(); }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, oldOption = globalThis.Option;
  globalThis.document = { createElement: () => new Element(), addEventListener() {} };
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  let lastFit;
  globalThis.window = { cytoscape: (options) => {
    const graph = cytoscape({ ...options, container: undefined, headless: true, styleEnabled: true });
    const fit = graph.fit.bind(graph);
    graph.fit = (collection, padding) => { lastFit = collection; return fit(collection, padding); };
    return graph;
  } };
  try {
    const container = new Element(), details = new Element(), legend = new Element(), stats = new Element();
    const renderer = architecture.createRenderer({ container, details, legend, stats, fitButton: new Element() });
    const model = createDemoModel();
    renderer.render(model);
    const [search, results, direction, depth] = legend.beforeElement.controls;
    assert.equal(results.children[0].text, "Search for a file");
    legend.children.find((button) => button.textContent.startsWith("UI / Components")).fire("click");
    const layerButton = legend.children.find((button) => button.textContent.startsWith("UI / Components"));
    assert.equal(layerButton.attributes["aria-pressed"], "true");
    assert.ok(lastFit.nodes().length > 1);
    assert.ok(lastFit.edges().length > 0);
    assert.equal(details.children[0].textContent, "UI / Components");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Outbound to other layers"));
    layerButton.fire("click");
    assert.equal(layerButton.attributes["aria-pressed"], "false");
    assert.equal(details.children[0].textContent, "Project structure");
    search.value = "checkout"; search.fire("input");
    results.value = "domain/checkout.ts"; results.fire("change");
    direction.value = "inbound"; depth.value = "2";
    const updated = structuredClone(model);
    updated.projectGraph.nodes.push({ id: "new/checkout.ts", path: "new/checkout.ts", layerId: "domain" });
    renderer.render(updated);
    assert.match(stats.textContent, /files shown/);
    assert.equal(search.value, "checkout");
    assert.equal(direction.value, "inbound"); assert.equal(depth.value, "2");
    assert.ok(results.children.some((option) => option.value === "new/checkout.ts"));
    updated.projectGraph.nodes = updated.projectGraph.nodes.filter((node) => node.id !== "domain/checkout.ts");
    renderer.render(updated);
    assert.match(stats.textContent, /graph files/);
    renderer.clear();
    assert.equal(search.value, ""); assert.equal(direction.value, "both"); assert.equal(depth.value, "1");
  } finally { globalThis.document = oldDocument; globalThis.window = oldWindow; globalThis.Option = oldOption; }
});
