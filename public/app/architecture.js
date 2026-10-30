import { overview, searchFiles, focus } from "./architectureProjection.js";

const NODE_WIDTH = 142;
const NODE_HEIGHT = 48;
const CHILD_GAP_X = 18;
const CHILD_GAP_Y = 26;
const GROUP_GAP = 48;
const GROUP_PADDING_X = 28;
const GROUP_PADDING_Y = 78;

function createRenderer({ container, details, fitButton, legend, stats }) {
  let graph = null;
  let currentModel = null;
  let selected = null;
  const controls = document.createElement("div");
  controls.className = "architecture-controls";
  controls.innerHTML = `<label>Find file <input type="search" placeholder="Search file paths" autocomplete="off"></label>
    <label>Matching files <select aria-label="Matching files"><option value="">Search for a file</option></select></label>
    <label>Direction <select aria-label="Dependency direction"><option value="both">Both</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>
    <label>Depth <select aria-label="Dependency depth"><option value="1">1</option><option value="2">2</option></select></label>
    <button type="button" class="secondary-button">Back to layers</button>`;
  legend.before(controls);
  const [search, results, direction, depth, back] = controls.querySelectorAll("input, select, button");
  function refreshSearch() {
    const matches = currentModel ? searchFiles(currentModel, search.value) : [];
    results.replaceChildren(new Option(!search.value.trim() ? "Search for a file" : matches.length ? `${matches.length} matching files` : "No matching files", ""), ...matches.map((node) => new Option(node.path, node.canonicalId)));
  }
  search.addEventListener("input", refreshSearch);
  results.addEventListener("change", () => { if (results.value) { selected = results.value; draw(); } });
  direction.addEventListener("change", () => { if (selected) draw(); });
  depth.addEventListener("change", () => { if (selected) draw(); });
  back.addEventListener("click", () => { selected = null; draw(); });
  fitButton.addEventListener("click", () => { if (graph) { graph.resize(); graph.fit(graph.elements(), 36); } });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (graph && container.clientWidth) { graph.resize(); graph.fit(graph.elements(), 36); } }).observe(container);

  function clear(message = "No project structure yet.") {
    destroyGraph(); currentModel = null; selected = null;
    search.value = ""; direction.value = "both"; depth.value = "1";
    results.replaceChildren(new Option("Search for a file", ""));
    controls.hidden = true;
    container.replaceChildren(emptyState(message));
    legend.replaceChildren(); stats.textContent = "";
    renderPrompt(details, "Search for a file to explore its dependencies.");
  }
  function render(model) {
    if (model?.state !== "ready") { clear(unavailableMessage(model)); return; }
    currentModel = model;
    if (selected && !(model.projectGraph?.nodes || []).some((node) => node.id === selected)) selected = null;
    refreshSearch();
    controls.hidden = false;
    draw();
  }
  function draw() {
    destroyGraph();
    const projection = selected ? focus(currentModel, selected, direction.value, Number(depth.value)) : overview(currentModel);
    if (!projection.nodes.length) { clear("No project files were discovered for the architecture map."); return; }
    if (typeof window.cytoscape !== "function") { clear("Cytoscape.js could not be loaded."); return; }
    container.replaceChildren();
    graph = window.cytoscape(createGraphOptions(container, projection, calculatePositions(projection.nodes, container.clientWidth || 960)));
    bindGraphInteractions(graph, details, (id) => { selected = id; draw(); });
    renderLegend(legend, graph, projection.nodes, details);
    const status = projection.complete ? "" : " · partial dependency graph";
    stats.textContent = selected
      ? `${formatNumber(projection.shownFiles)} / ${formatNumber(projection.totalFiles)} files shown · ${formatNumber(projection.shownEdges)} / ${formatNumber(projection.totalEdges)} dependencies shown${status}`
      : `${formatNumber(projection.fileCount)} graph files / ${formatNumber(currentModel.totalFileCount)} listed · ${formatNumber(projection.nodes.length)} layers · ${formatNumber(projection.edgeCount)} file dependencies${status}`;
    back.disabled = !selected;
    if (selected) {
      const node = projection.nodes.find((item) => item.canonicalId === selected);
      if (node) { graph.getElementById(node.id).addClass("is-selected"); renderFileDetails(details, node, graph, currentModel); }
    } else renderPrompt(details, "Search for a file to explore its dependencies. Arrows show imports; edge labels count file dependencies.");
  }
  function destroyGraph() { if (graph) graph.destroy(); graph = null; }
  return { clear, render };
}

