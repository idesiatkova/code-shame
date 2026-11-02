import { emptyState, renderPrompt, formatNumber } from "../components/organisms/graph-details.js";
import { graphUnavailable } from "./projection-view.js";
import { directoryGraph } from "../architectureProjection.js";
import { impact } from "./selection.js";
import { readDesignTokens } from "../../../shared/design/tokens.js";
import { colorizeProjection } from "./layer-colors.js";
import { graphProjection } from "./projection-view.js";

function prepareGraph({
  selected,
  analysis,
  currentModel,
  view,
  cycle,
  directory,
  listedFiles,
  direction,
  depth,
  directoryPageIndex,
}) {
  const graphSelected =
    selected &&
    (analysis?.data.files.has(selected) ||
      (!analysis &&
        (currentModel.nodes || []).some((node) => node.type === "file" && node.path === selected)));
  const group =
    view === "cycles" && cycle
      ? analysis?.cycles.find((item) => JSON.stringify(item) === cycle)
      : null;
  const impactResult =
    view === "impact" && graphSelected && analysis ? impact(analysis, selected) : null;
  const directoryView = !selected && view === "dependencies";
  const missingFile = selected && !graphSelected && view === "dependencies";
  const fullDirectory = directoryView ? directoryGraph(currentModel, directory, listedFiles) : null;
  const tokens = readDesignTokens();
  const fileView = graphSelected && view === "dependencies";
  let projection = graphProjection({
    model: currentModel,
    view: view,
    group,
    analysis,
    impactResult,
    graphSelected,
    selected,
    direction: direction,
    depth: depth,
    directoryView,
    fullDirectory,
    page: directoryPageIndex,
  });
  projection = colorizeProjection(currentModel, projection, tokens);
  if (fileView)
    projection = {
      ...projection,
      nodes: projection.nodes
        .filter((node) => node.type === "file")
        .map((node) => {
          const copy = { ...node };
          delete copy.parent;
          return copy;
        }),
    };
  return {
    graphSelected,
    group,
    impactResult,
    directoryView,
    missingFile,
    fullDirectory,
    tokens,
    fileView,
    projection,
  };
}

const DIRECTION_LABELS = {
  both: "Imports + imported by",
  inbound: "Imported by",
  outbound: "Imports",
};

function showGraphSurface({
  projection,
  impactResult,
  group,
  mapActions,
  back,
  selected,
  directory,
  view,
  analysis,
  container,
  legend,
  stats,
  details,
}) {
  const available = projection.nodes.length && typeof window.cytoscape === "function";
  [...mapActions.children]
    .filter((item) => item !== back)
    .forEach((button) => {
      button.disabled = !available;
      button.style.visibility = button.disabled ? "hidden" : "";
    });
  back.hidden = !selected && directory === ".";
  back.disabled = false;
  if (available) return true;
  const unavailable = graphUnavailable(view, selected, analysis, impactResult, group);
  const message =
    unavailable ||
    (!projection.nodes.length
      ? "No project files were discovered for the dependency map."
      : "Cytoscape.js could not be loaded.");
  container.replaceChildren(emptyState(message));
  legend.replaceChildren();
  stats.textContent = "";
  stats.title = "";
  stats.tabIndex = -1;
  const title =
    { cycles: "Cycles", impact: "Impact", project: "Project map" }[view] || "Folder contents";
  renderPrompt(details, message, title);
  return false;
}
function updateGraphStats({
  projection,
  group,
  impactResult,
  missingFile,
  graphSelected,
  fileView,
  directoryView,
  fullDirectory,
  stats,
  view,
  direction,
  depth,
  directory,
  currentModel,
}) {
  const status = projection.complete ? "" : " · partial dependency graph";
  stats.textContent =
    group || impactResult || missingFile || (graphSelected && view === "dependencies")
      ? `${fileView ? `Map: ${DIRECTION_LABELS[direction]} · ${depth} ${depth === "1" ? "step" : "steps"} · ` : ""}${formatNumber(projection.shownFiles)} / ${formatNumber(projection.totalFiles)} files shown · ${formatNumber(projection.shownEdges)} / ${formatNumber(projection.totalEdges)} dependencies shown${status}`
      : directoryView
        ? `${formatNumber(projection.fileCount)} listed files in ${directory} · ${projection.nodes.length} / ${fullDirectory.nodes.length} items · ${projection.edges.length} connections drawn · ${projection.boundary.length} cross-page · ${projection.other.length} on other pages${projection.pages > 1 ? ` · page ${projection.page + 1} / ${projection.pages}` : ""}${status}`
        : `${formatNumber(projection.fileCount)} graph files / ${formatNumber(currentModel.totalFileCount)} listed · ${formatNumber(projection.nodes.length)} layers · ${formatNumber(projection.edgeCount)} file dependencies${status}`;
  stats.title = stats.textContent;
  stats.tabIndex = 0;
}

export { prepareGraph, showGraphSurface, updateGraphStats };
