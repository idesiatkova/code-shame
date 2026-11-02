import { overview, directoryPage } from "../architectureProjection.js";
import { focus, projectSelection } from "./analysis.js";

function graphProjection({
  model,
  view,
  group,
  analysis,
  impactResult,
  graphSelected,
  selected,
  direction,
  depth,
  directoryView,
  fullDirectory,
  page,
}) {
  if (view === "project") return overview(model);
  if (group) return projectSelection(analysis, group);
  if (impactResult) return impactResult;
  if (graphSelected && view === "dependencies")
    return focus(model, selected, direction, Number(depth));
  if (selected && view === "dependencies") return missingProjection(selected);
  if (directoryView) return directoryPage(fullDirectory, page);
  return { nodes: [], edges: [] };
}

function missingProjection(selected) {
  return {
    nodes: [
      {
        id: `file:${selected}`,
        canonicalId: selected,
        path: selected,
        label: selected.split("/").pop(),
        type: "file",
      },
    ],
    edges: [],
    shownFiles: 1,
    totalFiles: 1,
    shownEdges: 0,
    totalEdges: 0,
    complete: false,
  };
}

function graphHint(view, selected, graphSelected) {
  if (view === "project")
    return "Layers use configured boundaries or automatic classification; select one to browse its files.";
  if (view === "cycles") return "Cycles cover the whole project.";
  if (view === "impact")
    return selected
      ? "Impact shows consumers of the selected file."
      : "Select a file to see its impact.";
  return graphSelected
    ? "Direction and Depth apply to the selected file."
    : "Select a file to explore its imports.";
}

function graphUnavailable(view, selected, analysis, impactResult, group) {
  if (view === "impact" && !impactResult) {
    if (!selected) return "Select a file to see its impact.";
    if (!analysis) return "Impact is unavailable without a project dependency graph.";
    return "Impact is unavailable for this file in the dependency graph.";
  }
  if (view !== "cycles" || group) return "";
  if (!analysis) return "Cycles are unavailable without a project dependency graph.";
  if (analysis.cycles.length)
    return `Select a cycle group to see its dependencies.${analysis.data.graph.complete ? "" : " This graph is partial; missing imports may hide cycles."}`;
  return analysis.data.graph.complete
    ? "No import cycles detected."
    : "No cycles detected in this partial graph. Missing imports may hide cycles.";
}

export { graphProjection, graphHint, graphUnavailable };
