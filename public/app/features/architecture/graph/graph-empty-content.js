const NO_FILES =
  "The dependency graph contains no files. Refresh the scan after adding project files.";

const ICONS = {
  impact: "git-branch",
  cycles: "repeat-2",
  project: "layers",
  dependencies: "folder-open",
};

function impactContent(analysis, selected) {
  if (!analysis)
    return ["Impact unavailable", "Consumer analysis needs dependency data from a completed scan."];
  if (selected)
    return [
      "Impact unavailable",
      "This listed file has no dependency data in the current scan. Choose another file in Explorer or Find file.",
    ];
  return [
    "Choose a file to explore impact",
    "Choose a file in Explorer or Find file. Impact traces its direct importers and other files that depend on it through them.",
  ];
}

function cycleContent(analysis) {
  if (!analysis)
    return [
      "Cycle analysis unavailable",
      "Cycle detection needs dependency data from a completed scan.",
    ];
  if (analysis.cycles.length)
    return [
      "Choose a cycle group",
      "Choose a group above to inspect its members. Every file in a cycle group can reach the others through imports.",
    ];
  const title = analysis.data.graph.complete
    ? "No import cycles detected"
    : "No cycles found in available data";
  return [
    title,
    "A cycle group contains files that can reach one another through imports. Use Imports to inspect individual dependencies.",
  ];
}

function directoryContent(view, directory) {
  if (view === "project")
    return [
      "No project map yet",
      "No files are available to group into layers. Refresh the scan after adding project files.",
    ];
  if (directory === ".")
    return [
      "No project files found",
      "The scan contains no project files. Refresh the scan after adding files to this project.",
    ];
  return [
    "This folder is empty",
    "Choose another folder in Explorer, or refresh the scan to update this folder's contents.",
  ];
}

function emptyContent({ projection, analysis, selected, view, directory }) {
  if (projection.nodes.length) return ["Graph could not load", "Cytoscape.js could not be loaded."];
  if (analysis && !analysis.data.files.size && !selected) {
    const titles = {
      impact: "No files to analyze",
      cycles: "No files to check for cycles",
      project: "No project map yet",
      dependencies: directory === "." ? "No project files found" : "This folder is empty",
    };
    return [titles[view], NO_FILES];
  }
  if (view === "impact") return impactContent(analysis, selected);
  if (view === "cycles") return cycleContent(analysis);
  return directoryContent(view, directory);
}

function graphEmptyContent(options) {
  const [title, guidance] = emptyContent(options);
  const { view, analysis } = options;
  const partial = view === "cycles" && analysis && !analysis.data.graph.complete;
  const description = partial
    ? `${guidance} This graph is partial; missing imports may hide cycles.`
    : guidance;
  return { title, description, icon: ICONS[view] };
}

export { graphEmptyContent };