function createGraphOptions(container, model, positions) {
  return {
    autoungrabify: true,
    boxSelectionEnabled: false,
    container,
    elements: toCytoscapeElements(model, positions),
    layout: { name: "preset", fit: true, padding: 36 },
    maxZoom: 2.4,
    minZoom: 0.25,
    style: graphStyle(),
    textureOnViewport: true,
    userPanningEnabled: false
  };
}

function toCytoscapeElements(model, positions = new Map()) {
  const nodes = (model.nodes || []).map((node) => ({
    data: node,
    classes: node.entryPoint ? "entry-point" : "",
    position: positions.get(node.id)
  }));
  const edges = (model.edges || []).map((edge) => ({
    data: edge,
    classes: edge.crossLayer ? "cross-layer" : ""
  }));
  return [...nodes, ...edges];
}

function calculatePositions(nodes, containerWidth) {
  const overviewLayers = nodes.filter((node) => node.type === "overview-layer");
  if (overviewLayers.length) {
    const columns = containerWidth >= 700 ? 3 : containerWidth >= 450 ? 2 : 1;
    const positions = new Map();
    overviewLayers.forEach((node, index) => positions.set(node.id, {
      x: 110 + (index % columns) * 220,
      y: 50 + Math.floor(index / columns) * 105
    }));
    return positions;
  }
  const layers = nodes.filter((node) => node.type === "layer");
  const childrenByParent = new Map();
  nodes.filter((node) => node.type !== "layer").forEach((node) => {
    const siblings = childrenByParent.get(node.parent);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parent, [node]);
  });
  const columns = containerWidth >= 700 ? 3 : containerWidth >= 450 ? 2 : 1;
  const availableWidth = Math.max(320, containerWidth - GROUP_GAP * (columns + 1));
  const targetGroupWidth = Math.floor(availableWidth / columns);
  const childColumns = 1;
  const contentWidth = childColumns * NODE_WIDTH + (childColumns - 1) * CHILD_GAP_X;
  const groupWidth = Math.max(200, targetGroupWidth, contentWidth + GROUP_PADDING_X * 2);
  const positions = new Map();
  let rowTop = GROUP_GAP;

  for (let rowStart = 0; rowStart < layers.length; rowStart += columns) {
    const rowLayers = layers.slice(rowStart, rowStart + columns);
    const rowHeight = Math.max(...rowLayers.map((layerNode) => {
      const childCount = (childrenByParent.get(layerNode.id) || []).length;
      return groupHeight(childCount, childColumns);
    }));

    rowLayers.forEach((layerNode, columnIndex) => {
      const children = childrenByParent.get(layerNode.id) || [];
      const centerX = GROUP_GAP + columnIndex * (groupWidth + GROUP_GAP) + groupWidth / 2;
      const left = centerX - contentWidth / 2 + NODE_WIDTH / 2;
      const top = rowTop + GROUP_PADDING_Y;

      if (!children.length) positions.set(layerNode.id, { x: centerX, y: rowTop + 70 });
      children.forEach((child, childIndex) => {
        positions.set(child.id, {
          x: left + (childIndex % childColumns) * (NODE_WIDTH + CHILD_GAP_X),
          y: top + Math.floor(childIndex / childColumns) * (NODE_HEIGHT + CHILD_GAP_Y)
        });
      });
    });

    rowTop += rowHeight + GROUP_GAP;
  }

  return positions;
}

function groupHeight(childCount, childColumns) {
  const rows = Math.max(1, Math.ceil(childCount / childColumns));
  return GROUP_PADDING_Y + rows * NODE_HEIGHT + Math.max(0, rows - 1) * CHILD_GAP_Y + GROUP_PADDING_Y / 2;
}

