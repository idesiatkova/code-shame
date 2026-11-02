function validCamera(camera, context) {
  return (
    camera?.context === context &&
    (camera.mode === "fit" ||
      (camera.mode === "manual" &&
        Number.isFinite(camera.zoom) &&
        camera.zoom >= 0.05 &&
        camera.zoom <= 2.4 &&
        Number.isFinite(camera.pan?.x) &&
        Number.isFinite(camera.pan?.y)))
  );
}

function restoreGraphCamera(graph, viewport, restoredCamera, directoryView, pages) {
  if (viewport) {
    graph.zoom(viewport.zoom);
    graph.pan(viewport.pan);
  } else if (restoredCamera?.mode === "fit") graph.fit(graph.elements(), 36);
  else if (directoryView && pages > 1) {
    if (graph.zoom() > 1) {
      graph.zoom(1);
      graph.center();
    }
  } else if (directoryView) {
    graph.zoom(Math.max(0.9, Math.min(1, graph.zoom())));
    graph.center();
  } else graph.fit(graph.elements(), 36);
}

export { validCamera, restoreGraphCamera };
