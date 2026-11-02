function impact(analysis, selected, limit = 60) {
  if (!analysis?.incoming.has(selected)) return null;
  const direct = new Set(analysis.incoming.get(selected));
  direct.delete(selected);
  const visited = new Set([selected]),
    queue = [selected];
  for (let i = 0; i < queue.length; i++)
    for (const id of analysis.incoming.get(queue[i])) {
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
    }
  return {
    direct: direct.size,
    transitive: visited.size - 1 - direct.size,
    directIds: [...direct],
    reachableIds: queue.slice(1).filter((id) => !direct.has(id)),
    ...projectSelection(analysis, queue, limit),
  };
}

function projectSelection(analysis, ids, limit = 60) {
  const { data } = analysis,
    all = new Set(ids);
  const allEdges = data.edges.filter((edge) => all.has(edge.source) && all.has(edge.target));
  return selectionProjection(data, ids, allEdges, limit, "analysis");
}

function selectionProjection(data, ids, allEdges, limit, prefix) {
  const shown = new Set(ids.slice(0, Math.max(1, limit)));
  const edges = allEdges
    .filter((edge) => shown.has(edge.source) && shown.has(edge.target))
    .slice(0, 300)
    .map((edge, index) => ({
      id: `${prefix}:${index}`,
      type: "imports",
      source: data.files.get(edge.source).id,
      target: data.files.get(edge.target).id,
      weight: 1,
      crossLayer: data.files.get(edge.source).layerId !== data.files.get(edge.target).layerId,
    }));
  const files = [...shown].map((id) => data.files.get(id)),
    layers = new Set(files.map((file) => file.layerId));
  return {
    nodes: [...data.layers.values()].filter((layer) => layers.has(layer.layerId)).concat(files),
    edges,
    totalFiles: new Set(ids).size,
    totalEdges: allEdges.length,
    shownFiles: files.length,
    shownEdges: edges.length,
    complete: data.graph.complete,
  };
}

export { impact, projectSelection, selectionProjection };
