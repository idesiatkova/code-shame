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

test("allows panning and zooming while keeping nodes fixed", () => {
  const model = createDemoModel();
  const options = architecture.createGraphOptions({}, model, new Map());

  assert.equal(options.autoungrabify, true);
  assert.equal(options.userPanningEnabled, true);
  assert.equal(options.minZoom, 0.05);
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
    constructor() { this.children = []; this.listeners = {}; this.style = { setProperty() {} }; this.dataset = {}; this.attributes = {}; this.value = ""; this.clientWidth = 900; this.parentElement = {}; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    before(element) { this.beforeElement = element; }
    after(element) { this.afterElement = element; }
    setAttribute(key, value) { this.attributes[key] = value; }
    getAttribute(key) { return this.attributes[key] || key; }
    get options() { return this.children; }
    dispatchEvent(event) { this.fire(event.type); }
    focus() { globalThis.document.activeElement = this; }
    contains(element) { return this === element || this.children.some((child) => child.contains?.(element)); }
    set innerHTML(value) {
      this.controls = Array.from({ length: 7 }, () => new Element());
      this.controls[2].value = "both"; this.controls[3].value = "1";
      this.controls[5].value = "dependencies";
    }
    querySelectorAll(selector) { return selector === "input, select, button" ? this.controls : this.children.filter((child) => child.type === "button"); }
    fire(name, event) { this.listeners[name]?.(event); }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, oldOption = globalThis.Option, oldResizeObserver = globalThis.ResizeObserver;
  let resize;
  globalThis.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} };
  globalThis.document = { createElement: () => new Element(), addEventListener() {} };
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  let lastFit, lastGraph, lastRankDir;
  globalThis.window = { cytoscape: (options) => {
    const graph = cytoscape({ ...options, container: undefined, headless: true, styleEnabled: true });
    lastGraph = graph;
    const fit = graph.fit.bind(graph);
    graph.layout = (layoutOptions) => { lastRankDir = layoutOptions.rankDir; return { run() {} }; };
    graph.fit = (collection, padding) => { lastFit = collection; return fit(collection, padding); };
    return graph;
  } };
  try {
    const container = new Element(), details = new Element(), legend = new Element(), stats = new Element();
    const renderer = architecture.createRenderer({ container, details, legend, stats, fitButton: new Element() });
    const model = createDemoModel();
    renderer.render(model);
    container.clientWidth = 800; resize();
    assert.equal(lastRankDir, "TB");
    container.clientWidth = 1200; resize();
    assert.equal(lastRankDir, "LR");
    const [search, results, direction, depth, back, view, cycle] = legend.beforeElement.controls;
    assert.equal(results.children[0].text, "Search for a file");
    legend.children.find((button) => button.textContent.startsWith("UI / Components")).fire("click");
    const layerButton = legend.children.find((button) => button.textContent.startsWith("UI / Components"));
    assert.equal(layerButton.attributes["aria-pressed"], "true");
    assert.ok(lastFit.nodes().length > 1);
    assert.ok(lastFit.edges().length > 0);
    assert.equal(details.children[0].textContent, "UI / Components");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Outbound to other layers"));
    layerButton.fire("click");
    assert.equal(legend.children.find((button) => button.textContent.startsWith("UI / Components")).attributes["aria-pressed"], "false");
    assert.equal(details.children[0].textContent, "Project structure");
    search.value = "checkout"; search.fire("input");
    const menu = results.afterElement, summary = menu.children[0], options = menu.children[1];
    assert.ok(options.children.every((button) => button.tabIndex === -1));
    summary.focus();
    menu.fire("keydown", { key: "ArrowDown", preventDefault() {} });
    assert.equal(globalThis.document.activeElement, options.children[0]);
    menu.fire("focusout", { relatedTarget: direction });
    assert.equal(menu.open, false);
    results.value = "domain/checkout.ts"; results.fire("change");
    direction.value = "inbound"; depth.value = "2";
    const updated = structuredClone(model);
    updated.projectGraph.nodes.push({ id: "new/checkout.ts", path: "new/checkout.ts", layerId: "domain" });
    renderer.render(updated);
    assert.match(stats.textContent, /files shown/);
    assert.equal(search.value, "checkout");
    assert.equal(direction.value, "inbound"); assert.equal(depth.value, "2");
    assert.ok(results.children.some((option) => option.value === "new/checkout.ts"));
    view.value = "impact"; view.fire("change");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    assert.ok(details.children[2].children.some((item) => item.textContent === "Other reachable consumers"));
    assert.equal(direction.parentElement.hidden, true); assert.equal(cycle.parentElement.hidden, true);
    renderer.render(updated);
    assert.equal(view.value, "impact");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    search.value = "domain/checkout"; search.fire("input");
    const anotherFile = lastGraph.nodes('[type = "file"]').filter((node) => node.data("canonicalId") !== "domain/checkout.ts")[0];
    assert.ok(anotherFile); anotherFile.emit("tap");
    assert.equal(results.value, anotherFile.data("canonicalId"));
    assert.equal(search.value, "domain/checkout");
    assert.ok(results.children.some((option) => option.value === results.value));
    assert.equal(view.value, "impact");
    lastGraph.emit("tap");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    assert.equal(lastGraph.nodes('[type = "file"].is-selected').length, 1);
    const cyclic = structuredClone(updated);
    cyclic.projectGraph.edges.push({ source: "domain/checkout.ts", target: "ui/Checkout.tsx" });
    renderer.render(cyclic);
    view.value = "cycles"; view.fire("change");
    assert.equal(cycle.parentElement.hidden, false);
    assert.ok(cycle.children.length > 1);
    cycle.value = cycle.children[1].value; cycle.fire("change");
    const selectedCycle = cycle.value;
    assert.equal(details.children[0].textContent, "Cycle group");
    lastGraph.emit("tap");
    assert.equal(details.children[0].textContent, "Cycle group");
    assert.ok(lastGraph.nodes('[type = "file"].is-selected').length > 0);
    renderer.render(cyclic);
    assert.equal(cycle.value, selectedCycle);
    assert.equal(details.children[0].textContent, "Cycle group");
    renderer.render(updated);
    assert.equal(cycle.value, "");
    assert.equal(details.children[0].textContent, "Project structure");
    assert.match(details.children[1].textContent, /No cycle groups found/);
    back.fire("click");
    assert.equal(results.value, "");
    assert.equal(view.value, "dependencies");
    assert.equal(direction.parentElement.hidden, false); assert.equal(cycle.parentElement.hidden, true);
    assert.match(stats.textContent, /graph files/);
    results.value = "domain/checkout.ts"; results.fire("change");
    updated.projectGraph.nodes = updated.projectGraph.nodes.filter((node) => node.id !== "domain/checkout.ts");
    renderer.render(updated);
    assert.match(stats.textContent, /graph files/);
    renderer.clear();
    assert.equal(search.value, ""); assert.equal(direction.value, "both"); assert.equal(depth.value, "1");
    updated.projectGraph.complete = false;
    updated.projectGraph.diagnostics = ["Unresolved imports <example>"];
    renderer.render(updated);
    assert.equal(stats.afterElement.hidden, false);
    assert.equal(stats.afterElement.children[1].children[0].textContent, "Unresolved imports <example>");
    renderer.clear();
  } finally { globalThis.document = oldDocument; globalThis.window = oldWindow; globalThis.Option = oldOption; globalThis.ResizeObserver = oldResizeObserver; }
});

