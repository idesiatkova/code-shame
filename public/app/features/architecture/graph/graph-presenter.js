import { renderLegend, renderDetails } from "../components/organisms/graph-details.js";
import {
  renderGraphInspector,
  renderLayerInspector,
} from "../components/organisms/graph-inspector.js";
import { prepareGraph, showGraphSurface, updateGraphStats } from "./graph-view.js";

function createGraphPresenter({
  runtime,
  details,
  legend,
  stats,
  container,
  mapActions,
  back,
  browserHeader,
  readWorkspace,
  readProject,
  readControls,
  listedFiles,
  setLayer,
  setPage,
  setCycleMember,
  updateGraphControls,
  saveNavigation,
  selectFile,
  selectOverview,
  openSource,
  refreshSearch,
}) {
  let detailsFile = null;
  function draw() {
    const {
      selected,
      directory,
      directoryPageIndex,
      activeLayer,
      cycleMember,
      restoringNavigation,
    } = readWorkspace();
    const { analysis, currentModel } = readProject();
    const { view, cycle, direction, depth } = readControls();
    if (selected !== detailsFile) {
      details.scrollTop = 0;
      detailsFile = selected;
    }
    const focusedLayer = document.activeElement?.dataset?.layerId;
    const retainedLayer = view.value === "project" ? activeLayer : null;
    setLayer(null);
    const {
      graphSelected,
      group,
      impactResult,
      directoryView,
      missingFile,
      fullDirectory,
      tokens,
      fileView,
      projection,
    } = prepareGraph({
      selected,
      analysis,
      currentModel,
      view: view.value,
      cycle: cycle.value,
      directory,
      listedFiles: listedFiles(),
      direction: direction.value,
      depth: depth.value,
      directoryPageIndex,
    });
    updateGraphControls(graphSelected);
    const pageChanged = directoryView && directoryPageIndex !== projection.page;
    if (directoryView) setPage(projection.page);
    const { viewport, restoredCamera } = runtime.retainCamera();
    if (pageChanged && !restoringNavigation) saveNavigation(true);
    if (
      !showGraphSurface({
        projection,
        impactResult,
        group,
        mapActions,
        back,
        selected,
        directory,
        view: view.value,
        analysis,
        container,
        legend,
        stats,
        details,
      })
    )
      return;
    runtime.initializeGraph(
      projection,
      tokens,
      fileView,
      directoryView,
      group,
      viewport,
      restoredCamera,
    );
    const graph = runtime.graph;
    bindGraphInteractions(
      graph,
      (id) => {
        if (group) {
          setCycleMember(id);
          draw();
        } else {
          selectFile(id);
          refreshSearch();
        }
      },
      selectLayer,
      reset,
      (edge) => {
        const source = graph.getElementById(edge.data("source")).data();
        const target = graph.getElementById(edge.data("target")).data();
        renderDetails(details, "Dependency", "Importer → imported", [
          ["From", source.path || source.label],
          ["To", target.path || target.label],
          ["File dependencies", edge.data("weight")],
        ]);
      },
    );
    graph.on("tap", 'node[type = "directory"]', (event) =>
      selectOverview(event.target.data("path")),
    );
    renderLegend(legend, projection.nodes, selectLayer);
    if (focusedLayer)
      [...legend.querySelectorAll("button")]
        .find((button) => button.dataset.layerId === focusedLayer)
        ?.focus();
    updateGraphStats({
      projection,
      group,
      impactResult,
      missingFile,
      graphSelected,
      fileView,
      directoryView,
      fullDirectory,
      stats,
      view: view.value,
      direction: direction.value,
      depth: depth.value,
      directory,
      currentModel,
    });
    renderGraphInspector({
      details,
      graph,
      currentModel,
      analysis,
      selected,
      directory,
      view: view.value,
      direction: direction.value,
      depth: depth.value,
      cycleMember,
      group,
      projection,
      graphSelected,
      impactResult,
      directoryView,
      fullDirectory,
      selectLayer,
      explore,
      openSource: () => openSource(browserHeader.querySelector('[data-mode="source"]')),
      selectOverview,
      selectFile,
      onPage: (page) => {
        setPage(page);
        draw();
        saveNavigation();
      },
    });
    if (retainedLayer && graph.getElementById(retainedLayer).length) selectLayer(retainedLayer);
  }
  function reset() {
    setLayer(null);
    draw();
    saveNavigation();
  }
  function selectLayer(id) {
    const { activeLayer, restoringNavigation } = readWorkspace();
    const { analysis, currentModel } = readProject();
    if (activeLayer === id) {
      reset();
      return;
    }
    setLayer(id);
    const { node, overview, fit } = runtime.focusLayer(id);
    renderLayerInspector({
      details,
      legend,
      node,
      overview,
      id,
      analysis,
      currentModel,
      reset,
      explore,
    });
    if (overview && !restoringNavigation) saveNavigation();
    if (!restoringNavigation) fit();
  }
  function explore(id) {
    const { view } = readControls();
    view.value = "dependencies";
    selectFile(id);
    refreshSearch();
  }
  return {
    draw,
    clearSelection: () => {
      detailsFile = null;
    },
  };
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

export { createGraphPresenter };
