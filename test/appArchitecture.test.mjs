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
    constructor() { this.children = []; this.listeners = {}; this.style = { setProperty() {} }; this.dataset = {}; this.attributes = {}; this.value = ""; this.clientWidth = 900; this.parentElement = {}; this.classList = { toggle() {}, add() {} }; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    prepend(...children) { this.children.unshift(...children); }
    before(element) { this.beforeElement = element; }
    after(element) { this.afterElement = element; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    getAttribute(key) { return this.attributes[key] || key; }
    querySelector(selector) {
      if (selector === ".architecture-search") return this.searchContainer;
      const mode = selector.match(/^\[data-mode="(.+)"\]$/)?.[1];
      if (!mode) return null;
      return this.children.find((child) => child.dataset?.mode === mode) || this.children.map((child) => child.querySelector?.(selector)).find(Boolean) || null;
    }
    get options() { return this.children; }
    dispatchEvent(event) { this.fire(event.type); }
    focus() { globalThis.document.activeElement = this; }
    contains(element) { return this === element || this.children.some((child) => child.contains?.(element)); }
    set innerHTML(value) {
      this.controls = Array.from({ length: 7 }, () => new Element());
      this.searchContainer = new Element();
      this.controls[2].value = "both"; this.controls[3].value = "1";
      this.controls[5].value = "dependencies";
    }
    querySelectorAll(selector) { return selector === "input, select, button" ? this.controls : this.children.filter((child) => child.type === "button"); }
    fire(name, event) { this.listeners[name]?.(event); }
  }
  const oldDocument = globalThis.document, oldWindow = globalThis.window, oldOption = globalThis.Option, oldResizeObserver = globalThis.ResizeObserver;
  let resize;
  globalThis.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} };
  const created = [];
  globalThis.document = { createElement: () => { const element = new Element(); created.push(element); return element; }, createElementNS: () => new Element(), addEventListener() {} };
  globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
  let lastFit, lastGraph, lastRankDir, lastCentered;
  globalThis.window = { cytoscape: (options) => {
    const graph = cytoscape({ ...options, container: undefined, headless: true, styleEnabled: true });
    lastGraph = graph;
    const fit = graph.fit.bind(graph);
    const center = graph.center.bind(graph);
    graph.zoom(0.4);
    graph.center = (collection) => { lastCentered = collection; return center(collection); };
    graph.layout = (layoutOptions) => { lastRankDir = layoutOptions.rankDir; return { run() {} }; };
    graph.fit = (collection, padding) => { lastFit = collection; return fit(collection, padding); };
    return graph;
  } };
  try {
    const container = new Element(), details = new Element(), legend = new Element(), stats = new Element();
    const fitButton = new Element();
    const renderer = architecture.createRenderer({ container, details, legend, stats, fitButton });
    const model = createDemoModel();
    renderer.render(model);
    const map = created.find((element) => element.className === "architecture-map-disclosure");
    assert.equal(map.hidden, true);
    const browser = created.find((element) => element.className === "architecture-browser");
    const inventory = browser.children[0], workspace = browser.children[1], header = workspace.children[0];
    assert.equal(workspace.children[2].className, "source-explorer");
    const tree = inventory.children[2];
    assert.equal(tree.children[0].attributes["aria-selected"], "true");
    assert.equal(header.children[1].children[0].textContent, "Project overview");
    const controls = created.find((element) => element.className === "architecture-controls");
    const [initialSearch, initialResults] = controls.controls;
    initialSearch.value = "domain/checkout.ts"; initialSearch.fire("input"); initialResults.value = "domain/checkout.ts"; initialResults.fire("change");
    const domain = tree.children[0].children[1].children.find((item) => item.dataset.path === "domain");
    assert.equal(domain.attributes["aria-expanded"], "true");
    assert.ok(domain.children[1].children.some((item) => item.dataset.path === "domain/checkout.ts" && item.attributes["aria-selected"] === "true"));
    header.children[2].children.find((button) => button.textContent === "Source").fire("click");
    assert.equal(workspace.children[2].hidden, false);
    const sourceContent = workspace.children[2].children[0];
    renderer.render({ state: "running" });
    assert.equal(header.children[3].hidden, false);
    assert.match(header.children[3].textContent, /Updating project structure/);
    assert.equal(workspace.children[2].hidden, false);
    assert.equal(workspace.children[2].children[0], sourceContent);
    renderer.render(structuredClone(model));
    assert.equal(header.children[3].hidden, true);
    assert.equal(workspace.children[2].hidden, false);
    assert.equal(workspace.children[2].children[0], sourceContent);
    workspace.children[2].children[0].children[1].fire("click");
    assert.equal(globalThis.document.activeElement, header.children[2].children.find((button) => button.dataset.mode === "source"));
    header.children[2].children.find((button) => button.dataset.mode === "source").fire("click");
    inventory.children[0].children[1].fire("click");
    assert.equal(workspace.children[2].hidden, false);
    assert.match(header.children[1].children[0].textContent, /domain\/checkout.ts/);
    header.children[1].children[1].fire("click");
    assert.equal(header.children[1].children[0].textContent, "Project overview");
    assert.equal(initialSearch.value, "");
    renderer.clear();
    assert.equal(workspace.children[1].hidden, false);
    assert.equal(workspace.children[1].children[0].textContent, "No project structure yet.");
    assert.equal(initialSearch.disabled, true);
    const withTests = structuredClone(model);
    withTests.projectGraph.nodes.push({ id: "test/example.test.js", path: "test/example.test.js", entryPoint: true });
    renderer.render(withTests);
    assert.equal(initialSearch.disabled, false);
    const entries = workspace.children[1].children[0].children[1];
    const testGroup = entries.children.find((child) => child.children?.[0]?.textContent === "Test entry points (1)");
    assert.ok(testGroup); assert.ok(!testGroup.open);
    assert.match(testGroup.children[1].textContent, /test directory or filename/);
    renderer.render(model);
    header.children[2].children.at(-1).fire("click");
    container.clientWidth = 800; resize();
    assert.equal(lastRankDir, "TB");
    container.clientWidth = 1200; resize();
    assert.equal(lastRankDir, "LR");
    const [search, results, direction, depth, back, view, cycle] = controls.controls;
    assert.ok(results.children.length > 1);
    assert.equal(direction.disabled, true); assert.equal(depth.disabled, true);
    const searchList = results.afterElement;
    search.fire("focus"); assert.equal(searchList.hidden, false);
    search.fire("keydown", { key: "ArrowDown", preventDefault() {} });
    assert.equal(search.attributes["aria-activedescendant"], searchList.children[0].id);
    search.fire("keydown", { key: "Escape", preventDefault() {} });
    assert.equal(searchList.hidden, true); assert.equal(search.attributes["aria-expanded"], "false");
    search.value = "domain/checkout.ts"; search.fire("input");
    search.fire("keydown", { key: "Enter", preventDefault() {} });
    assert.match(stats.textContent, /files shown/);
    assert.equal(lastGraph.zoom(), 1);
    assert.equal(lastCentered.data("canonicalId"), "domain/checkout.ts");
    lastGraph.zoom(0.7); resize(); assert.equal(lastGraph.zoom(), 0.7);
    container.clientWidth = 800; resize(); assert.equal(lastGraph.zoom(), 1);
    assert.equal(lastCentered.data("canonicalId"), "domain/checkout.ts");
    container.clientWidth = 1200; resize();
    assert.equal(searchList.hidden, true);
    back.fire("click");
    legend.children.find((button) => button.textContent.startsWith("UI / Components")).fire("click");
    const layerButton = legend.children.find((button) => button.textContent.startsWith("UI / Components"));
    assert.equal(layerButton.attributes["aria-pressed"], "true");
    assert.ok(lastFit.nodes().length > 1);
    assert.ok(lastFit.edges().length > 0);
    assert.equal(details.children[0].textContent, "UI / Components");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Outbound to other layers"));
    assert.ok(details.children.find((child) => child.children?.[0]?.textContent === "Files in this layer").children[1].children.length > 0);
    layerButton.focus(); layerButton.fire("click");
    const resetLayerButton = legend.children.find((button) => button.textContent.startsWith("UI / Components"));
    assert.equal(resetLayerButton.attributes["aria-pressed"], "false");
    assert.equal(globalThis.document.activeElement, resetLayerButton);
    assert.equal(details.children[0].textContent, "Project structure");
    search.value = "checkout"; search.fire("input");
    results.value = "domain/checkout.ts"; results.fire("change");
    assert.equal(direction.disabled, false); assert.equal(depth.disabled, false);
    const neighbors = details.children.find((child) => child.children?.[0]?.textContent === "Files shown in this view");
    assert.ok(neighbors.children[1].children.some((item) => item.children[0].textContent.includes("/")));
    const edge = lastGraph.edges()[0]; edge.emit("tap");
    assert.equal(details.children[0].textContent, "Dependency");
    assert.equal(details.children[1].textContent, "Importer → imported");
    const context = fitButton.beforeElement.children[0];
    assert.match(context.children[0].textContent, /Current file: domain\/checkout.ts/);
    context.children[1].fire("click");
    assert.equal(details.children[1].textContent, "domain/checkout.ts");
    direction.value = "inbound"; depth.value = "2";
    const updated = structuredClone(model);
    updated.projectGraph.nodes.push({ id: "new/checkout.ts", path: "new/checkout.ts", layerId: "domain" });
    renderer.render(updated);
    assert.match(stats.textContent, /files shown/);
    assert.equal(search.value, "checkout");
    assert.equal(direction.value, "inbound"); assert.equal(depth.value, "2");
    assert.ok(results.children.some((option) => option.value === "new/checkout.ts"));
    view.value = "impact"; view.fire("change");
    assert.equal(lastGraph.zoom(), 1);
    assert.equal(lastCentered.data("canonicalId"), "domain/checkout.ts");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    assert.ok(details.children[2].children.some((item) => item.textContent === "Other reachable consumers"));
    assert.ok(details.children.find((child) => child.children?.[0]?.textContent === "Direct consumers").open);
    assert.equal(direction.parentElement.hidden, true); assert.equal(cycle.parentElement.hidden, true);
    renderer.render(updated);
    assert.equal(view.value, "impact");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    search.value = "domain/checkout"; search.fire("input");
    const anotherFile = lastGraph.nodes('[type = "file"]').filter((node) => node.data("canonicalId") !== "domain/checkout.ts")[0];
    assert.ok(anotherFile); anotherFile.emit("tap");
    assert.equal(results.value, "");
    assert.equal(search.value, "domain/checkout");
    assert.equal(view.value, "impact");
    lastGraph.emit("tap");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    assert.equal(lastGraph.nodes('[type = "file"].is-selected').length, 1);
    const cyclic = structuredClone(updated);
    cyclic.projectGraph.edges.push({ source: "domain/checkout.ts", target: "ui/Checkout.tsx" });
    renderer.render(cyclic);
    view.value = "cycles"; view.fire("change");
    assert.match(context.children[0].textContent, /Cycles across project/);
    assert.equal(cycle.parentElement.hidden, false);
    assert.ok(cycle.children.length > 1);
    cycle.value = cycle.children[1].value; cycle.fire("change");
    assert.equal(lastGraph.zoom(), 1);
    assert.equal(lastCentered.data("type"), "file");
    const selectedCycle = cycle.value;
    assert.equal(details.children[0].textContent, "Cycle group");
    const member = lastGraph.nodes('[type = "file"]')[0]; member.emit("tap");
    assert.equal(view.value, "cycles");
    assert.equal(details.children[1].textContent, member.data("path"));
    const members = details.children.find((child) => child.children?.[0]?.textContent === "Cycle members");
    members.children[1].children[0].children[1].fire("click");
    assert.equal(view.value, "dependencies");
    assert.equal(view.value, "dependencies");
    view.value = "cycles"; view.fire("change");
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
    back.focus(); back.fire("click");
    assert.equal(globalThis.document.activeElement, fitButton);
    assert.equal(results.value, "");
    assert.equal(view.value, "dependencies");
    assert.equal(direction.parentElement.hidden, false); assert.equal(cycle.parentElement.hidden, true);
    assert.match(stats.textContent, /graph files/);
    results.value = "domain/checkout.ts"; results.fire("change");
    updated.projectGraph.nodes = updated.projectGraph.nodes.filter((node) => node.id !== "domain/checkout.ts");
    renderer.render(updated);
    assert.equal(workspace.children[1].hidden, false);
    renderer.clear();
    const legacy = structuredClone(model); delete legacy.projectGraph;
    renderer.render(legacy);
    results.value = "domain/checkout.ts"; results.fire("change");
    view.value = "impact"; view.fire("change");
    assert.match(details.children[1].textContent, /unavailable/);
    assert.ok(lastGraph.nodes('[type = "overview-layer"]').length > 0);
    assert.equal(lastGraph.nodes('[type = "file"]').length, 0);
    assert.match(stats.textContent, /graph files/);
    renderer.clear();
    assert.equal(search.value, ""); assert.equal(direction.value, "both"); assert.equal(depth.value, "1");
    updated.projectGraph.complete = false;
    updated.projectGraph.diagnostics = ["Unresolved imports <example>"];
    renderer.render(updated);
    const diagnostics = created.find((element) => element.className === "architecture-diagnostics");
    assert.equal(diagnostics.hidden, false);
    assert.equal(diagnostics.children[1].children[0].textContent, "Unresolved imports <example>");
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
