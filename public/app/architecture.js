import { overview, searchFiles, focus, analytics, impact, projectSelection } from "./architectureProjection.js";

const NODE_WIDTH = 142;
const NODE_HEIGHT = 48;
const GROUP_PADDING_X = 28;

function styledSelect(select) {
  const menu = document.createElement("details");
  menu.className = "architecture-select";
  const summary = document.createElement("summary");
  summary.setAttribute("aria-label", select.getAttribute("aria-label"));
  const list = document.createElement("div");
  list.className = "architecture-select-options";
  menu.append(summary, list);
  select.hidden = true;
  select.after(menu);
  function refresh() {
    const options = [...select.options];
    summary.textContent = options.find((option) => option.value === select.value)?.text || options[0]?.text || "";
    list.replaceChildren(...options.map((option) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.text;
      button.className = "architecture-select-option";
      button.setAttribute("aria-pressed", String(option.value === select.value));
      button.addEventListener("click", () => {
        select.value = option.value;
        menu.open = false;
        refresh();
        select.dispatchEvent(new Event("change", { bubbles: true }));
        summary.focus();
      });
      return button;
    }));
  }
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) { menu.open = false; summary.focus(); event.preventDefault(); }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    menu.open = true;
    const buttons = [...list.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : event.key === "ArrowDown" ? Math.min(index + 1, buttons.length - 1) : index <= 0 ? buttons.length - 1 : index - 1;
    buttons[next]?.focus();
  });
  menu.addEventListener("focusout", (event) => { if (!menu.contains(event.relatedTarget)) menu.open = false; });
  document.addEventListener("click", (event) => { if (!menu.contains(event.target)) menu.open = false; });
  refresh();
  return { refresh };
}

