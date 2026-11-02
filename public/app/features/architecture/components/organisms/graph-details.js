function renderLegend(element, nodes, selectLayer) {
  const layers = nodes.filter((node) => node.type === "layer" || node.type === "overview-layer");
  element.replaceChildren(
    ...layers.map((layerNode) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "architecture-legend-item";
      button.dataset.layerId = layerNode.id;
      button.setAttribute("aria-pressed", "false");
      button.style.setProperty("--layer-color", layerNode.color);
      button.textContent = `${layerNode.label} · ${formatNumber(layerNode.fileCount)}`;
      button.addEventListener("click", () => selectLayer(layerNode.id));
      return button;
    }),
  );
}

function renderFileDetails(element, data, graph, model, analysis, impactResult) {
  const metrics = data.metrics || {};
  const id = data.canonicalId;
  const outgoing = analysis ? analysis.outgoing.get(id).length : "Unavailable";
  const incoming = analysis ? analysis.incoming.get(id).length : "Unavailable";
  const qualifier = analysis && !analysis.data.graph.complete ? " (at least)" : "";
  renderDetails(element, data.label, data.path, [
    ["Layer", fileLayerLabel(data, graph, model, analysis)],
    ["Entry point", data.entryPoint ? "Yes" : "No"],
    [`Imports${qualifier}`, outgoing],
    [`Imported by${qualifier}`, incoming],
    ...(impactResult
      ? [
          [`Direct consumers${qualifier}`, impactResult.direct],
          [
            analysis.data.graph.complete
              ? "Other reachable consumers"
              : "Other reachable consumers (observed)",
            impactResult.transitive,
          ],
        ]
      : []),
    ...fileMetricRows(metrics),
  ]);
  appendNote(
    element,
    impactResult
      ? "Direct consumers import this file; other reachable consumers reach it through imports. Shown / total counts cover this impact subgraph. Fallow metrics come from a separate source."
      : "Import counts cover the project graph; Fallow metrics come from a separate source.",
  );
  if (impactResult && !analysis.data.graph.complete) {
    const note = document.createElement("p");
    note.textContent = "Partial graph: missing dependencies may change these results.";
    element.append(note);
  }
}

function fileMetricRows(metrics) {
  return [
    ["Fallow fan-in", metrics.fanIn ?? "Unavailable"],
    ["Fallow fan-out", metrics.fanOut ?? "Unavailable"],
    ["Lines", metrics.lines ?? "Unavailable"],
    [
      "Maintainability",
      metrics.maintainability == null ? "Unavailable" : Number(metrics.maintainability).toFixed(1),
    ],
  ];
}

function fileLayerLabel(data, graph, model, analysis) {
  return (
    analysis?.data.layers.get(data.layerId)?.label ||
    (model.nodes || []).find((node) => node.type === "layer" && node.layerId === data.layerId)
      ?.label ||
    layerLabel(graph, data.parent)
  );
}

function renderBoundaryConnections(element, projection, navigate) {
  if (!projection.boundary.length) return;
  const list = document.createElement("div");
  list.className = "architecture-boundary-connections";
  const heading = document.createElement("h3");
  heading.textContent = `Cross-page connections (${projection.boundary.length})`;
  list.append(heading);
  for (const edge of projection.boundary) {
    const row = document.createElement("p");
    row.dataset.edgeId = edge.id;
    const description = document.createElement("span");
    description.textContent = `${edge.sourceNode.path} → ${edge.targetNode.path} · ${edge.weight} file ${edge.weight === 1 ? "import" : "imports"} · `;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = `Show ${edge.destination.node.path} on page ${edge.destination.page + 1}`;
    button.addEventListener("click", () => navigate(edge.destination.page, edge.id));
    row.append(description, button);
    list.append(row);
  }
  element.append(list);
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
    const button = document.createElement("button");
    button.type = "button";
    button.className = "architecture-file-link";
    button.textContent = file.path;
    button.setAttribute("aria-label", `Explore ${file.path}`);
    button.addEventListener("click", () => explore(file.canonicalId));
    item.append(button);
    list.append(item);
  });
  disclosure.append(summary, list);
  element.append(disclosure);
}

function renderOverviewLayerDetails(element, node) {
  const edges = node.connectedEdges().map((edge) => edge.data());
  const id = node.id();
  const sum = (predicate) =>
    edges.filter(predicate).reduce((total, edge) => total + edge.weight, 0);
  renderDetails(element, node.data("label"), "File dependencies", [
    ["Files", node.data("fileCount")],
    ["Outbound to other layers", sum((edge) => edge.source === id && edge.target !== id)],
    ["Inbound from other layers", sum((edge) => edge.target === id && edge.source !== id)],
    ["Within layer", node.data("withinLayer") || 0],
  ]);
}

function renderLayerDetails(element, data, descendants) {
  renderDetails(
    element,
    data.label,
    data.source === "fallow-boundary" ? "Configured Fallow boundary" : "Automatically classified",
    [
      ["Files", data.fileCount],
      ["Shown in map", descendants.filter('[type = "file"]').length],
    ],
  );
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

function renderPrompt(element, message, title = "Project structure") {
  const heading = document.createElement("h3");
  heading.textContent = title;
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

export {
  renderLegend,
  renderFileDetails,
  renderBoundaryConnections,
  appendNote,
  appendFiles,
  renderOverviewLayerDetails,
  renderLayerDetails,
  renderDetails,
  renderPrompt,
  emptyState,
  formatNumber,
};
