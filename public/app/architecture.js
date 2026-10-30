import { overview, searchFiles, focus, analytics, impact, projectSelection } from "./architectureProjection.js";
import { createStyledSelect } from "./styled-select.js";

const NODE_WIDTH = 142;
const NODE_HEIGHT = 48;
const GROUP_PADDING_X = 28;

function createRenderer({ container, details, fitButton, legend, stats }) {
  let graph = null;
  let currentModel = null;
  let selected = null;
  let activeLayer = null;
  let analysis = null;
  let cycleMember = null;
  const controls = document.createElement("div");
  controls.className = "architecture-controls";
  controls.innerHTML = `<div class="architecture-search"><label>Find file <input type="search" placeholder="Search file paths" autocomplete="off" role="combobox" aria-label="Find file" aria-autocomplete="list" aria-expanded="false" aria-controls="architecture-file-results"></label>
    <select hidden aria-label="Matching files"></select></div>
    <details class="architecture-secondary"><summary>Graph options</summary><div><label>Direction <select aria-label="Dependency direction"><option value="both">Both</option><option value="inbound">Inbound</option><option value="outbound">Outbound</option></select></label>
    <label>Depth <select aria-label="Dependency depth"><option value="1">1</option><option value="2">2</option></select></label>
    <button type="button" class="secondary-button">Back to layers</button>
    <label>View <select aria-label="Graph view"><option value="dependencies">Dependencies</option><option value="impact">Impact</option><option value="cycles">Cycles</option></select></label>
    <label>Cycle group <select aria-label="Cycle group"><option value="">Select a cycle</option></select></label></div><p class="architecture-control-hint"></p></details>`;
  legend.before(controls);
  const secondary = controls.querySelector?.(".architecture-secondary");
  if (secondary) secondary.open = !window.matchMedia?.("(max-width: 600px)").matches;
  const graphNote = document.createElement("p");
  graphNote.className = "architecture-graph-note";
  graphNote.textContent = "Arrows show static imports, not HTTP calls or callbacks. Select a layer to highlight it and its context.";
  controls.before(graphNote);
  const [search, results, direction, depth, back, view, cycle] = controls.querySelectorAll("input, select, button");
  const searchList = document.createElement("div");
  searchList.id = "architecture-file-results";
  searchList.className = "architecture-search-options";
  searchList.setAttribute("role", "listbox");
  searchList.hidden = true;
  results.after(searchList);
  let activeResult = -1;
  function setActiveResult(index) {
    activeResult = index;
    [...searchList.children].forEach((item, i) => { item.classList.toggle("is-active", i === index); item.setAttribute("aria-selected", String(i === index)); });
    if (index < 0) search.removeAttribute("aria-activedescendant");
    else { search.setAttribute("aria-activedescendant", searchList.children[index].id); searchList.children[index].scrollIntoView?.({ block: "nearest" }); }
  }
  function showResults(show) {
    searchList.hidden = !show;
    search.setAttribute("aria-expanded", String(show));
    if (!show) setActiveResult(-1);
  }
  function chooseResult(index) {
    const option = results.options[index];
    if (!option?.value) return;
    results.value = option.value;
    results.dispatchEvent(new Event("change", { bubbles: true }));
    search.focus();
    showResults(false);
  }
  const mapActions = document.createElement("div");
  mapActions.className = "architecture-map-actions";
  fitButton.before(mapActions);
  mapActions.append(back, fitButton);
  for (const [label, factor] of [["Zoom in", 1.25], ["Zoom out", 0.8]]) {
    const button = document.createElement("button"); button.type = "button"; button.className = "secondary-button"; button.textContent = label;
    button.addEventListener("click", () => { if (graph) graph.zoom({ level: graph.zoom() * factor, renderedPosition: { x: container.clientWidth / 2, y: container.clientHeight / 2 } }); });
    mapActions.append(button);
  }
  const context = document.createElement("div");
  context.className = "architecture-context";
  const contextText = document.createElement("span");
  const returnFile = document.createElement("button");
  returnFile.type = "button"; returnFile.className = "secondary-button"; returnFile.textContent = "Return to file";
  context.append(contextText, returnFile);
  mapActions.prepend(context);
  const hint = controls.querySelector?.(".architecture-control-hint");
  back.hidden = true;
  const dropdowns = [{ refresh() {}, focus: () => search.focus() }, ...[direction, depth, view, cycle].map(createStyledSelect)];
  const diagnostics = document.createElement("details");
  diagnostics.className = "architecture-diagnostics";
  const diagnosticsSummary = document.createElement("summary");
  diagnosticsSummary.textContent = "Why the dependency graph is partial";
  const diagnosticsList = document.createElement("ul");
  diagnostics.append(diagnosticsSummary, diagnosticsList);
  stats.after(diagnostics);
  function refreshSearch() {
    const matches = currentModel ? (search.value.trim() ? searchFiles(currentModel, search.value) : analysis ? [...analysis.data.files.values()].sort((a, b) => a.path.localeCompare(b.path)) : (currentModel.nodes || []).filter((node) => node.type === "file").map((node) => ({ ...node, canonicalId: node.path })).sort((a, b) => a.path.localeCompare(b.path))) : [];
    const matchCount = matches.length;
    results.replaceChildren(...(matchCount ? matches.map((node) => new Option(node.path, node.canonicalId)) : [new Option("No matching files", "")]));
    results.value = "";
    searchList.replaceChildren(...[...results.options].map((option, index) => {
      const item = document.createElement("div");
      item.id = `architecture-file-result-${index}`; item.className = "architecture-search-option";
      item.setAttribute("role", "option"); item.setAttribute("aria-selected", "false");
      if (!option.value) item.setAttribute("aria-disabled", "true");
      item.textContent = option.text;
      item.addEventListener("mousedown", (event) => event.preventDefault());
      item.addEventListener("click", () => chooseResult(index));
      return item;
    }));
    setActiveResult(-1);
    dropdowns[0].refresh();
  }
  search.addEventListener("focus", () => showResults(true));
  search.addEventListener("input", () => { refreshSearch(); showResults(true); });
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { if (!searchList.hidden) { event.preventDefault(); showResults(false); } return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); showResults(true);
      const count = results.options[0]?.value ? results.options.length : 0;
      if (count) setActiveResult(activeResult < 0 ? (event.key === "ArrowDown" ? 0 : count - 1) : Math.max(0, Math.min(count - 1, activeResult + (event.key === "ArrowDown" ? 1 : -1))));
      return;
    }
    if (event.key === "Enter") { const index = activeResult >= 0 ? activeResult : results.options.length === 1 ? 0 : -1; if (index >= 0 && results.options[index]?.value) { event.preventDefault(); chooseResult(index); } }
  });
  search.addEventListener("blur", () => showResults(false));
  results.addEventListener("change", () => { if (results.value) { selected = results.value; if (view.value === "cycles") { view.value = "dependencies"; dropdowns[3].refresh(); } draw(); } });
  direction.addEventListener("change", () => { if (selected) draw(); });
  depth.addEventListener("change", () => { if (selected) draw(); });
  view.addEventListener("change", draw);
  cycle.addEventListener("change", () => { cycleMember = null; draw(); });
  back.addEventListener("click", () => { selected = null; refreshSearch(); view.value = "dependencies"; dropdowns[3].refresh(); draw(); fitButton.focus({ preventScroll: true }); });
  returnFile.addEventListener("click", () => { view.value = "dependencies"; dropdowns[3].refresh(); draw(); fitButton.focus({ preventScroll: true }); });
  fitButton.addEventListener("click", () => { if (graph) { graph.resize(); graph.fit(graph.elements(), 36); } });
  let rankDir = null;
  let zoomTarget = null;
  function ensureReadableZoom() {
    if (graph && zoomTarget && graph.zoom() < 1) { graph.zoom(1); graph.center(graph.getElementById(zoomTarget)); }
  }
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => {
    if (!graph || !container.clientWidth) return;
    graph.resize();
    const layout = createGraphOptions(container, {}).layout;
    if (layout.rankDir !== rankDir) { rankDir = layout.rankDir; graph.layout(layout).run(); ensureReadableZoom(); }
  }).observe(container);

  function clear(message = "No project structure yet.") {
    destroyGraph(); currentModel = null; selected = null; activeLayer = null; analysis = null;
    search.value = ""; direction.value = "both"; depth.value = "1"; view.value = "dependencies"; cycle.value = "";
    cycle.replaceChildren(new Option("Select a cycle", ""));
    results.replaceChildren(new Option("Search for a file", ""));
    dropdowns.forEach((dropdown) => dropdown.refresh());
    diagnostics.hidden = true; diagnosticsList.replaceChildren();
    controls.hidden = true; graphNote.hidden = true; back.hidden = true; context.hidden = true;
    container.replaceChildren(emptyState(message));
    legend.replaceChildren(); stats.textContent = "";
    renderPrompt(details, "Search for a file to explore its dependencies.");
  }
  function render(model) {
    if (model?.state !== "ready") { clear(unavailableMessage(model)); return; }
    currentModel = model;
    const reasons = model.projectGraph?.complete === false ? model.projectGraph.diagnostics || [] : [];
    diagnostics.hidden = reasons.length === 0;
    diagnosticsList.replaceChildren(...reasons.map((reason) => { const item = document.createElement("li"); item.textContent = reason; return item; }));
    analysis = analytics(model);
    const previousCycle = cycle.value;
    cycle.replaceChildren(new Option(analysis ? `${analysis.cycles.length} cycle groups` : "Unavailable", ""), ...(analysis?.cycles || []).map((group) => new Option(`${group[0]} · ${group.length} files`, JSON.stringify(group))));
    cycle.value = [...cycle.options].some((option) => option.value === previousCycle) ? previousCycle : "";
    dropdowns[4].refresh();
    if (selected && !(model.projectGraph?.nodes || model.nodes?.filter((node) => node.type === "file").map((node) => ({ id: node.path })) || []).some((node) => node.id === selected)) selected = null;
    refreshSearch();
    controls.hidden = false; graphNote.hidden = false;
    draw();
  }
  function draw() {
    const focusedLayer = document.activeElement?.dataset?.layerId;
    destroyGraph();
    activeLayer = null;
    direction.parentElement.hidden = depth.parentElement.hidden = view.value !== "dependencies";
    direction.disabled = depth.disabled = !selected;
    dropdowns[1].refresh(); dropdowns[2].refresh();
    if (hint) hint.textContent = view.value === "cycles" ? "Cycles cover the whole project." : view.value === "impact" ? selected ? "Impact shows consumers of the selected file." : "Impact requires a selected file." : !selected ? "Select a file to use Direction and Depth." : "Direction and Depth apply to the selected file.";
    cycle.parentElement.hidden = view.value !== "cycles";
    const group = view.value === "cycles" && cycle.value ? analysis?.cycles.find((item) => JSON.stringify(item) === cycle.value) : null;
    const impactResult = view.value === "impact" && selected ? impact(analysis, selected) : null;
    const projection = group ? projectSelection(analysis, group) : impactResult || (selected && view.value === "dependencies" ? focus(currentModel, selected, direction.value, Number(depth.value)) : overview(currentModel));
    if (!projection.nodes.length) { clear("No project files were discovered for the architecture map."); return; }
    if (typeof window.cytoscape !== "function") { clear("Cytoscape.js could not be loaded."); return; }
    container.replaceChildren();
    const options = createGraphOptions(container, projection);
    rankDir = options.layout.rankDir;
    graph = window.cytoscape(options);
    zoomTarget = (group ? projection.nodes.find((node) => node.type === "file") : projection.nodes.find((node) => node.canonicalId === selected))?.id || null;
    ensureReadableZoom();
    const reset = () => {
      draw();
    };
    const selectLayer = (id) => {
      if (activeLayer === id) { reset(); return; }
      activeLayer = id;
      returnFile.hidden = !selected;
      const node = graph.getElementById(id);
      const overview = node.data("type") === "overview-layer";
      const collection = overview ? node.closedNeighborhood() : node.add(node.descendants()).add(node.descendants().connectedEdges());
      focusCollection(graph, collection, node);
      legend.querySelectorAll("button").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.layerId === id)));
      if (overview) renderOverviewLayerDetails(details, node);
      else { renderLayerDetails(details, node.data(), node.descendants()); appendNote(details, "This highlights the visible part of the layer in the current file view."); }
      const layerFiles = analysis ? [...analysis.data.files.values()].filter((file) => file.parent === id) : (currentModel.nodes || []).filter((file) => file.type === "file" && file.parent === id).map((file) => ({ ...file, canonicalId: file.path }));
      appendFiles(details, "Files in this layer", layerFiles, explore);
      graph.fit(overview ? collection : node.add(node.descendants()), 44);
    };
    const explore = (id) => { selected = id; cycleMember = null; view.value = "dependencies"; dropdowns[3].refresh(); refreshSearch(); draw(); fitButton.focus({ preventScroll: true }); };
    bindGraphInteractions(graph, (id) => { if (group) { cycleMember = id; draw(); } else { selected = id; refreshSearch(); draw(); } }, selectLayer, reset, (edge) => {
      returnFile.hidden = !selected;
      const source = graph.getElementById(edge.data("source")).data();
      const target = graph.getElementById(edge.data("target")).data();
      renderDetails(details, "Dependency", "Importer → imported", [["From", source.path || source.label], ["To", target.path || target.label], ["File dependencies", edge.data("weight")]]);
    });
    renderLegend(legend, projection.nodes, selectLayer);
    if (focusedLayer) [...legend.querySelectorAll("button")].find((button) => button.dataset.layerId === focusedLayer)?.focus();
    const status = projection.complete ? "" : " · partial dependency graph";
    stats.textContent = group || impactResult || (selected && view.value === "dependencies")
      ? `${formatNumber(projection.shownFiles)} / ${formatNumber(projection.totalFiles)} files shown · ${formatNumber(projection.shownEdges)} / ${formatNumber(projection.totalEdges)} dependencies shown${status}`
      : `${formatNumber(projection.fileCount)} graph files / ${formatNumber(currentModel.totalFileCount)} listed · ${formatNumber(projection.nodes.length)} layers · ${formatNumber(projection.edgeCount)} file dependencies${status}`;
    back.disabled = !selected && view.value === "dependencies";
    back.hidden = back.disabled;
    context.hidden = !selected;
    contextText.textContent = selected ? `${view.value === "cycles" ? "Saved file" : "Current file"}: ${analysis?.data.files.get(selected)?.path || selected}${view.value === "cycles" ? " · Cycles across project" : ""}` : "";
    returnFile.hidden = !selected || view.value !== "cycles";
    if (group) {
      graph.nodes('[type = "file"]').addClass("is-selected"); graph.edges().addClass("is-active");
      const member = projection.nodes.find((node) => node.canonicalId === cycleMember);
      renderDetails(details, member ? member.label : "Cycle group", member ? member.path : "Each file can reach every other through imports; the group can contain multiple cycles.", [["Files", group.length], ["Shown", projection.shownFiles], ["Dependencies shown", `${projection.shownEdges} / ${projection.totalEdges}`]]);
      if (!analysis.data.graph.complete) appendNote(details, "Partial graph: additional cycles may be missing.");
      appendFiles(details, "Cycle members", projection.nodes.filter((node) => node.type === "file"), explore);
    } else if (view.value === "cycles") {
      renderPrompt(details, analysis ? analysis.cycles.length ? `${analysis.cycles.length} cycle groups${analysis.data.graph.complete ? "" : " found in the partial graph; more may be missing"}. Select a group to inspect it.` : `No cycle groups found${analysis.data.graph.complete ? "." : " in the partial graph; some may be missing."}` : "Cycle analysis is unavailable for this report.");
    } else if (selected) {
      const node = projection.nodes.find((item) => item.canonicalId === selected);
      if (view.value === "impact" && !analysis) renderPrompt(details, "Impact analysis is unavailable for this report.");
      else if (node) { graph.getElementById(node.id).addClass("is-selected"); renderFileDetails(details, node, graph, currentModel, analysis, impactResult); if (impactResult) { const direct = new Set(analysis.incoming.get(selected)); direct.delete(selected); const visited = new Set([selected]), queue = [selected]; for (let i = 0; i < queue.length; i++) for (const id of analysis.incoming.get(queue[i])) if (!visited.has(id)) { visited.add(id); queue.push(id); } appendFiles(details, "Direct consumers", [...direct].map((id) => analysis.data.files.get(id)), explore, true); appendFiles(details, "Other reachable consumers", queue.slice(1).filter((id) => !direct.has(id)).map((id) => analysis.data.files.get(id)), explore, true); } else appendFiles(details, "Files shown in this view", projection.nodes.filter((item) => item.type === "file" && item.canonicalId !== selected), explore); }
    } else renderPrompt(details, view.value === "impact" ? analysis ? "Search for a file to explore its consumers." : "Impact analysis is unavailable for this report." : "Search for a file to explore its dependencies. Select an arrow for its direction and count.");
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
    minZoom: 0.05,
    style: graphStyle(),
    textureOnViewport: true,
    userPanningEnabled: true
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
        "line-color": "#a7b2aa",
        "line-opacity": 0.85,
        "target-arrow-color": "#a7b2aa",
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.2
      }
    },
    { selector: "edge[weight > 1]", style: { label: "data(weight)" } },
    {
      selector: "edge.cross-layer",
      style: {
        "line-color": "#b47cff",
        "line-opacity": 0.95,
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

function bindGraphInteractions(graph, selectFile, selectLayer, reset, selectEdge) {
  graph.on("tap", 'node[type = "file"]', (event) => {
    const node = event.target;
    selectFile(node.data("canonicalId"));
  });
  graph.on("tap", 'node[type = "layer"], node[type = "overview-layer"]', (event) => {
    selectLayer(event.target.id());
  });
  graph.on("tap", "edge", (event) => selectEdge(event.target));
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
    ...(impactResult ? [[`Direct consumers${qualifier}`, impactResult.direct], [analysis.data.graph.complete ? "Other reachable consumers" : "Other reachable consumers (observed)", impactResult.transitive]] : []),
    ["Fallow fan-in", metrics.fanIn ?? "Unavailable"],
    ["Fallow fan-out", metrics.fanOut ?? "Unavailable"],
    ["Lines", metrics.lines ?? "Unavailable"],
    ["Maintainability", metrics.maintainability == null ? "Unavailable" : Number(metrics.maintainability).toFixed(1)]
  ]);
  appendNote(element, impactResult ? "Direct consumers import this file; other reachable consumers reach it through imports. Shown / total counts cover this impact subgraph. Fallow metrics come from a separate source." : "Import counts cover the project graph; Fallow metrics come from a separate source.");
  if (impactResult && !analysis.data.graph.complete) {
    const note = document.createElement("p");
    note.textContent = "Partial graph: missing dependencies may change these results.";
    element.append(note);
  }
}

function appendNote(element, text) {
  const note = document.createElement("p");
  note.textContent = text;
  element.append(note);
}

function appendFiles(element, label, files, explore, open = false) {
  if (!files.length) return;
  const disclosure = document.createElement("details");
  disclosure.open = open;
  const summary = document.createElement("summary");
  summary.textContent = label;
  const list = document.createElement("ul");
  list.className = "architecture-file-list";
  files.forEach((file) => {
    const item = document.createElement("li");
    const path = document.createElement("span");
    path.textContent = file.path;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "architecture-explore";
    button.textContent = "Explore";
    button.setAttribute("aria-label", `Explore ${file.path}`);
    button.addEventListener("click", () => explore(file.canonicalId));
    item.append(path, button); list.append(item);
  });
  disclosure.append(summary, list); element.append(disclosure);
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