function graphStyle() {
  return [
    {
      selector: "node",
      style: {
        "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
        "text-events": "yes"
      }
    },
    {
      selector: 'node[type = "layer"]',
      style: {
        shape: "round-rectangle",
        "background-color": "data(color)",
        "background-opacity": 0.08,
        "border-color": "data(color)",
        "border-opacity": 0.58,
        "border-width": 1,
        color: "data(color)",
        label: "data(label)",
        padding: `${GROUP_PADDING_X}px`,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        "font-size": 13,
        "font-weight": 700,
        "text-halign": "center",
        "text-valign": "top",
        "text-margin-y": -18
      }
    },
    {
      selector: 'node[type = "overview-layer"]',
      style: {
        shape: "round-rectangle", width: 185, height: 62,
        "background-color": "data(color)", "background-opacity": 0.16,
        "border-color": "data(color)", "border-width": 1,
        color: "#f5f1e8", label: "data(displayLabel)", "font-size": 12,
        "font-weight": 700, "text-halign": "center", "text-valign": "center",
        "text-wrap": "wrap", "text-max-width": 165
      }
    },
    {
      selector: 'node[type = "file"]',
      style: {
        shape: "round-rectangle",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        "background-color": "#202522",
        "border-color": "data(color)",
        "border-opacity": 0.62,
        "border-width": 1,
        color: "#f5f1e8",
        label: "data(label)",
        "font-size": 10,
        "font-weight": 600,
        "text-max-width": NODE_WIDTH - 18,
        "text-halign": "center",
        "text-valign": "center",
        "text-wrap": "ellipsis"
      }
    },
    {
      selector: "node.entry-point",
      style: {
        "border-width": 3,
        "background-color": "#273029"
      }
    },
    {
      selector: 'node[type = "summary"]',
      style: {
        shape: "round-rectangle",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        "background-opacity": 0,
        "border-color": "data(color)",
        "border-style": "dashed",
        "border-width": 1,
        color: "#aaa59a",
        label: "data(label)",
        "font-size": 10
      }
    },
    {
      selector: "edge",
      style: {
        width: "mapData(weight, 1, 5, 1, 4)",
        label: "data(weight)",
        "font-size": 10,
        color: "#f5f1e8",
        "text-background-color": "#202522",
        "text-background-opacity": 1,
        "curve-style": "bezier",
        "line-color": "#59625d",
        "line-opacity": 0.48,
        "target-arrow-color": "#59625d",
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.72
      }
    },
    {
      selector: "edge.cross-layer",
      style: {
        "line-color": "#b47cff",
        "line-opacity": 0.72,
        "target-arrow-color": "#b47cff"
      }
    },
    {
      selector: ".is-muted",
      style: { opacity: 0.12 }
    },
    {
      selector: ".is-active",
      style: {
        opacity: 1,
        "line-opacity": 0.96,
        "z-index": 999
      }
    },
    {
      selector: "node.is-selected",
      style: {
        "border-width": 3,
        "overlay-color": "data(color)",
        "overlay-opacity": 0.12,
        "overlay-padding": 7
      }
    }
  ];
}

function bindGraphInteractions(graph, details, selectFile) {
  graph.on("tap", 'node[type = "file"]', (event) => {
    const node = event.target;
    selectFile(node.data("canonicalId"));
  });
  graph.on("tap", 'node[type = "layer"], node[type = "overview-layer"]', (event) => {
    const node = event.target;
    const isOverview = node.data("type") === "overview-layer";
    const collection = isOverview ? node.closedNeighborhood() : node.add(node.descendants()).add(node.descendants().connectedEdges());
    focusCollection(graph, collection, node);
    if (isOverview) renderOverviewLayerDetails(details, node);
    else renderLayerDetails(details, node.data(), node.descendants());
  });
  graph.on("tap", (event) => {
    if (event.target !== graph) return;
    resetFocus(graph);
    renderPrompt(details, "Select a file to inspect its role and Fallow metrics.");
  });
}

function focusCollection(graph, collection, selectedNode) {
  graph.elements().addClass("is-muted").removeClass("is-active is-selected");
  collection.removeClass("is-muted").addClass("is-active");
  selectedNode.addClass("is-selected");
}

function resetFocus(graph) {
  graph.elements().removeClass("is-muted is-active is-selected");
}

function renderLegend(element, graph, nodes, details) {
  const layers = nodes.filter((node) => node.type === "layer" || node.type === "overview-layer");
  element.replaceChildren(...layers.map((layerNode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "architecture-legend-item";
    button.style.setProperty("--layer-color", layerNode.color);
    button.textContent = `${layerNode.label} · ${formatNumber(layerNode.fileCount)}`;
    button.addEventListener("click", () => {
      const node = graph.getElementById(layerNode.id);
      const collection = layerNode.type === "overview-layer" ? node.closedNeighborhood() : node.add(node.descendants()).add(node.descendants().connectedEdges());
      focusCollection(graph, collection, node);
      if (layerNode.type === "overview-layer") {
        renderOverviewLayerDetails(details, node);
        graph.fit(collection, 44);
      } else {
        renderLayerDetails(details, node.data(), node.descendants());
        graph.fit(node.add(node.descendants()), 44);
      }
    });
    return button;
  }));
}

