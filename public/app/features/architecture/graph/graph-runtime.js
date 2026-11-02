import { validCamera, restoreGraphCamera } from "./camera.js";
import { createGraphOptions } from "./architecture-graph.js";

function createGraphRuntime({ container, readWorkspace, saveCamera }) {
  let graph = null,
    graphContext = null,
    graphLayout = null,
    cameraMode = "fit",
    changingCamera = false,
    canvasSize = null;
  const programmatic = (action) => {
    changingCamera = true;
    try {
      action();
    } finally {
      changingCamera = false;
    }
  };
  function cameraChanged() {
    if (changingCamera || !graph || readWorkspace().mode !== "map") return;
    cameraMode = "manual";
    saveCamera({
      context: graphContext,
      mode: "manual",
      zoom: graph.zoom(),
      pan: { ...graph.pan() },
    });
  }
  let zoomTarget = null;
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(() => {
      if (!graph || !container.clientWidth || !container.clientHeight) return;
      const size = { width: container.clientWidth, height: container.clientHeight };
      if (canvasSize && size.width === canvasSize.width && size.height === canvasSize.height)
        return;
      const oldSize = canvasSize || size,
        pan = graph.pan();
      const layout = layoutForGraph();
      programmatic(() => {
        graph.resize();
        if (JSON.stringify(layout) !== JSON.stringify(graphLayout)) {
          graph.layout({ ...layout, fit: false }).run();
          graphLayout = layout;
        }
        if (cameraMode === "fit") graph.fit(graph.elements(), 36);
        else
          graph.pan({
            x: pan.x + (size.width - oldSize.width) / 2,
            y: pan.y + (size.height - oldSize.height) / 2,
          });
      });
      canvasSize = size;
      if (cameraMode === "manual") cameraChanged();
    }).observe(container);

  function retainCamera() {
    const {
      projectKey,
      selected,
      directory,
      mode,
      view,
      direction,
      depth,
      cycle,
      directoryPageIndex,
      restoringNavigation,
    } = readWorkspace();
    const nextContext = JSON.stringify([
      projectKey,
      selected,
      directory,
      mode,
      view,
      direction,
      depth,
      cycle,
      selected ? 0 : directoryPageIndex,
    ]);
    const sameContext = !restoringNavigation && graph && graphContext === nextContext;
    const saved = window.history.state?.camera;
    const restoredCamera = !sameContext && validCamera(saved, nextContext) ? saved : null;
    const viewport = sameContext
      ? { zoom: graph.zoom(), pan: graph.pan() }
      : restoredCamera?.mode === "manual"
        ? restoredCamera
        : null;
    cameraMode = sameContext ? cameraMode : restoredCamera?.mode || "fit";
    destroyGraph();
    graphContext = nextContext;
    return { viewport, restoredCamera };
  }
  function initializeGraph(
    projection,
    tokens,
    fileView,
    directoryView,
    group,
    viewport,
    restoredCamera,
  ) {
    const { selected } = readWorkspace();
    container.replaceChildren();
    const options = createGraphOptions(container, projection, tokens);
    if (fileView)
      Object.assign(options.layout, {
        rankDir: container.clientWidth >= 500 ? "LR" : "TB",
        nodeSep: 12,
        rankSep: 45,
        edgeSep: 12,
        padding: 12,
      });
    if (directoryView && projection.pages > 1)
      options.layout = {
        name: "grid",
        cols: container.clientWidth >= 500 ? 3 : 2,
        padding: 12,
        fit: true,
        avoidOverlap: true,
      };
    graphLayout = options.layout;
    canvasSize = { width: container.clientWidth, height: container.clientHeight };
    graph = window.cytoscape(options);
    zoomTarget =
      (group
        ? projection.nodes.find((node) => node.type === "file")
        : projection.nodes.find((node) => node.canonicalId === selected)
      )?.id || null;
    restoreGraphCamera(graph, viewport, restoredCamera, directoryView, projection.pages);
    graph.on("pan zoom", cameraChanged);
  }
  function layoutForGraph() {
    const { selected, view } = readWorkspace();
    const layout = { ...graphLayout };
    if (layout.name === "grid") layout.cols = container.clientWidth >= 500 ? 3 : 2;
    else
      layout.rankDir =
        selected && view === "dependencies"
          ? container.clientWidth >= 500
            ? "LR"
            : "TB"
          : container.clientWidth < 900
            ? "TB"
            : "LR";
    return layout;
  }
  function destroyGraph() {
    if (graph) graph.destroy();
    graph = null;
  }
  function focusLayer(id) {
    const node = graph.getElementById(id);
    const overview = node.data("type") === "overview-layer";
    const collection = overview
      ? node.closedNeighborhood()
      : node.add(node.descendants()).add(node.descendants().connectedEdges());
    graph.elements().addClass("is-muted").removeClass("is-active is-selected");
    collection.removeClass("is-muted").addClass("is-active");
    node.addClass("is-selected");
    return {
      node,
      overview,
      fit: () => graph.fit(overview ? collection : node.add(node.descendants()), 44),
    };
  }
  function fit() {
    if (!graph) return;
    cameraMode = "fit";
    programmatic(() => {
      graph.resize();
      graph.fit(graph.elements(), 36);
    });
    saveCamera({ context: graphContext, mode: "fit" });
  }
  function readable() {
    if (!graph) return;
    programmatic(() => {
      graph.resize();
      graph.fit(graph.elements(), 36);
      if (graph.zoom() < 1) graph.zoom(1);
      graph.center(zoomTarget ? graph.getElementById(zoomTarget) : graph.elements());
    });
    cameraChanged();
  }
  function zoom(factor) {
    if (graph)
      graph.zoom({
        level: graph.zoom() * factor,
        renderedPosition: { x: container.clientWidth / 2, y: container.clientHeight / 2 },
      });
  }
  return {
    get graph() {
      return graph;
    },
    get context() {
      return graphContext;
    },
    focusLayer,
    retainCamera,
    initializeGraph,
    destroyGraph,
    fit,
    readable,
    zoom,
  };
}
export { createGraphRuntime };
