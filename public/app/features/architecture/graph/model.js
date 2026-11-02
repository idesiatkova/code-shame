const UNKNOWN = "__unknown__";

function canonical(model) {
  if (model.projectGraph) return model.projectGraph;
  const files = (model.nodes || []).filter((node) => node.type === "file");
  const ids = new Map(files.map((node) => [node.id, node.path]));
  return {
    complete: false,
    nodes: files.map((node) => ({
      id: node.path,
      path: node.path,
      layerId: node.layerId,
      entryPoint: node.entryPoint,
    })),
    edges: (model.edges || [])
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ source: ids.get(edge.source), target: ids.get(edge.target) })),
  };
}

function prepare(model) {
  const graph = canonical(model);
  const layers = new Map(
    (model.nodes || [])
      .filter((node) => node.type === "layer")
      .map((node) => [node.layerId, { ...node }]),
  );
  const oldFiles = new Map(
    (model.nodes || []).filter((node) => node.type === "file").map((node) => [node.path, node]),
  );
  const files = new Map();
  for (const node of graph.nodes || []) {
    const layerId = layers.has(node.layerId) ? node.layerId : UNKNOWN;
    if (!layers.has(layerId))
      layers.set(layerId, {
        id: "layer:__unknown__",
        layerId,
        type: "layer",
        label: "Unknown layer",
        fileCount: 0,
      });
    const layer = layers.get(layerId);
    if (layerId === UNKNOWN) layer.fileCount++;
    files.set(node.id, {
      ...oldFiles.get(node.path),
      ...node,
      id: `file:${node.id}`,
      canonicalId: node.id,
      type: "file",
      parent: layer.id,
      layerId,
      color: layer.color,
      label: node.path.split("/").pop(),
    });
  }
  const edges = uniqueEdges(graph, files);
  return { graph, layers, files, edges };
}

function uniqueEdges(graph, files) {
  const pairs = new Map();
  for (const edge of graph.edges || []) {
    if (!files.has(edge.source) || !files.has(edge.target)) continue;
    const key = JSON.stringify([edge.source, edge.target]);
    if (!pairs.has(key)) pairs.set(key, { source: edge.source, target: edge.target });
  }
  return [...pairs.values()];
}

export { prepare };