function renderStats(element, model) {
  const parts = [
    `${formatNumber(model.totalFileCount)} files`,
    `${formatNumber(model.layerCount)} layers`,
    `${formatNumber((model.edges || []).length)} imports`,
    `${formatNumber(model.crossLayerEdgeCount)} cross-layer`
  ];
  if (model.truncated) parts.push(`${formatNumber(model.visibleFileCount)} shown`);
  if (model.projectGraph && !model.projectGraph.complete) parts.push("partial dependency graph");
  if (model.inspectionErrorCount) parts.push(`${formatNumber(model.inspectionErrorCount)} traces unavailable`);
  element.textContent = parts.join(" · ");
}

function renderFileDetails(element, data, graph, model) {
  const metrics = data.metrics || {};
  const raw = model?.projectGraph?.edges || [];
  const unique = new Map(raw.map((edge) => [JSON.stringify([edge.source, edge.target]), edge]));
  const edges = model?.projectGraph ? [...unique.values()] : graph.edges().map((edge) => edge.data());
  const id = model?.projectGraph ? data.canonicalId : data.id;
  const outgoing = edges.filter((edge) => edge.source === id).length;
  const incoming = edges.filter((edge) => edge.target === id).length;
  renderDetails(element, data.label, data.path, [
    ["Layer", layerLabel(graph, data.parent)],
    ["Entry point", data.entryPoint ? "Yes" : "No"],
    ["Imports", outgoing],
    ["Imported by", incoming],
    ["Fallow fan-in", metrics.fanIn ?? "Unavailable"],
    ["Fallow fan-out", metrics.fanOut ?? "Unavailable"],
    ["Lines", metrics.lines ?? "Unavailable"],
    ["Maintainability", metrics.maintainability == null ? "Unavailable" : Number(metrics.maintainability).toFixed(1)]
  ]);
}

function renderOverviewLayerDetails(element, node) {
  const edges = node.connectedEdges().map((edge) => edge.data());
  const id = node.id();
  const sum = (predicate) => edges.filter(predicate).reduce((total, edge) => total + edge.weight, 0);
  renderDetails(element, node.data("label"), "File dependencies", [
    ["Files", node.data("fileCount")],
    ["Outbound to other layers", sum((edge) => edge.source === id && edge.target !== id)],
    ["Inbound from other layers", sum((edge) => edge.target === id && edge.source !== id)],
    ["Within layer", sum((edge) => edge.source === id && edge.target === id)]
  ]);
}

function renderLayerDetails(element, data, descendants) {
  renderDetails(element, data.label, data.source === "fallow-boundary" ? "Configured Fallow boundary" : "Automatically classified", [
    ["Files", data.fileCount],
    ["Shown in map", descendants.filter('[type = "file"]').length]
  ]);
}

function renderDetails(element, title, subtitle, rows) {
  const heading = document.createElement("h3");
  heading.textContent = title;
  const description = document.createElement("p");
  description.className = "architecture-detail-path";
  description.textContent = subtitle;
  const list = document.createElement("dl");
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = String(value);
    list.append(term, detail);
  });
  element.replaceChildren(heading, description, list);
}

function renderPrompt(element, message) {
  const heading = document.createElement("h3");
  heading.textContent = "Project structure";
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  element.replaceChildren(heading, paragraph);
}

function layerLabel(graph, parentId) {
  const parent = graph.getElementById(parentId);
  return parent.empty() ? "Other" : parent.data("label");
}

function emptyState(message) {
  const node = document.createElement("div");
  node.className = "empty-state architecture-empty";
  node.textContent = message;
  return node;
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

export { calculatePositions, createGraphOptions, createRenderer, toCytoscapeElements };

function unavailableMessage(model) {
  if (model?.state === "running") return "Building project structure…";
  if (model?.error) return `Project structure unavailable: ${model.error}`;
  return "No project structure yet.";
}
