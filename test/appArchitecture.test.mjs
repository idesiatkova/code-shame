import assert from "node:assert/strict";
import test from "node:test";
import { reportForDisplay } from "../public/app/features/scan/demo.js";
import { createGraphOptions } from "../public/app/features/architecture/graph/architecture-graph.js";
import * as architecture from "../public/app/features/architecture/architecture.js";

const createDemoModel = () => reportForDisplay({ overview: [], health: {} }).architecture;

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

test("projects full graph, including hidden files, with unique directed dependencies", async () => {
  const { overview, focus } =
    await import("../public/app/features/architecture/architectureProjection.js");
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
  const { focus, analytics } =
    await import("../public/app/features/architecture/architectureProjection.js");
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

test("renderer keeps focus and refreshes search results across snapshots", async () => {
  const cytoscape = (await import("cytoscape")).default;
  cytoscape.use((await import("cytoscape-dagre")).default);
  class Element {
    constructor() {
      this.children = [];
      this.listeners = {};
      this.style = { setProperty() {} };
      this.dataset = {};
      this.attributes = {};
      this.value = "";
      this.clientWidth = 900;
      this.clientHeight = 300;
      this.parentElement = {};
      this.classList = { toggle() {}, add() {} };
    }
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    }
    replaceChildren(...children) {
      this.children = children;
      children.forEach((child) => {
        child.parent = this;
      });
    }
    append(...children) {
      this.children.push(...children);
      children.forEach((child) => {
        child.parent = this;
      });
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter((child) => child !== this);
    }
    prepend(...children) {
      this.children.unshift(...children);
    }
    before(element) {
      this.beforeElement = element;
    }
    after(element) {
      this.afterElement = element;
    }
    setAttribute(key, value) {
      this.attributes[key] = value;
    }
    removeAttribute(key) {
      delete this.attributes[key];
    }
    getAttribute(key) {
      return this.attributes[key] || key;
    }
    querySelector(selector) {
      if (selector === "button")
        return this.children.find((child) => child.type === "button") || null;
      if (selector === ".architecture-search") return this.searchContainer;
      if (selector === ".architecture-secondary") return this.secondary;
      if (selector.startsWith("."))
        return (
          this.children.find((child) => child.className === selector.slice(1)) ||
          this.children.map((child) => child.querySelector?.(selector)).find(Boolean) ||
          null
        );
      const mode = selector.match(/^\[data-mode="(.+)"\]$/)?.[1];
      if (!mode) return null;
      return (
        this.children.find((child) => child.dataset?.mode === mode) ||
        this.children.map((child) => child.querySelector?.(selector)).find(Boolean) ||
        null
      );
    }
    get options() {
      return this.children;
    }
    dispatchEvent(event) {
      this.fire(event.type);
    }
    focus() {
      globalThis.document.activeElement = this;
    }
    get scrollTop() {
      for (let node = this; node; node = node.parent) if (node.hidden) return 0;
      return this._scrollTop || 0;
    }
    set scrollTop(value) {
      this._scrollTop = value;
    }
    contains(element) {
      return this === element || this.children.some((child) => child.contains?.(element));
    }
    set innerHTML(value) {
      this.controls = Array.from({ length: 7 }, () => new Element());
      this.searchContainer = new Element();
      this.markup = value;
      this.secondary = new Element();
      this.controls[2].value = "both";
      this.controls[3].value = "1";
      this.controls[3].children = [{ value: "1" }, { value: "2" }];
      this.controls[5].value = "dependencies";
    }
    querySelectorAll(selector) {
      return selector === "input, select, button"
        ? this.controls
        : this.children.filter((child) => child.type === "button");
    }
    fire(name, event) {
      this.listeners[name]?.(event);
    }
  }
  const oldDocument = globalThis.document,
    oldWindow = globalThis.window,
    oldOption = globalThis.Option,
    oldResizeObserver = globalThis.ResizeObserver,
    oldFetch = globalThis.fetch;
  let resize;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      resize = callback;
    }
    observe() {}
    disconnect() {}
  };
  const created = [];
  globalThis.document = {
    createElement: () => {
      const element = new Element();
      created.push(element);
      return element;
    },
    createElementNS: () => new Element(),
    addEventListener() {},
  };
  globalThis.Option = class {
    constructor(text, value) {
      this.text = text;
      this.value = value;
    }
  };
  let lastFit,
    lastGraph,
    lastRankDir,
    fitCalls = 0,
    graphCreations = 0,
    layoutCalls = 0;
  const locations = ["/?page=architecture"],
    location = { pathname: "/", search: "?page=architecture", hash: "" },
    listeners = {};
  let position = 0;
  const setLocation = (url) => {
    const parsed = new URL(url, "http://localhost");
    Object.assign(location, {
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    });
  };
  const states = [null];
  const history = {
    get state() {
      return states[position];
    },
    pushState(state, _title, url) {
      locations.splice(++position, Infinity, url);
      states.splice(position, Infinity, state);
      setLocation(url);
    },
    replaceState(state, _title, url) {
      locations[position] = url;
      states[position] = state;
      setLocation(url);
    },
    go(delta) {
      position += delta;
      setLocation(locations[position]);
      listeners.popstate();
    },
    back() {
      this.go(-1);
    },
  };
  globalThis.window = {
    location,
    history,
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
    cytoscape: (options) => {
      graphCreations++;
      const graph = cytoscape({
        ...options,
        container: undefined,
        headless: true,
        styleEnabled: true,
      });
      lastGraph = graph;
      const fit = graph.fit.bind(graph);
      graph.zoom(0.4);
      graph.layout = (layoutOptions) => {
        layoutCalls++;
        lastRankDir = layoutOptions.rankDir;
        return { run() {} };
      };
      graph.fit = (collection, padding) => {
        lastFit = collection;
        fitCalls++;
        return fit(collection, padding);
      };
      return graph;
    },
  };
  try {
    const container = new Element(),
      details = new Element(),
      legend = new Element(),
      stats = new Element();
    const fitButton = new Element();
    const renderer = architecture.createRenderer({ container, details, legend, stats, fitButton });
    const model = createDemoModel();
    renderer.render(model);
    const map = created.find((element) => element.className === "architecture-map-disclosure");
    assert.equal(map.hidden, true);
    const browser = created.find((element) => element.className === "architecture-browser");
    const inventory = browser.children[0],
      workspace = browser.children[1],
      header = workspace.children[0];
    assert.equal(workspace.children[2].className, "source-explorer");
    const tree = inventory.children[2];
    assert.equal(tree.children[0].attributes["aria-selected"], "true");
    assert.equal(header.children[1].children[0].textContent, "Project overview");
    const controls = created.find((element) => element.className === "architecture-controls");
    const [initialSearch, initialResults] = controls.controls;
    initialSearch.value = "domain/checkout.ts";
    initialSearch.fire("input");
    initialResults.value = "domain/checkout.ts";
    initialResults.fire("change");
    const domain = tree.children[0].children[1].children.find(
      (item) => item.dataset.path === "domain",
    );
    assert.equal(domain.attributes["aria-expanded"], "true");
    assert.ok(
      domain.children[1].children.some(
        (item) =>
          item.dataset.path === "domain/checkout.ts" && item.attributes["aria-selected"] === "true",
      ),
    );
    assert.match(location.hash, /file=domain%2Fcheckout.ts/);
    history.go(-1);
    assert.equal(header.children[1].children[0].textContent, "Project overview");
    history.go(1);
    assert.match(header.children[1].children[0].textContent, /domain\/checkout.ts/);
    setLocation("/?page=architecture#file=missing.js&view=source");
    listeners.popstate();
    assert.equal(header.children[1].children[0].textContent, "Project overview");
    assert.match(header.children[4].textContent, /not available/);
    setLocation(locations[position]);
    listeners.popstate();
    header.children[2].children.find((button) => button.textContent === "Source").fire("click");
    assert.equal(workspace.children[2].hidden, false);
    history.go(-1);
    assert.equal(workspace.children[2].hidden, true);
    history.go(1);
    assert.equal(workspace.children[2].hidden, false);
    const sourceContent = workspace.children[2].children[0];
    renderer.render({ state: "running" });
    assert.equal(header.children[3].hidden, false);
    assert.match(header.children[3].textContent, /Updating project structure/);
    assert.equal(workspace.children[2].hidden, false);
    assert.equal(workspace.children[2].children[0], sourceContent);
    const historyLength = locations.length;
    renderer.render(structuredClone(model));
    assert.equal(locations.length, historyLength);
    assert.equal(header.children[3].hidden, true);
    assert.equal(workspace.children[2].hidden, false);
    assert.equal(workspace.children[2].children[0], sourceContent);
    workspace.children[2].children[0].children[1].fire("click");
    assert.equal(
      globalThis.document.activeElement,
      header.children[2].children.find((button) => button.dataset.mode === "source"),
    );
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
    withTests.projectGraph.nodes.push({
      id: "test/example.test.js",
      path: "test/example.test.js",
      entryPoint: true,
    });
    renderer.render(withTests);
    assert.equal(initialSearch.disabled, false);
    const entries = workspace.children[1].children.find(
      (child) => child.className === "architecture-entries",
    ).children[1];
    const testGroup = entries.children.find(
      (child) => child.children?.[0]?.textContent === "Test entry points (1)",
    );
    assert.ok(testGroup);
    assert.ok(!testGroup.open);
    assert.match(testGroup.children[1].textContent, /test directory or filename/);
    renderer.render(model);
    header.children[2].children.at(-1).fire("click");
    const folder = lastGraph
      .nodes('[type = "directory"]')
      .filter((node) => node.data("path") === "domain")[0];
    assert.ok(folder);
    folder.emit("tap");
    assert.equal(map.hidden, false);
    assert.match(location.hash, /directory=domain.*view=map/);
    assert.match(header.children[1].children[0].textContent, /Directory: domain/);
    assert.ok(
      lastGraph.nodes('[type = "file"]').some((node) => node.data("path") === "domain/checkout.ts"),
    );
    assert.equal(
      tree.children[0].children[1].children.find((item) => item.dataset.path === "domain")
        .attributes["aria-selected"],
      "true",
    );
    history.go(-1);
    assert.equal(map.hidden, false);
    assert.equal(header.children[1].children[0].textContent, "Project overview");
    container.clientWidth = 800;
    resize();
    assert.equal(lastRankDir, "TB");
    container.clientWidth = 1200;
    resize();
    assert.equal(lastRankDir, "LR");
    const [search, results, direction, depth, back, view, cycle] = controls.controls;
    assert.match(controls.markup, /class="architecture-graph-settings"/);
    assert.doesNotMatch(controls.markup, /<details|Graph options/);
    assert.notEqual(view.parentElement.hidden, true);
    assert.equal(back.attributes["aria-label"], "Up to directory");
    assert.equal(back.children[1].textContent, "↑");
    assert.equal(fitButton.attributes["aria-label"], "Fit entire map");
    assert.equal(fitButton.children[1].textContent, "Fit");
    assert.ok(results.children.length > 1);
    assert.equal(direction.disabled, true);
    assert.equal(depth.disabled, true);
    assert.equal(direction.parentElement.hidden, true);
    assert.equal(depth.parentElement.hidden, true);
    const searchList = results.afterElement;
    search.fire("focus");
    assert.equal(searchList.hidden, false);
    search.fire("keydown", { key: "ArrowDown", preventDefault() {} });
    assert.equal(search.attributes["aria-activedescendant"], searchList.children[0].id);
    search.fire("keydown", { key: "Escape", preventDefault() {} });
    assert.equal(searchList.hidden, true);
    assert.equal(search.attributes["aria-expanded"], "false");
    search.value = "domain/checkout.ts";
    search.fire("input");
    search.fire("keydown", { key: "Enter", preventDefault() {} });
    assert.match(stats.textContent, /files shown/);
    assert.equal(lastGraph.nodes('[type = "layer"]').length, 0);
    assert.ok(lastGraph.nodes('[type = "file"]').length > 1);
    assert.equal(lastFit.length, lastGraph.elements().length);
    direction.value = "outbound";
    direction.fire("change");
    depth.value = "2";
    depth.fire("change");
    assert.match(stats.textContent, /^Map: Imports · 2 steps/);
    assert.ok(
      details.children.some((child) =>
        child.textContent?.includes("Direction and depth filter only the map"),
      ),
    );
    assert.ok(
      details.children.some((child) => child.children?.[0]?.textContent === "All direct importers"),
    );
    assert.ok(
      details.children.some((child) => child.children?.[0]?.textContent === "All direct imports"),
    );
    details.scrollTop = 100;
    depth.value = "1";
    depth.fire("change");
    assert.equal(details.scrollTop, 100);
    depth.value = "2";
    depth.fire("change");
    const importer = details.children.find(
      (child) => child.children?.[0]?.textContent === "All direct importers",
    );
    importer.children[1].children[0].children[0].fire("click");
    assert.equal(details.scrollTop, 0);
    assert.match(details.children[1].textContent, /ui\/Checkout.tsx/);
    details.scrollTop = 100;
    history.go(-1);
    assert.equal(details.scrollTop, 0);
    assert.match(details.children[1].textContent, /domain\/checkout.ts/);
    view.value = "impact";
    view.fire("change");
    results.value = "ui/Checkout.tsx";
    results.fire("change");
    assert.equal(view.value, "impact");
    history.go(-1);
    assert.equal(view.value, "impact");
    assert.equal(direction.value, "outbound");
    assert.equal(depth.value, "2");
    setLocation(
      "/?page=architecture#file=domain%2Fcheckout.ts&view=map&graph=invalid&direction=sideways&depth=99&cycle=invalid",
    );
    listeners.popstate();
    assert.equal(view.value, "dependencies");
    assert.equal(direction.value, "both");
    assert.equal(depth.value, "1");
    assert.equal(cycle.value, "");
    assert.match(header.children[4].textContent, /default options/);
    setLocation(locations[position]);
    listeners.popstate();
    view.value = "dependencies";
    view.fire("change");
    lastGraph.zoom(0.7);
    resize();
    assert.equal(lastGraph.zoom(), 0.7);
    direction.value = "outbound";
    direction.fire("change");
    assert.equal(lastGraph.zoom(), 0.7);
    container.clientWidth = 800;
    resize();
    assert.equal(lastGraph.zoom(), 0.7);
    container.clientWidth = 1200;
    resize();
    assert.equal(searchList.hidden, true);
    back.fire("click");
    view.value = "impact";
    view.fire("change");
    assert.match(container.children[0].textContent, /Select a file/);
    assert.equal(legend.children.length, 0);
    assert.equal(stats.textContent, "");
    assert.equal(fitButton.disabled, true);
    history.go(-1);
    assert.equal(view.value, "dependencies");
    assert.equal(fitButton.disabled, false);
    history.go(1);
    assert.equal(view.value, "impact");
    assert.match(container.children[0].textContent, /Select a file/);
    view.value = "dependencies";
    view.fire("change");
    search.value = "checkout";
    search.fire("input");
    results.value = "domain/checkout.ts";
    results.fire("change");
    assert.equal(direction.disabled, false);
    assert.equal(depth.disabled, false);
    assert.equal(direction.parentElement.hidden, false);
    assert.equal(depth.parentElement.hidden, false);
    assert.equal(fitButton.disabled, false);
    const neighbors = details.children.find(
      (child) => child.children?.[0]?.textContent === "Files shown in this view",
    );
    assert.ok(
      neighbors.children[1].children.some((item) => item.children[0].textContent.includes("/")),
    );
    const edge = lastGraph.edges()[0];
    edge.emit("tap");
    assert.equal(details.children[0].textContent, "Dependency");
    assert.equal(details.children[1].textContent, "Importer → imported");
    const graphModes = controls.secondary.children[0];
    assert.equal(graphModes.children[0].attributes["aria-pressed"], "true");
    graphModes.children[0].fire("click");
    assert.equal(details.children[1].textContent, "domain/checkout.ts");
    direction.value = "inbound";
    depth.value = "2";
    const updated = structuredClone(model);
    updated.projectGraph.nodes.push({
      id: "new/checkout.ts",
      path: "new/checkout.ts",
      layerId: "domain",
    });
    renderer.render(updated);
    assert.match(stats.textContent, /files shown/);
    assert.equal(search.value, "checkout");
    assert.equal(direction.value, "inbound");
    assert.equal(depth.value, "2");
    assert.ok(results.children.some((option) => option.value === "new/checkout.ts"));
    graphModes.children[2].fire("click");
    assert.equal(view.value, "impact");
    assert.equal(lastFit.length, lastGraph.elements().length);
    assert.equal(graphModes.children[2].attributes["aria-pressed"], "true");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    assert.ok(
      details.children[2].children.some((item) => item.textContent === "Other reachable consumers"),
    );
    assert.ok(
      details.children.find((child) => child.children?.[0]?.textContent === "Direct consumers")
        .open,
    );
    assert.equal(direction.parentElement.hidden, true);
    assert.equal(cycle.parentElement.hidden, true);
    renderer.render(updated);
    assert.equal(view.value, "impact");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    search.value = "domain/checkout";
    search.fire("input");
    const anotherFile = lastGraph
      .nodes('[type = "file"]')
      .filter((node) => node.data("canonicalId") !== "domain/checkout.ts")[0];
    assert.ok(anotherFile);
    anotherFile.emit("tap");
    assert.equal(results.value, "");
    assert.equal(search.value, "domain/checkout");
    assert.equal(view.value, "impact");
    lastGraph.emit("tap");
    assert.ok(details.children[2].children.some((item) => item.textContent === "Direct consumers"));
    assert.equal(lastGraph.nodes('[type = "file"].is-selected').length, 1);
    const cyclic = structuredClone(updated);
    cyclic.projectGraph.edges.push({ source: "domain/checkout.ts", target: "ui/Checkout.tsx" });
    renderer.render(cyclic);
    view.value = "cycles";
    view.fire("change");
    assert.match(container.children[0].textContent, /Select a cycle group/);
    assert.equal(fitButton.disabled, true);
    assert.equal(cycle.parentElement.hidden, false);
    assert.ok(cycle.children.length > 1);
    cycle.value = cycle.children[1].value;
    cycle.fire("change");
    assert.equal(graphModes.children[3].attributes["aria-pressed"], "true");
    assert.equal(lastFit.length, lastGraph.elements().length);
    const selectedCycle = cycle.value;
    assert.equal(details.children[0].textContent, "Cycle group");
    const member = lastGraph.nodes('[type = "file"]')[0];
    member.emit("tap");
    assert.equal(view.value, "cycles");
    assert.equal(details.children[1].textContent, member.data("path"));
    const members = details.children.find(
      (child) => child.children?.[0]?.textContent === "Cycle members",
    );
    members.children[1].children[0].children[0].fire("click");
    assert.equal(view.value, "dependencies");
    assert.equal(view.value, "dependencies");
    view.value = "cycles";
    view.fire("change");
    lastGraph.emit("tap");
    assert.equal(details.children[0].textContent, "Cycle group");
    assert.ok(lastGraph.nodes('[type = "file"].is-selected').length > 0);
    renderer.render(cyclic);
    assert.equal(cycle.value, selectedCycle);
    assert.equal(details.children[0].textContent, "Cycle group");
    renderer.render(updated);
    assert.equal(cycle.value, "");
    assert.match(container.children[0].textContent, /No import cycles detected/);
    assert.equal(cycle.parentElement.hidden, true);
    assert.equal(fitButton.disabled, true);
    back.focus();
    back.fire("click");
    assert.equal(globalThis.document.activeElement, fitButton);
    assert.equal(results.value, "");
    assert.equal(view.value, "dependencies");
    assert.equal(direction.parentElement.hidden, true);
    assert.equal(cycle.parentElement.hidden, true);
    assert.match(stats.textContent, /listed files/);
    results.value = "domain/checkout.ts";
    results.fire("change");
    updated.projectGraph.nodes = updated.projectGraph.nodes.filter(
      (node) => node.id !== "domain/checkout.ts",
    );
    renderer.render(updated);
    assert.equal(workspace.children[1].hidden, false);
    renderer.clear();
    const partial = structuredClone(model);
    partial.projectGraph.complete = false;
    partial.overview = {
      directories: [{ path: ".", files: ["missing.js"] }],
      entryPoints: [],
      scope: { listedFileCount: 1 },
    };
    setLocation("/?page=architecture#file=missing.js&view=map&graph=impact");
    renderer.render(partial);
    assert.match(container.children[0].textContent, /unavailable for this file/);
    view.value = "dependencies";
    view.fire("change");
    assert.equal(direction.parentElement.hidden, true);
    assert.equal(depth.parentElement.hidden, true);
    view.value = "cycles";
    view.fire("change");
    assert.match(
      container.children[0].textContent,
      /partial graph.*Missing imports may hide cycles/,
    );
    partial.projectGraph.diagnostics = [];
    partial.projectGraph.edges.push({ source: "domain/checkout.ts", target: "ui/Checkout.tsx" });
    renderer.render(partial);
    assert.match(
      container.children[0].textContent,
      /Select a cycle group.*partial.*missing imports may hide cycles/,
    );
    renderer.clear();
    setLocation("/?page=architecture");
    const legacy = structuredClone(model);
    delete legacy.projectGraph;
    renderer.render(legacy);
    results.value = "domain/checkout.ts";
    results.fire("change");
    view.value = "impact";
    view.fire("change");
    assert.match(details.children[1].textContent, /unavailable/);
    assert.match(container.children[0].textContent, /unavailable/);
    assert.equal(legend.children.length, 0);
    assert.equal(stats.textContent, "");
    view.value = "cycles";
    view.fire("change");
    assert.match(container.children[0].textContent, /Cycles are unavailable/);
    assert.equal(cycle.parentElement.hidden, true);
    renderer.clear();
    const large = structuredClone(model);
    for (let i = 0; i < 14; i++)
      large.projectGraph.nodes.push({
        id: `extra${String(i).padStart(2, "0")}.js`,
        path: `extra${String(i).padStart(2, "0")}.js`,
      });
    large.projectGraph.edges.push(
      { source: "extra00.js", target: "extra13.js" },
      { source: "extra13.js", target: "extra00.js" },
    );
    setLocation("/?page=architecture");
    renderer.render(large);
    header.children[2].children.at(-1).fire("click");
    assert.equal(lastGraph.nodes().length, 6);
    const boundary = details.querySelector(".architecture-boundary-connections");
    const boundaryRow = boundary.children.find((row) =>
      row.children?.[0]?.textContent?.includes("extra00.js → extra13.js"),
    );
    assert.match(boundaryRow.children[0].textContent, /1 file import/);
    assert.match(boundaryRow.children[1].textContent, /extra13.js on page/);
    boundaryRow.children[1].fire("click");
    assert.ok(lastGraph.nodes().some((node) => node.data("path") === "extra13.js"));
    assert.match(globalThis.document.activeElement.textContent, /extra00.js on page 1/);
    history.go(-1);
    assert.doesNotMatch(location.hash, /page=/);
    assert.ok(lastGraph.nodes().some((node) => node.data("path") === "extra00.js"));
    const incomingRow = details
      .querySelector(".architecture-boundary-connections")
      .children.find((row) => row.children?.[0]?.textContent?.includes("extra13.js → extra00.js"));
    incomingRow.children[1].fire("click");
    assert.ok(lastGraph.nodes().some((node) => node.data("path") === "extra13.js"));
    assert.doesNotMatch(location.hash, /file=/);
    assert.match(globalThis.document.activeElement.textContent, /extra00.js on page 1/);
    history.go(-1);
    assert.doesNotMatch(location.hash, /page=/);
    details.scrollTop = 30;
    details.querySelector(".architecture-directory-pages").children[1].fire("click");
    assert.match(location.hash, /view=map.*page=2/);
    assert.equal(globalThis.document.activeElement.textContent, "Next page");
    assert.equal(details.scrollTop, 30);
    assert.ok(
      details.children.indexOf(details.querySelector(".architecture-directory-pages")) <
        details.children.findIndex((child) => child.textContent?.startsWith("Page ")),
    );
    const pageFile = lastGraph.nodes('[type = "file"]')[0].data("path");
    lastGraph.nodes('[type = "file"]')[0].emit("tap");
    assert.match(location.hash, /file=/);
    back.fire("click");
    assert.match(location.hash, /page=2/);
    assert.ok(lastGraph.nodes().some((node) => node.data("path") === pageFile));
    history.go(-1);
    assert.match(location.hash, /file=/);
    history.go(-1);
    assert.match(location.hash, /page=2/);
    history.go(-1);
    assert.doesNotMatch(location.hash, /page=/);
    setLocation("/?page=architecture#view=map&page=999");
    listeners.popstate();
    assert.match(
      location.hash,
      new RegExp(
        `page=${Math.ceil((14 + new Set(model.projectGraph.nodes.map((node) => node.path.split("/")[0])).size) / 6)}`,
      ),
    );
    renderer.clear();
    assert.equal(search.value, "");
    assert.equal(direction.value, "both");
    assert.equal(depth.value, "1");
    updated.projectGraph.complete = false;
    updated.projectGraph.diagnostics = ["Unresolved imports <example>"];
    renderer.render(updated);
    const diagnostics = created.find((element) => element.className === "architecture-diagnostics");
    assert.equal(diagnostics.hidden, false);
    assert.equal(diagnostics.children[1].children[0].textContent, "Unresolved imports <example>");
    renderer.clear();
    const hash = "a".repeat(64),
      symbol = { id: "f", name: "f", kind: "function", startLine: 1, endLine: 2, signature: "f()" };
    const source = {
      file: "domain/checkout.ts",
      hash,
      source: "function f() {\n call(); }",
      symbols: [symbol],
      calls: [{ name: "call", ownerId: "f", line: 2, column: 2 }],
      diagnostics: [],
    };
    globalThis.fetch = async (url) => ({
      ok: true,
      json: async () =>
        url.startsWith("/api/source?")
          ? source
          : { root: { ...symbol, hash }, nodes: [], edges: [], coverage: { files: [] } },
    });
    setLocation("/?page=architecture#file=domain%2Fcheckout.ts&view=source&symbol=f");
    const renderer2 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer2.render(model);
    await new Promise(setImmediate);
    const sourcePanel = created.filter((element) => element.className === "source-explorer").at(-1);
    assert.ok(
      !sourcePanel.children[1].children.some((child) => child.textContent === "Previous location"),
    );
    const detail = () => sourcePanel.querySelector(".source-explorer-detail");
    const unresolved = detail().querySelector(".source-explorer-unresolved");
    unresolved.open = true;
    unresolved.children[1].children[0].fire("click");
    await new Promise(setImmediate);
    assert.match(location.hash, /line=2&column=2&hash=/);
    assert.match(location.hash, new RegExp(hash));
    assert.equal(history.state.source.location.line, 2);
    assert.equal(sourcePanel.children[1].children[0].textContent, "Previous location");
    sourcePanel.children[1].children[0].fire("click");
    await new Promise(setImmediate);
    assert.equal(history.state.source.location, null);
    history.go(1);
    await new Promise(setImmediate);
    assert.equal(history.state.source.location.line, 2);
    assert.equal(sourcePanel.children[1].children[0].textContent, "Previous location");
    renderer2.clear();
    const renderer3 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer3.render(model);
    await new Promise(setImmediate);
    const reloadedPanel = created
      .filter((element) => element.className === "source-explorer")
      .at(-1);
    assert.equal(reloadedPanel.children[1].children[0].textContent, "Previous location");
    reloadedPanel.children[1].children[0].fire("click");
    await new Promise(setImmediate);
    assert.equal(history.state.source.location, null);
    setLocation("/?page=architecture#file=domain%2Fcheckout.ts&view=source&symbol=f&line=2");
    listeners.popstate();
    await new Promise(setImmediate);
    assert.ok(
      reloadedPanel.children.some((child) =>
        /linked call site is no longer available/.test(child.textContent || ""),
      ),
    );
    assert.ok(
      !reloadedPanel.children[1].children.some(
        (child) => child.textContent === "Previous location",
      ),
    );
    renderer3.clear();
    const other = {
      id: "g",
      name: "g",
      kind: "function",
      startLine: 1,
      endLine: 1,
      signature: "g()",
    };
    const otherHash = "b".repeat(64),
      otherPath = "ui/Checkout.tsx";
    const linked = {
      ...source,
      calls: [
        {
          ...source.calls[0],
          status: "resolved",
          target: { ...other, file: otherPath, hash: otherHash },
        },
      ],
    };
    globalThis.fetch = async (url) => ({
      ok: true,
      json: async () =>
        url.startsWith("/api/source?")
          ? url.includes(encodeURIComponent(otherPath))
            ? {
                file: otherPath,
                hash: otherHash,
                source: "function g() {}",
                symbols: [other],
                calls: [],
                diagnostics: [],
              }
            : linked
          : { nodes: [], edges: [], coverage: { files: [] } },
    });
    setLocation("/?page=architecture#file=domain%2Fcheckout.ts&view=source&symbol=f");
    const renderer4 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer4.render(model);
    await new Promise(setImmediate);
    const panel4 = created.filter((element) => element.className === "source-explorer").at(-1);
    panel4.querySelector(".source-explorer-call").children[1].fire("click");
    await new Promise(setImmediate);
    assert.equal(panel4.children[1].children[0].textContent, "Previous location");
    const header4 = created.filter((element) => element.className === "architecture-browser").at(-1)
      .children[1].children[0];
    header4.children[2].children.find((button) => button.dataset.mode === "map").fire("click");
    header4.children[2].children.find((button) => button.dataset.mode === "source").fire("click");
    assert.match(location.hash, /file=ui%2FCheckout.tsx.*view=source.*symbol=g/);
    assert.equal(panel4.querySelector(".source-explorer-heading").textContent.includes("g"), true);
    assert.ok(
      !panel4.children[1].children.some((child) => child.textContent === "Previous location"),
    );
    history.go(-1);
    history.go(-1);
    await new Promise(setImmediate);
    assert.equal(panel4.children[1].children[0].textContent, "Previous location");
    panel4.children[1].children[0].fire("click");
    await new Promise(setImmediate);
    assert.match(location.hash, /file=domain%2Fcheckout.ts.*symbol=f/);
    panel4.querySelector(".source-explorer-code").scrollTop = 211.5;
    header4.children[2].children.find((button) => button.dataset.mode === "map").fire("click");
    assert.equal(history.state.retainedSource.state.symbol, "f");
    assert.equal(history.state.retainedSource.state.scroll, 211.5);
    renderer4.clear();
    let sourceFetches = 0;
    const fetchBeforeReload = globalThis.fetch;
    globalThis.fetch = (...args) => {
      if (args[0].startsWith("/api/source?")) sourceFetches++;
      return fetchBeforeReload(...args);
    };
    const details5 = new Element();
    const renderer5 = architecture.createRenderer({
      container: new Element(),
      details: details5,
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer5.render(model);
    await new Promise(setImmediate);
    assert.equal(sourceFetches, 0);
    const header5 = created.filter((element) => element.className === "architecture-browser").at(-1)
      .children[1].children[0];
    details5.children.find((button) => button.textContent === "Explore code").fire("click");
    await new Promise(setImmediate);
    assert.equal(sourceFetches, 1);
    assert.match(location.hash, /file=domain%2Fcheckout.ts.*view=source.*symbol=f/);
    const panel5 = created.filter((element) => element.className === "source-explorer").at(-1);
    assert.match(panel5.querySelector(".source-explorer-heading").textContent, /f/);
    assert.equal(panel5.querySelector(".source-explorer-code").scrollTop, 211.5);
    header5.children[2].children.find((button) => button.dataset.mode === "map").fire("click");
    renderer5.clear();
    const rendererTab = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    rendererTab.render(model);
    const headerTab = created
      .filter((element) => element.className === "architecture-browser")
      .at(-1).children[1].children[0];
    headerTab.children[2].children.find((button) => button.dataset.mode === "source").fire("click");
    await new Promise(setImmediate);
    assert.match(location.hash, /view=source.*symbol=f/);
    headerTab.children[2].children.find((button) => button.dataset.mode === "map").fire("click");
    rendererTab.clear();
    globalThis.fetch = async (url) => ({
      ok: true,
      json: async () =>
        url.startsWith("/api/source?")
          ? { ...source, hash: "c".repeat(64) }
          : { nodes: [], edges: [], coverage: { files: [] } },
    });
    const renderer6 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer6.render(model);
    const header6 = created.filter((element) => element.className === "architecture-browser").at(-1)
      .children[1].children[0];
    header6.children[2].children.find((button) => button.dataset.mode === "source").fire("click");
    await new Promise(setImmediate);
    assert.doesNotMatch(location.hash, /symbol=/);
    renderer6.clear();

    // Fit and manual cameras survive resize and browser reload in their own history entry.
    setLocation("/?page=architecture#file=domain%2Fcheckout.ts&view=map");
    states[position] = { retainedSource: { marker: true }, nativePrevious: { marker: true } };
    const canvas7 = new Element(),
      fit7 = new Element();
    const renderer7 = architecture.createRenderer({
      container: canvas7,
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: fit7,
    });
    renderer7.render(model, "Same name", "project-a");
    const beforePollGraph = lastGraph,
      beforePollCreations = graphCreations,
      beforePollLayouts = layoutCalls;
    renderer7.render({ state: "running" }, "Same name", "project-a");
    renderer7.render(structuredClone(model), "Same name", "project-a");
    assert.equal(lastGraph, beforePollGraph);
    assert.equal(graphCreations, beforePollCreations);
    assert.equal(layoutCalls, beforePollLayouts);
    const changedMetrics = structuredClone(model);
    changedMetrics.projectGraph.nodes[0].metrics = {
      ...changedMetrics.projectGraph.nodes[0].metrics,
      maintainability: 42,
    };
    renderer7.render(changedMetrics, "Same name", "project-a");
    assert.equal(graphCreations, beforePollCreations + 1);
    const changedTopology = structuredClone(changedMetrics);
    changedTopology.projectGraph.edges = [];
    renderer7.render(changedTopology, "Same name", "project-a");
    assert.equal(graphCreations, beforePollCreations + 2);
    assert.equal(lastGraph.edges().length, 0);
    renderer7.render(model, "Same name", "project-a");
    assert.equal(graphCreations, beforePollCreations + 3);
    fit7.fire("click");
    const beforeResizeFit = fitCalls;
    canvas7.clientWidth = 390;
    canvas7.clientHeight = 500;
    resize();
    assert.ok(fitCalls > beforeResizeFit);
    assert.equal(lastRankDir, "TB");
    const fitAfterResize = fitCalls,
      layoutsAfterResize = layoutCalls;
    resize();
    assert.equal(fitCalls, fitAfterResize);
    assert.equal(layoutCalls, layoutsAfterResize);
    canvas7.clientWidth = 900;
    resize();
    assert.equal(lastRankDir, "LR");
    const graphBeforePan = lastGraph,
      creationsBeforePan = graphCreations,
      layoutsBeforePan = layoutCalls;
    lastGraph.zoom(0.75);
    lastGraph.pan({ x: 100, y: 80 });
    assert.equal(lastGraph, graphBeforePan);
    assert.equal(graphCreations, creationsBeforePan);
    assert.equal(layoutCalls, layoutsBeforePan);
    const cameraEntries = locations.length;
    assert.equal(locations.length, cameraEntries);
    assert.equal(history.state.camera.mode, "manual");
    assert.equal(history.state.nativePrevious.marker, true);
    assert.equal(history.state.retainedSource.marker, true);
    const manual = history.state.camera;
    canvas7.clientWidth = 390;
    resize();
    assert.equal(lastGraph.zoom(), manual.zoom);
    assert.equal(lastGraph.pan().x, manual.pan.x - 255);
    const savedCamera = history.state.camera;
    renderer7.clear();
    const canvas8 = new Element(),
      fit8 = new Element();
    const renderer8 = architecture.createRenderer({
      container: canvas8,
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: fit8,
    });
    renderer8.render(model, "Same name", "project-a");
    assert.equal(lastGraph.zoom(), savedCamera.zoom);
    assert.deepEqual(lastGraph.pan(), savedCamera.pan);
    fit8.fire("click");
    assert.equal(history.state.camera.mode, "fit");
    renderer8.clear();
    const fitCount = fitCalls;
    const renderer9 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer9.render(model, "Same name", "project-a");
    assert.ok(fitCalls > fitCount);
    renderer9.clear();
    states[position].camera = { ...savedCamera, zoom: NaN };
    const renderer10 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer10.render(model, "Same name", "project-a");
    assert.notEqual(lastGraph.zoom(), savedCamera.zoom);
    renderer10.clear();
    states[position].camera = savedCamera;
    const foreignRenderer = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    foreignRenderer.render(model, "Same name", "project-b");
    assert.notEqual(lastGraph.zoom(), savedCamera.zoom);
    foreignRenderer.clear();

    // Selecting another file from Source keeps the tab and Back restores its state.
    let sourceFetch = fetchBeforeReload;
    globalThis.fetch = (...args) => sourceFetch(...args);
    setLocation("/?page=architecture#file=domain%2Fcheckout.ts&view=source&symbol=f");
    const renderer11 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer11.render(model);
    await new Promise(setImmediate);
    const panel11 = created.filter((element) => element.className === "source-explorer").at(-1);
    panel11.querySelector(".source-explorer-code").scrollTop = 177;
    const controls11 = created
      .filter((element) => element.className === "architecture-controls")
      .at(-1);
    controls11.controls[1].value = otherPath;
    controls11.controls[1].fire("change");
    await new Promise(setImmediate);
    assert.match(location.hash, /file=ui%2FCheckout.tsx.*view=source/);
    assert.doesNotMatch(location.hash, /symbol=/);
    assert.match(panel11.attributes["aria-label"], /ui\/Checkout.tsx/);
    history.go(-1);
    await new Promise(setImmediate);
    assert.match(location.hash, /domain%2Fcheckout.ts.*symbol=f/);
    assert.equal(panel11.querySelector(".source-explorer-code").scrollTop, 177);
    let finishOther;
    sourceFetch = (url, options) =>
      url.startsWith("/api/source?") && url.includes(encodeURIComponent(otherPath))
        ? new Promise((resolve) => {
            finishOther = resolve;
          })
        : fetchBeforeReload(url, options);
    controls11.controls[1].value = otherPath;
    controls11.controls[1].fire("change");
    const tree11 = created.filter((element) => element.className === "project-tree").at(-1);
    const findPath = (node, path) =>
      node.dataset?.path === path
        ? node
        : node.children?.map((child) => findPath(child, path)).find(Boolean);
    const item11 = findPath(tree11, "domain/checkout.ts"),
      row11 = item11.children[0];
    row11.parentElement = item11;
    tree11.fire("click", {
      target: { closest: (selector) => (selector === ".project-tree-row" ? row11 : null) },
    });
    await new Promise(setImmediate);
    finishOther({
      ok: true,
      json: async () => ({
        file: otherPath,
        hash: otherHash,
        source: "function g() {}",
        symbols: [other],
        calls: [],
        diagnostics: [],
      }),
    });
    await new Promise(setImmediate);
    assert.match(location.hash, /domain%2Fcheckout.ts.*view=source/);
    assert.match(panel11.attributes["aria-label"], /domain\/checkout.ts/);
    assert.equal(document.activeElement.dataset.path, "domain/checkout.ts");
    renderer11.clear();

    history.replaceState({}, "", "/?page=architecture#file=domain%2Fcheckout.ts&view=map");
    const renderer12 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer12.render(model);
    history.pushState({}, "", "/?page=architecture#file=ui%2FCheckout.tsx&view=map");
    listeners.popstate();
    lastGraph.zoom(0.73);
    lastGraph.pan({ x: 37, y: 52 });
    history.go(-1);
    await new Promise((resolve) => setTimeout(resolve, 200));
    history.go(1);
    assert.equal(lastGraph.zoom(), 0.73);
    assert.deepEqual(lastGraph.pan(), { x: 37, y: 52 });
    const replaceState = history.replaceState;
    history.replaceState = () => {
      throw new DOMException("Rate limited", "SecurityError");
    };
    assert.doesNotThrow(() => lastGraph.pan({ x: 38, y: 52 }));
    history.replaceState = replaceState;
    renderer12.clear();
    const clearedState = structuredClone(history.state);
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.deepEqual(history.state, clearedState);

    history.replaceState({}, "", "/?page=architecture#view=map&page=999");
    const renderer13 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer13.render(large);
    assert.doesNotMatch(location.hash, /page=999/);
    lastGraph.zoom(0.73);
    lastGraph.pan({ x: 21, y: 34 });
    const oldPageHash = location.hash;
    renderer13.clear();
    const renderer14 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer14.render(large);
    assert.equal(lastGraph.zoom(), 0.73);
    assert.deepEqual(lastGraph.pan(), { x: 21, y: 34 });
    const shrunk = structuredClone(large);
    shrunk.projectGraph.nodes = shrunk.projectGraph.nodes.filter(
      (node) => !/^extra(?:0[4-9]|1[0-3])\.js$/.test(node.path),
    );
    renderer14.render(shrunk);
    assert.notEqual(location.hash, oldPageHash);
    lastGraph.zoom(0.68);
    lastGraph.pan({ x: 44, y: 55 });
    renderer14.clear();
    const renderer15 = architecture.createRenderer({
      container: new Element(),
      details: new Element(),
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer15.render(shrunk);
    assert.equal(lastGraph.zoom(), 0.68);
    assert.deepEqual(lastGraph.pan(), { x: 44, y: 55 });
    renderer15.clear();

    history.replaceState({}, "", "/?page=architecture");
    const mapDetails = new Element();
    const renderer16 = architecture.createRenderer({
      container: new Element(),
      details: mapDetails,
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer16.render(model);
    const overviewPanel = created
      .filter((element) => element.className === "architecture-workspace")
      .at(-1).children[1];
    overviewPanel.children.find((child) => child.textContent === "Open project map").fire("click");
    assert.match(location.hash, /view=map.*graph=project/);
    lastGraph.zoom(0.61);
    lastGraph.pan({ x: 12, y: 24 });
    const layer = lastGraph
      .nodes('[type = "overview-layer"]')
      .find((node) => node.data("layerId") === "domain");
    assert.ok(layer);
    const layerList = mapDetails.children.find(
      (child) => child.className === "architecture-layer-list",
    );
    layerList.children
      .find((button) => button.textContent.startsWith(`${layer.data("label")} ·`))
      .fire("click");
    assert.match(location.hash, /layer=/);
    lastGraph.zoom(0.92);
    lastGraph.pan({ x: 45, y: 67 });
    const layerFiles = mapDetails.children.find(
      (child) => child.children?.[0]?.textContent === "Files in this layer",
    );
    assert.ok(layerFiles);
    const fileRow = layerFiles.children[1].children[0];
    assert.equal(fileRow.children.length, 1);
    const fileLink = fileRow.children[0];
    assert.equal(fileLink.className, "architecture-file-link");
    assert.equal(fileLink.getAttribute("aria-label"), `Explore ${fileLink.textContent}`);
    fileLink.fire("click");
    assert.match(location.hash, /file=.*view=map/);
    history.go(-1);
    assert.match(location.hash, /graph=project.*layer=/);
    assert.equal(lastGraph.zoom(), 0.92);
    assert.deepEqual(lastGraph.pan(), { x: 45, y: 67 });
    assert.ok(
      mapDetails.children.find(
        (child) => child.children?.[0]?.textContent === "Files in this layer",
      ),
    );
    history.go(-1);
    assert.doesNotMatch(location.hash, /layer=/);
    assert.equal(lastGraph.zoom(), 0.61);
    assert.deepEqual(lastGraph.pan(), { x: 12, y: 24 });
    history.go(1);
    mapDetails.scrollTop = 200;
    mapDetails.children.find((child) => child.textContent === "All layers").fire("click");
    assert.equal(mapDetails.scrollTop, 0);
    renderer16.clear();

    const cycleGroup = JSON.stringify(["domain/checkout.ts", "ui/Checkout.tsx"]);
    history.replaceState(
      {},
      "",
      `/?page=architecture#view=map&graph=cycles&cycle=${encodeURIComponent(cycleGroup)}`,
    );
    const cycleDetails = new Element();
    const renderer17 = architecture.createRenderer({
      container: new Element(),
      details: cycleDetails,
      legend: new Element(),
      stats: new Element(),
      fitButton: new Element(),
    });
    renderer17.render(cyclic);
    assert.equal(cycleDetails.children[0].textContent, "Cycle group");
    assert.equal(lastGraph.nodes('[type = "file"]').length, 2);
    assert.ok(
      cycleDetails.children.find((child) => child.children?.[0]?.textContent === "Cycle members"),
    );
    renderer17.clear();
  } finally {
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
    globalThis.Option = oldOption;
    globalThis.ResizeObserver = oldResizeObserver;
    globalThis.fetch = oldFetch;
  }
});

test("analytics uses the full graph for unique consumers and cycle groups", async () => {
  const { analytics, impact, projectSelection } =
    await import("../public/app/features/architecture/architectureProjection.js");
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
