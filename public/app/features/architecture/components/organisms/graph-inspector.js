import {
  renderOverviewLayerDetails,
  renderLayerDetails,
  renderFileDetails,
  renderBoundaryConnections,
  appendNote,
  appendFiles,
  renderDetails,
  renderPrompt,
} from "./graph-details.js";

const DIRECTION_LABELS = {
  both: "Imports + imported by",
  inbound: "Imported by",
  outbound: "Imports",
};

function renderGraphInspector({
  details,
  graph,
  currentModel,
  analysis,
  selected,
  directory,
  view,
  direction,
  depth,
  cycleMember,
  group,
  projection,
  graphSelected,
  impactResult,
  directoryView,
  fullDirectory,
  selectLayer,
  explore,
  openSource,
  selectOverview,
  selectFile,
  onPage,
}) {
  function renderGraphDetails(
    group,
    projection,
    graphSelected,
    impactResult,
    directoryView,
    fullDirectory,
  ) {
    if (group) renderCycleGroup(group, projection);
    else if (view === "cycles") renderCyclePrompt();
    else if (view === "project") renderProjectLayers(projection);
    else if (selected) {
      renderSelectedDetails(projection, graphSelected, impactResult);
    } else if (directoryView) {
      renderDirectoryDetails(projection, fullDirectory);
    } else
      renderPrompt(
        details,
        view === "impact"
          ? analysis
            ? "Search for a file to explore its consumers."
            : "Impact analysis is unavailable for this report."
          : "Search for a file to explore its dependencies. Select an arrow for its direction and count.",
        view === "impact" ? "Impact" : "Imports",
      );
  }
  function renderCycleGroup(group, projection) {
    graph.nodes('[type = "file"]').addClass("is-selected");
    graph.edges().addClass("is-active");
    const member = projection.nodes.find((node) => node.canonicalId === cycleMember);
    renderDetails(
      details,
      member ? member.label : "Cycle group",
      member
        ? member.path
        : "Each file can reach every other through imports; the group can contain multiple cycles.",
      [
        ["Files", group.length],
        ["Shown", projection.shownFiles],
        ["Dependencies shown", `${projection.shownEdges} / ${projection.totalEdges}`],
      ],
    );
    if (!analysis.data.graph.complete)
      appendNote(details, "Partial graph: additional cycles may be missing.");
    appendFiles(
      details,
      "Cycle members",
      projection.nodes.filter((node) => node.type === "file"),
      explore,
    );
  }
  function renderCyclePrompt() {
    renderPrompt(
      details,
      analysis
        ? analysis.cycles.length
          ? `${analysis.cycles.length} cycle ${analysis.cycles.length === 1 ? "group" : "groups"}${analysis.data.graph.complete ? "" : " found in the partial graph; more may be missing"}. Select a group to inspect it.`
          : analysis.data.graph.complete
            ? "No import cycles detected."
            : "No cycles detected in this partial graph. Missing imports may hide cycles."
        : "Cycle analysis is unavailable for this report.",
      "Cycles",
    );
  }
  function renderProjectLayers(projection) {
    renderPrompt(
      details,
      "Select a layer to see its member files. Layers use configured boundaries or automatic classification; arrows aggregate imports between them.",
      "Project map",
    );
    const list = document.createElement("div");
    list.className = "architecture-layer-list";
    for (const layer of projection.nodes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = `${layer.label} · ${layer.fileCount} ${layer.fileCount === 1 ? "file" : "files"}`;
      button.addEventListener("click", () => {
        selectLayer(layer.id);
        details.lastElementChild?.querySelector("summary")?.focus({ preventScroll: true });
      });
      list.append(button);
    }
    details.append(list);
  }
  function renderSelectedDetails(projection, graphSelected, impactResult) {
    const node = projection.nodes.find((item) => item.canonicalId === selected);
    if (!graphSelected)
      renderPrompt(
        details,
        "This listed file is not present in the dependency graph.",
        view === "impact" ? "Impact" : "Imports",
      );
    else if (view === "impact" && !analysis)
      renderPrompt(details, "Impact analysis is unavailable for this report.", "Impact");
    else if (node) {
      graph.getElementById(node.id).addClass("is-selected");
      renderFileDetails(details, node, graph, currentModel, analysis, impactResult);
      const sourceButton = document.createElement("button");
      sourceButton.type = "button";
      sourceButton.className = "secondary-button source-explorer-open";
      sourceButton.textContent = "Explore code";
      sourceButton.addEventListener("click", () => openSource());
      details.append(sourceButton);
      if (impactResult) {
        appendFiles(
          details,
          "Direct consumers",
          impactResult.directIds.map((id) => analysis.data.files.get(id)),
          explore,
          true,
        );
        appendFiles(
          details,
          "Other reachable consumers",
          impactResult.reachableIds.map((id) => analysis.data.files.get(id)),
          explore,
          true,
        );
      } else {
        appendNote(
          details,
          `Map: ${DIRECTION_LABELS[direction]}, ${depth} ${depth === "1" ? "step" : "steps"}. Import counts and all-direct lists use the project graph. Direction and depth filter only the map.`,
        );
        if (analysis) {
          appendFiles(
            details,
            "All direct imports",
            analysis.outgoing.get(selected).map((id) => analysis.data.files.get(id)),
            explore,
            true,
          );
          appendFiles(
            details,
            "All direct importers",
            analysis.incoming.get(selected).map((id) => analysis.data.files.get(id)),
            explore,
            true,
          );
        }
        appendFiles(
          details,
          "Files shown in this view",
          projection.nodes.filter((item) => item.type === "file" && item.canonicalId !== selected),
          explore,
        );
      }
    }
  }
  function renderDirectoryDetails(projection, fullDirectory) {
    renderPrompt(
      details,
      `Contents of ${directory}. Arrows aggregate imports between these immediate children; imports within a folder are not shown here.`,
      "Folder contents",
    );
    if (projection.pages > 1) {
      const pages = document.createElement("div");
      pages.className = "architecture-directory-pages";
      for (const [label, delta] of [
        ["Previous page", -1],
        ["Next page", 1],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button";
        button.textContent = label;
        button.disabled =
          projection.page + delta < 0 || projection.page + delta >= projection.pages;
        button.addEventListener("click", () => {
          const scroll = details.scrollTop;
          onPage(projection.page + delta);
          details.scrollTop = scroll;
          const buttons = details.querySelector(".architecture-directory-pages")?.children || [];
          const target = buttons[delta > 0 ? 1 : 0];
          (target?.disabled ? buttons[delta > 0 ? 0 : 1] : target)?.focus({ preventScroll: true });
        });
        pages.append(button);
      }
      details.append(pages);
      appendNote(
        details,
        `Page ${projection.page + 1} of ${projection.pages}: ${projection.nodes.length} of ${fullDirectory.nodes.length} items. Only imports between items on this page are drawn; other pages and cross-page connections are listed below.${projection.edges.length ? "" : " No imports between items on this page; other pages may have connections."}`,
      );
      renderBoundaryConnections(details, projection, (page, edgeId) => {
        const scroll = details.scrollTop;
        onPage(page);
        details.scrollTop = scroll;
        const list = details.querySelector(".architecture-boundary-connections");
        [...(list?.children || [])]
          .find((row) => row.dataset.edgeId === edgeId)
          ?.querySelector("button")
          ?.focus({ preventScroll: true });
      });
    }
    const list = document.createElement("details");
    list.className = "architecture-directory-list";
    const summary = document.createElement("summary");
    summary.textContent = `Browse all ${fullDirectory.nodes.length} items and ${fullDirectory.edges.length} connections`;
    list.append(summary);
    for (const node of fullDirectory.nodes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = `${node.type === "directory" ? "Folder" : "File"}: ${node.path}`;
      button.addEventListener("click", () =>
        node.type === "directory" ? selectOverview(node.path) : selectFile(node.path),
      );
      list.append(button);
    }
    for (const edge of fullDirectory.edges) {
      const source = fullDirectory.nodes.find((node) => node.id === edge.source),
        target = fullDirectory.nodes.find((node) => node.id === edge.target);
      const row = document.createElement("p");
      row.textContent = `${source.path} → ${target.path}: ${edge.weight} file imports`;
      list.append(row);
    }
    details.append(list);
  }
  renderGraphDetails(group, projection, graphSelected, impactResult, directoryView, fullDirectory);
}

function renderLayerInspector({
  details,
  legend,
  node,
  overview,
  id,
  analysis,
  currentModel,
  reset,
  explore,
}) {
  legend
    .querySelectorAll("button")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.layerId === id)),
    );
  if (overview) renderOverviewLayerDetails(details, node);
  else {
    renderLayerDetails(details, node.data(), node.descendants());
    appendNote(details, "This highlights the visible part of the layer in the current file view.");
  }
  if (overview) {
    const allLayers = document.createElement("button");
    allLayers.type = "button";
    allLayers.className = "architecture-back";
    allLayers.textContent = "All layers";
    allLayers.addEventListener("click", () => {
      reset();
      details.scrollTop = 0;
      details
        .querySelector(".architecture-layer-list")
        ?.querySelector("button")
        ?.focus({ preventScroll: true });
    });
    details.append(allLayers);
  }
  const layerFiles = analysis
    ? [...analysis.data.files.values()].filter((file) => file.parent === id)
    : (currentModel.nodes || [])
        .filter((file) => file.type === "file" && file.parent === id)
        .map((file) => ({ ...file, canonicalId: file.path }));
  appendFiles(details, "Files in this layer", layerFiles, explore, overview);
}
export { renderGraphInspector, renderLayerInspector };
