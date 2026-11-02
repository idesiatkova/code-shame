import { directoryPage } from "./directory-page.js";
import { overview } from "./layer-projection.js";
import { focus } from "./neighborhood.js";
import { projectSelection } from "./selection.js";

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
  if (view === "impact") return "Consumers include direct importers and files that depend on them.";
  return graphSelected
    ? "Direction and Depth apply to the selected file."
    : "Select a file to explore its imports.";
}

export { graphProjection, graphHint };