test("analytics uses the full graph for unique consumers and cycle groups", async () => {
  const { analytics, impact, projectSelection } = await import("../public/app/architectureProjection.js");
  const ids = ["A", "B", "C", "D", "E", "F", "G"];
  const pairs = [["A", "B"], ["B", "C"], ["A", "C"], ["D", "B"], ["D", "A"], ["E", "F"], ["F", "E"], ["F", "G"], ["G", "G"]];
  const model = { nodes: [], projectGraph: { complete: false, nodes: ids.map((id) => ({ id, path: id })), edges: [...pairs, ["A", "B"]].map(([source, target]) => ({ source, target })) } };
  const a = analytics(model);
  assert.equal(a.outgoing.get("A").length, 2);
  assert.equal(a.incoming.get("B").length, 2);
  const result = impact(a, "C", 1);
  assert.equal(result.direct, 2); assert.equal(result.transitive, 1);
  assert.equal(result.totalFiles, 4); assert.equal(result.shownFiles, 1); assert.equal(result.complete, false);
  assert.deepEqual(a.cycles, [["E", "F"], ["G"]]);
  assert.equal(projectSelection(a, a.cycles[0], 1).totalEdges, 2);
  assert.equal(impact(a, "E").direct, 1);
  assert.equal(impact(a, "E").transitive, 0);
  const chain = { nodes: [], projectGraph: { complete: true, nodes: ["A", "B", "C", "isolated"].map((id) => ({ id, path: id })), edges: [{ source: "A", target: "B" }, { source: "B", target: "C" }] } };
  const chainImpact = impact(analytics(chain), "C");
  assert.equal(chainImpact.direct, 1); assert.equal(chainImpact.transitive, 1);
  assert.equal(chainImpact.totalFiles, 3);
  assert.equal(analytics({ nodes: [] }), null);
});