function createRenderer({ container, details, fitButton, legend, stats }) {
  let graph = null;
  let currentModel = null;
  let selected = null;
  let activeLayer = null;
  let analysis = null;
  const controls = document.createElement("div");
  controls.className = "architecture-controls";
  controls.innerHTML = `<label>Find file <input type="search" placeholder="Search file paths" autocomplete="off"></label>
    <label>Matching files <select aria-label="Matching files"><option value="">Search for a file</option></select></label>
    <label>Direction <select aria-label="Dependency direction"><option value="both">Both</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>
    <label>Depth <select aria-label="Dependency depth"><option value="1">1</option><option value="2">2</option></select></label>
    <button type="button" class="secondary-button">Back to layers</button>
    <label>View <select aria-label="Graph view"><option value="dependencies">Dependencies</option><option value="impact">Impact</option><option value="cycles">Cycles</option></select></label>
    <label>Cycle group <select aria-label="Cycle group"><option value="">Select a cycle</option></select></label>`;
  legend.before(controls);
  const [search, results, direction, depth, back, view, cycle] = controls.querySelectorAll("input, select, button");
  const dropdowns = [results, direction, depth, view, cycle].map(styledSelect);
  function refreshSearch() {
    const matches = currentModel ? searchFiles(currentModel, search.value) : [];
    results.replaceChildren(new Option(!search.value.trim() ? "Search for a file" : matches.length ? `${matches.length} matching files` : "No matching files", ""), ...matches.map((node) => new Option(node.path, node.canonicalId)));
    dropdowns[0].refresh();
  }
  search.addEventListener("input", refreshSearch);
  results.addEventListener("change", () => { if (results.value) { selected = results.value; if (view.value === "cycles") { view.value = "dependencies"; dropdowns[3].refresh(); } draw(); } });
  direction.addEventListener("change", () => { if (selected) draw(); });
  depth.addEventListener("change", () => { if (selected) draw(); });
  view.addEventListener("change", draw);
  cycle.addEventListener("change", draw);
  back.addEventListener("click", () => { selected = null; view.value = "dependencies"; dropdowns[3].refresh(); draw(); });
  fitButton.addEventListener("click", () => { if (graph) { graph.resize(); graph.fit(graph.elements(), 36); } });
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => { if (graph && container.clientWidth) { graph.resize(); graph.fit(graph.elements(), 36); } }).observe(container);

  function clear(message = "No project structure yet.") {
    destroyGraph(); currentModel = null; selected = null; activeLayer = null; analysis = null;
    search.value = ""; direction.value = "both"; depth.value = "1"; view.value = "dependencies"; cycle.value = "";
    cycle.replaceChildren(new Option("Select a cycle", ""));
    results.replaceChildren(new Option("Search for a file", ""));
    dropdowns.forEach((dropdown) => dropdown.refresh());
    controls.hidden = true;
    container.replaceChildren(emptyState(message));
    legend.replaceChildren(); stats.textContent = "";
    renderPrompt(details, "Search for a file to explore its dependencies.");
  }
  function render(model) {
    if (model?.state !== "ready") { clear(unavailableMessage(model)); return; }
    currentModel = model;
    analysis = analytics(model);
    const previousCycle = cycle.value;
    cycle.replaceChildren(new Option(analysis ? `${analysis.cycles.length} cycle groups` : "Unavailable", ""), ...(analysis?.cycles || []).map((group) => new Option(`${group[0]} · ${group.length} files`, JSON.stringify(group))));
    cycle.value = [...cycle.options].some((option) => option.value === previousCycle) ? previousCycle : "";
    dropdowns[4].refresh();
    if (selected && !(model.projectGraph?.nodes || model.nodes?.filter((node) => node.type === "file").map((node) => ({ id: node.path })) || []).some((node) => node.id === selected)) selected = null;
    refreshSearch();
    controls.hidden = false;
    draw();
  }
  function draw() {
    destroyGraph();
    activeLayer = null;
    direction.parentElement.hidden = depth.parentElement.hidden = view.value !== "dependencies";
    cycle.parentElement.hidden = view.value !== "cycles";
    const group = view.value === "cycles" && cycle.value ? analysis?.cycles.find((item) => JSON.stringify(item) === cycle.value) : null;
    const impactResult = view.value === "impact" && selected ? impact(analysis, selected) : null;
    const projection = group ? projectSelection(analysis, group) : impactResult || (selected && view.value !== "cycles" ? focus(currentModel, selected, direction.value, Number(depth.value)) : overview(currentModel));
    if (!projection.nodes.length) { clear("No project files were discovered for the architecture map."); return; }
    if (typeof window.cytoscape !== "function") { clear("Cytoscape.js could not be loaded."); return; }
    container.replaceChildren();
    graph = window.cytoscape(createGraphOptions(container, projection));
    const reset = () => {
      activeLayer = null;
      resetFocus(graph);
      legend.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", "false"));
      graph.fit(graph.elements(), 36);
      renderPrompt(details, "Search for a file to explore its dependencies. Arrows show imports; edge labels count file dependencies.");
    };
    const selectLayer = (id) => {
      if (activeLayer === id) { reset(); return; }
      activeLayer = id;
      const node = graph.getElementById(id);
      const overview = node.data("type") === "overview-layer";
      const collection = overview ? node.closedNeighborhood() : node.add(node.descendants()).add(node.descendants().connectedEdges());
      focusCollection(graph, collection, node);
      legend.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.layerId === id)));
      if (overview) renderOverviewLayerDetails(details, node);
      else renderLayerDetails(details, node.data(), node.descendants());
      graph.fit(overview ? collection : node.add(node.descendants()), 44);
    };
    bindGraphInteractions(graph, (id) => { selected = id; if (view.value === "cycles") { view.value = "dependencies"; dropdowns[3].refresh(); } draw(); }, selectLayer, reset);
    renderLegend(legend, projection.nodes, selectLayer);
    const status = projection.complete ? "" : " · partial dependency graph";
    stats.textContent = group || impactResult || (selected && view.value !== "cycles")
      ? `${formatNumber(projection.shownFiles)} / ${formatNumber(projection.totalFiles)} files shown · ${formatNumber(projection.shownEdges)} / ${formatNumber(projection.totalEdges)} dependencies shown${status}`
      : `${formatNumber(projection.fileCount)} graph files / ${formatNumber(currentModel.totalFileCount)} listed · ${formatNumber(projection.nodes.length)} layers · ${formatNumber(projection.edgeCount)} file dependencies${status}`;
    back.disabled = !selected && view.value === "dependencies";
    if (group) {
      graph.nodes('[type = "file"]').addClass("is-selected"); graph.edges().addClass("is-active");
      renderDetails(details, "Cycle group", analysis.data.graph.complete ? "Files in this cycle" : "Partial graph: additional cycles may be missing", [["Files", group.length], ["Shown", projection.shownFiles], ["Dependencies shown", `${projection.shownEdges} / ${projection.totalEdges}`]]);
    } else if (view.value === "cycles") {
      renderPrompt(details, analysis ? `${analysis.cycles.length} cycle groups${analysis.data.graph.complete ? "" : " found in the partial graph; more may be missing"}. Select a group to inspect it.` : "Cycle analysis is unavailable for this report.");
    } else if (selected) {
      const node = projection.nodes.find((item) => item.canonicalId === selected);
      if (node) { graph.getElementById(node.id).addClass("is-selected"); renderFileDetails(details, node, graph, currentModel, analysis, impactResult); if (view.value === "impact" && !analysis) renderPrompt(details, "Impact analysis is unavailable for this report."); }
    } else renderPrompt(details, view.value === "impact" ? "Search for a file to explore its consumers." : "Search for a file to explore its dependencies. Arrows show imports; edge labels count file dependencies.");
  }
  function destroyGraph() { if (graph) graph.destroy(); graph = null; }
  return { clear, render };
}

