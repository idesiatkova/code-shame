const UNKNOWN = '__unknown__';

function canonical(model) {
  if (model.projectGraph) return model.projectGraph;
  const files = (model.nodes || []).filter((node) => node.type === 'file');
  const ids = new Map(files.map((node) => [node.id, node.path]));
  return { complete: false, nodes: files.map((node) => ({ id: node.path, path: node.path, layerId: node.layerId, entryPoint: node.entryPoint })), edges: (model.edges || []).filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ source: ids.get(edge.source), target: ids.get(edge.target) })) };
}

function prepare(model) {
  const graph = canonical(model);
  const layers = new Map((model.nodes || []).filter((node) => node.type === 'layer').map((node) => [node.layerId, { ...node }]));
  const oldFiles = new Map((model.nodes || []).filter((node) => node.type === 'file').map((node) => [node.path, node]));
  const files = new Map();
  for (const node of graph.nodes || []) {
    const layerId = layers.has(node.layerId) ? node.layerId : UNKNOWN;
    if (!layers.has(layerId)) layers.set(layerId, { id: 'layer:__unknown__', layerId, type: 'layer', label: 'Unknown layer', color: '#8794a8', fileCount: 0 });
    const layer = layers.get(layerId);
    if (layerId === UNKNOWN) layer.fileCount++;
    files.set(node.id, { ...oldFiles.get(node.path), ...node, id: `file:${node.id}`, canonicalId: node.id, type: 'file', parent: layer.id, layerId, color: layer.color, label: node.path.split('/').pop() });
  }
  const pairs = new Map();
  for (const edge of graph.edges || []) {
    if (!files.has(edge.source) || !files.has(edge.target)) continue;
    const key = JSON.stringify([edge.source, edge.target]);
    if (!pairs.has(key)) pairs.set(key, { source: edge.source, target: edge.target });
  }
  return { graph, layers, files, edges: [...pairs.values()] };
}

function overview(model) {
  const data = prepare(model);
  const counts = new Map();
  for (const edge of data.edges) {
    const source = data.files.get(edge.source).parent;
    const target = data.files.get(edge.target).parent;
    const key = JSON.stringify([source, target]);
    const item = counts.get(key) || { id: `aggregate:${key}`, source, target, type: 'imports', weight: 0, crossLayer: source !== target };
    item.weight++;
    counts.set(key, item);
  }
  return { nodes: [...data.layers.values()].map((layer) => ({ ...layer, type: "overview-layer", withinLayer: counts.get(JSON.stringify([layer.id, layer.id]))?.weight || 0, displayLabel: `${layer.label} · ${layer.fileCount} files` })), edges: [...counts.values()].filter((edge) => edge.crossLayer), fileCount: data.files.size, edgeCount: data.edges.length, complete: data.graph.complete };
}

function searchFiles(model, query) {
  const term = query.trim().toLowerCase();
  if (!term) return [];
  return [...prepare(model).files.values()].filter((node) => node.path.toLowerCase().includes(term)).sort((a, b) => a.path.localeCompare(b.path));
}

function focus(model, selected, direction = 'both', depth = 1, limit = 60) {
  const data = prepare(model);
  if (!data.files.has(selected)) return { nodes: [], edges: [], totalFiles: 0, totalEdges: 0, shownFiles: 0, shownEdges: 0 };
  const visited = new Set([selected]);
  let frontier = new Set([selected]);
  for (let step = 0; step < depth; step++) {
    const next = new Set();
    for (const edge of data.edges) {
      if (direction !== 'inbound' && frontier.has(edge.source) && !visited.has(edge.target)) next.add(edge.target);
      if (direction !== 'outbound' && frontier.has(edge.target) && !visited.has(edge.source)) next.add(edge.source);
    }
    for (const id of next) visited.add(id);
    frontier = next;
  }
  const allEdges = data.edges.filter((edge) => visited.has(edge.source) && visited.has(edge.target));
  const shown = new Set([...visited].slice(0, Math.max(1, limit)));
  const edges = allEdges.filter((edge) => shown.has(edge.source) && shown.has(edge.target)).slice(0, 300).map((edge, index) => ({ id: `focus:${index}`, type: 'imports', source: data.files.get(edge.source).id, target: data.files.get(edge.target).id, weight: 1, crossLayer: data.files.get(edge.source).layerId !== data.files.get(edge.target).layerId }));
  const files = [...shown].map((id) => data.files.get(id));
  const layerIds = new Set(files.map((file) => file.layerId));
  return { nodes: [...data.layers.values()].filter((layer) => layerIds.has(layer.layerId)).concat(files), edges, totalFiles: visited.size, totalEdges: allEdges.length, shownFiles: files.length, shownEdges: edges.length, complete: data.graph.complete };
}

export { overview, searchFiles, focus };
