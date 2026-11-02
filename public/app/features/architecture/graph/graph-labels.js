import { formatNumber } from "../../../shared/utils/format.js";

const DIRECTION_LABELS = {
  both: "Imports + imported by",
  inbound: "Imported by",
  outbound: "Imports",
};

function pendingStats({ view, selected, analysis }) {
  if (view === "impact") {
    const count = analysis
      ? `${formatNumber(analysis.data.files.size)} graph files`
      : "dependency data unavailable";
    return `Impact · ${selected || "project-wide consumers"} · ${count}`;
  }
  const count = analysis
    ? `${formatNumber(analysis.cycles.length)} cycle ${analysis.cycles.length === 1 ? "group" : "groups"}`
    : "dependency data unavailable";
  return `Cycles · project-wide · ${count}`;
}

function selectionStats({ projection, fileView, direction, depth }) {
  const prefix = fileView
    ? `Map: ${DIRECTION_LABELS[direction]} · ${depth} ${depth === "1" ? "step" : "steps"} · `
    : "";
  return `${prefix}${formatNumber(projection.shownFiles)} / ${formatNumber(projection.totalFiles)} files shown · ${formatNumber(projection.shownEdges)} / ${formatNumber(projection.totalEdges)} dependencies shown`;
}

function directoryStats({ projection, fullDirectory, directory }) {
  const page = projection.pages > 1 ? ` · page ${projection.page + 1} / ${projection.pages}` : "";
  return `${formatNumber(projection.fileCount)} listed files in ${directory} · ${projection.nodes.length} / ${fullDirectory.nodes.length} items · ${projection.edges.length} connections drawn · ${projection.boundary.length} cross-page · ${projection.other.length} on other pages${page}`;
}

function graphStats(options) {
  const { view, impactResult, group, missingFile, graphSelected, directoryView } = options;
  if (view === "impact" && !impactResult) return pendingStats(options);
  if (view === "cycles" && !group) return pendingStats(options);
  if (group || impactResult || missingFile) return selectionStats(options);
  if (graphSelected && view === "dependencies") return selectionStats(options);
  if (directoryView) return directoryStats(options);
  const { projection, currentModel } = options;
  return `${formatNumber(projection.fileCount)} graph files / ${formatNumber(currentModel.totalFileCount)} listed · ${formatNumber(projection.nodes.length)} layers · ${formatNumber(projection.edgeCount)} file dependencies`;
}

function updateGraphStats(options) {
  const { analysis, projection, stats } = options;
  const complete = analysis ? analysis.data.graph.complete : projection.complete;
  const status = complete === false ? " · partial dependency graph" : "";
  stats.textContent = graphStats(options) + status;
  stats.title = stats.textContent;
  stats.tabIndex = 0;
}

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

export { updateGraphStats, renderLegend };