function createGraphOptions(container, model) {
  return {
    autoungrabify: true,
    boxSelectionEnabled: false,
    container,
    elements: toCytoscapeElements(model),
    layout: { name: "dagre", rankDir: container?.clientWidth && container.clientWidth < 900 ? "TB" : "LR", nodeSep: 45, rankSep: 100, edgeSep: 24, nodeDimensionsIncludeLabels: true, useDagreEdgeControlPoints: true, automaticDagreEdgeStyle: true, fit: true, padding: 36 },
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
        label: "",
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
    { selector: "edge[weight > 1]", style: { label: "data(weight)" } },
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

function bindGraphInteractions(graph, selectFile, selectLayer, reset) {
  graph.on("tap", 'node[type = "file"]', (event) => {
    const node = event.target;
    selectFile(node.data("canonicalId"));
  });
  graph.on("tap", 'node[type = "layer"], node[type = "overview-layer"]', (event) => {
    selectLayer(event.target.id());
  });
  graph.on("tap", (event) => {
    if (event.target !== graph) return;
    reset();
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

function renderLegend(element, nodes, selectLayer) {
  const layers = nodes.filter((node) => node.type === "layer" || node.type === "overview-layer");
  element.replaceChildren(...layers.map((layerNode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "architecture-legend-item";
    button.dataset.layerId = layerNode.id;
    button.setAttribute("aria-pressed", "false");
    button.style.setProperty("--layer-color", layerNode.color);
    button.textContent = `${layerNode.label} · ${formatNumber(layerNode.fileCount)}`;
    button.addEventListener("click", () => selectLayer(layerNode.id));
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

function renderFileDetails(element, data, graph, model, analysis, impactResult) {
  const metrics = data.metrics || {};
  const id = data.canonicalId;
  const outgoing = analysis ? analysis.outgoing.get(id).length : "Unavailable";
  const incoming = analysis ? analysis.incoming.get(id).length : "Unavailable";
  const qualifier = analysis && !analysis.data.graph.complete ? " (at least)" : "";
  renderDetails(element, data.label, data.path, [
    ["Layer", layerLabel(graph, data.parent)],
    ["Entry point", data.entryPoint ? "Yes" : "No"],
    [`Imports${qualifier}`, outgoing],
    [`Imported by${qualifier}`, incoming],
    ...(impactResult ? [[`Direct consumers${qualifier}`, impactResult.direct], [analysis.data.graph.complete ? "Other reachable consumers" : "Other reachable consumers (observed)", impactResult.transitive], ...(!analysis.data.graph.complete ? [["Impact", "Partial graph; missing dependencies may change these results"]] : [])] : []),
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
    ["Within layer", node.data("withinLayer") || 0]
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

export { createGraphOptions, createRenderer, toCytoscapeElements };

function unavailableMessage(model) {
  if (model?.state === "running") return "Building project structure…";
  if (model?.error) return `Project structure unavailable: ${model.error}`;
  return "No project structure yet.";
}
