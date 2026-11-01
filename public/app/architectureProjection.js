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
    if (!layers.has(layerId)) layers.set(layerId, { id: 'layer:__unknown__', layerId, type: 'layer', label: 'Unknown layer', fileCount: 0 });
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

// Project file imports onto the immediate children of a real directory.
function directoryGraph(model, directory = '.', listedPaths = []) {
  const data = prepare(model), prefix = directory === '.' ? '' : `${directory}/`;
  const nodes = new Map(), membership = new Map();
  const files = [...data.files.values()];
  const known = new Set(files.map((file) => file.path));
  for (const path of listedPaths) if (!known.has(path)) files.push({ path, canonicalId: path });
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length), [name, ...descendants] = rest.split('/');
    if (!name) continue;
    const path = `${prefix}${name}`, folder = descendants.length > 0;
    const id = `${folder ? 'directory' : 'file'}:${path}`;
    if (!nodes.has(id)) nodes.set(id, { id, path, canonicalId: folder ? undefined : file.canonicalId, layerId: folder ? undefined : file.layerId, type: folder ? 'directory' : 'file', label: name, color: folder ? undefined : file.color, fileCount: 0 });
    nodes.get(id).fileCount++;
    membership.set(file.canonicalId, id);
  }
  const pairs = new Map();
  for (const edge of data.edges) {
    const source = membership.get(edge.source), target = membership.get(edge.target);
    if (!source || !target || source === target) continue;
    const key = JSON.stringify([source, target]);
    const item = pairs.get(key) || { id: `directory-edge:${key}`, source, target, type: 'imports', weight: 0 };
    item.weight++; pairs.set(key, item);
  }
  return { nodes: [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path)), edges: [...pairs.values()], fileCount: membership.size, edgeCount: pairs.size, complete: data.graph.complete };
}

function directoryPage(projection, page, size = 6) {
  const pages = Math.max(1, Math.ceil(projection.nodes.length / size));
  const index = Math.max(0, Math.min(pages - 1, Number.isInteger(page) ? page : 0));
  const nodes = projection.nodes.slice(index * size, (index + 1) * size);
  const ids = new Set(nodes.map((node) => node.id));
  const positions = new Map(projection.nodes.map((node, i) => [node.id, { node, page: Math.floor(i / size) }]));
  const edges = [], boundary = [], other = [];
  for (const edge of projection.edges) {
    const sourceHere = ids.has(edge.source), targetHere = ids.has(edge.target);
    if (sourceHere && targetHere) edges.push(edge);
    else if (sourceHere || targetHere) boundary.push({ ...edge, sourceNode: positions.get(edge.source).node, targetNode: positions.get(edge.target).node, destination: positions.get(sourceHere ? edge.target : edge.source) });
    else other.push(edge);
  }
  return { ...projection, nodes, edges, boundary, other, page: index, pages };
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
  const allEdges = data.edges.filter((edge) => visited.has(edge.source) && visited.has(edge.target) && (depth !== 1 || (direction !== 'inbound' && edge.source === selected) || (direction !== 'outbound' && edge.target === selected)));
  const shown = new Set([...visited].slice(0, Math.max(1, limit)));
  const edges = allEdges.filter((edge) => shown.has(edge.source) && shown.has(edge.target)).slice(0, 300).map((edge, index) => ({ id: `focus:${index}`, type: 'imports', source: data.files.get(edge.source).id, target: data.files.get(edge.target).id, weight: 1, crossLayer: data.files.get(edge.source).layerId !== data.files.get(edge.target).layerId }));
  const files = [...shown].map((id) => data.files.get(id));
  const layerIds = new Set(files.map((file) => file.layerId));
  return { nodes: [...data.layers.values()].filter((layer) => layerIds.has(layer.layerId)).concat(files), edges, totalFiles: visited.size, totalEdges: allEdges.length, shownFiles: files.length, shownEdges: edges.length, complete: data.graph.complete };
}

function analytics(model) {
  if (!model.projectGraph) return null;
  const data = prepare(model);
  const outgoing = new Map([...data.files.keys()].map((id) => [id, []]));
  const incoming = new Map([...data.files.keys()].map((id) => [id, []]));
  for (const { source, target } of data.edges) { outgoing.get(source).push(target); incoming.get(target).push(source); }
  const visited = new Set(), order = [];
  for (const id of data.files.keys()) {
    if (visited.has(id)) continue;
    visited.add(id);
    const stack = [[id, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1], neighbors = outgoing.get(top[0]);
      if (top[1] < neighbors.length) {
        const next = neighbors[top[1]++];
        if (!visited.has(next)) { visited.add(next); stack.push([next, 0]); }
      } else { order.push(top[0]); stack.pop(); }
    }
  }
  visited.clear();
  const cycles = [];
  for (const id of order.reverse()) {
    if (visited.has(id)) continue;
    const group = [], stack = [id]; visited.add(id);
    while (stack.length) {
      const next = stack.pop(); group.push(next);
      for (const source of incoming.get(next)) if (!visited.has(source)) { visited.add(source); stack.push(source); }
    }
    if (group.length > 1 || outgoing.get(id).includes(id)) cycles.push(group.sort());
  }
  cycles.sort((a, b) => a[0].localeCompare(b[0]));
  return { data, incoming, outgoing, cycles };
}

function impact(analysis, selected, limit = 60) {
  if (!analysis?.incoming.has(selected)) return null;
  const direct = new Set(analysis.incoming.get(selected)); direct.delete(selected);
  const visited = new Set([selected]), queue = [selected];
  for (let i = 0; i < queue.length; i++) for (const id of analysis.incoming.get(queue[i])) {
    if (!visited.has(id)) { visited.add(id); queue.push(id); }
  }
  return { direct: direct.size, transitive: visited.size - 1 - direct.size, ...projectSelection(analysis, queue, limit) };
}

function projectSelection(analysis, ids, limit = 60) {
  const { data } = analysis, all = new Set(ids), shown = new Set(ids.slice(0, Math.max(1, limit)));
  const allEdges = data.edges.filter((edge) => all.has(edge.source) && all.has(edge.target));
  const edges = allEdges.filter((edge) => shown.has(edge.source) && shown.has(edge.target)).slice(0, 300).map((edge, index) => ({ id: `analysis:${index}`, type: 'imports', source: data.files.get(edge.source).id, target: data.files.get(edge.target).id, weight: 1, crossLayer: data.files.get(edge.source).layerId !== data.files.get(edge.target).layerId }));
  const files = [...shown].map((id) => data.files.get(id)), layers = new Set(files.map((file) => file.layerId));
  return { nodes: [...data.layers.values()].filter((layer) => layers.has(layer.layerId)).concat(files), edges, totalFiles: all.size, totalEdges: allEdges.length, shownFiles: files.length, shownEdges: edges.length, complete: data.graph.complete };
}

export { overview, directoryGraph, directoryPage, searchFiles, focus, analytics, impact, projectSelection };
