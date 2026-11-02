import { emptyState } from "../components/molecules/graph-empty-state.js";
import { graphEmptyContent } from "./graph-empty-content.js";
import { directoryGraph } from "./directory-projection.js";
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

function showGraphSurface({
  projection,
  mapActions,
  graphHelp,
  back,
  selected,
  directory,
  view,
  analysis,
  container,
  legend,
  details,
}) {
  const available = projection.nodes.length && typeof window.cytoscape === "function";
  const singleEmpty = !available;
  if (singleEmpty) container.setAttribute("role", "status");
  else container.removeAttribute("role");
  container.setAttribute("data-empty", String(singleEmpty));
  container.setAttribute(
    "aria-label",
    singleEmpty
      ? `${{ impact: "Impact", cycles: "Cycles", project: "Project map", dependencies: "Imports" }[view]} status`
      : "Interactive project dependency graph",
  );
  details.hidden = singleEmpty;
  graphHelp.hidden = !available;
  [...mapActions.children]
    .filter((item) => item !== back)
    .forEach((button) => {
      button.disabled = !available;
      button.hidden = !available;
    });
  back.hidden = !selected && directory === ".";
  back.disabled = false;
  mapActions.hidden = !available && back.hidden;
  if (available) return true;
  legend.replaceChildren();
  const { title, description, icon } = graphEmptyContent({
    projection,
    analysis,
    selected,
    view,
    directory,
  });
  container.replaceChildren(emptyState(title, description, icon));
  details.replaceChildren();
  return false;
}
export { prepareGraph, showGraphSurface };
