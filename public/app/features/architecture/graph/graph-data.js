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

function uniqueEdges(graph, files) {
  const pairs = new Map();
  for (const edge of graph.edges || []) {
    if (!files.has(edge.source) || !files.has(edge.target)) continue;
    const key = JSON.stringify([edge.source, edge.target]);
    if (!pairs.has(key)) pairs.set(key, { source: edge.source, target: edge.target });
  }
  return [...pairs.values()];
}

export { canonical, uniqueEdges };
