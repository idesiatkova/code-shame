import { prepare } from "./graph/model.js";

function overview(model) {
  const data = prepare(model);
  const counts = new Map();
  for (const edge of data.edges) {
    const source = data.files.get(edge.source).parent;
    const target = data.files.get(edge.target).parent;
    const key = JSON.stringify([source, target]);
    const item = counts.get(key) || {
      id: `aggregate:${key}`,
      source,
      target,
      type: "imports",
      weight: 0,
      crossLayer: source !== target,
    };
    item.weight++;
    counts.set(key, item);
  }
  return {
    nodes: [...data.layers.values()].map((layer) => ({
      ...layer,
      type: "overview-layer",
      withinLayer: counts.get(JSON.stringify([layer.id, layer.id]))?.weight || 0,
      displayLabel: `${layer.label} · ${layer.fileCount} files`,
    })),
    edges: [...counts.values()].filter((edge) => edge.crossLayer),
    fileCount: data.files.size,
    edgeCount: data.edges.length,
    complete: data.graph.complete,
  };
}

// Project file imports onto the immediate children of a real directory.
function directoryGraph(model, directory = ".", listedPaths = []) {
  const data = prepare(model),
    prefix = directory === "." ? "" : `${directory}/`;
  const files = [...data.files.values()];
  const known = new Set(files.map((file) => file.path));
  for (const path of listedPaths) if (!known.has(path)) files.push({ path, canonicalId: path });
  const { nodes, membership } = directoryNodes(files, prefix);
  const pairs = directoryEdges(data.edges, membership);
  return {
    nodes: [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path)),
    edges: [...pairs.values()],
    fileCount: membership.size,
    edgeCount: pairs.size,
    complete: data.graph.complete,
  };
}

function directoryNodes(files, prefix) {
  const nodes = new Map(),
    membership = new Map();
  for (const file of files) {
    if (!file.path.startsWith(prefix)) continue;
    const rest = file.path.slice(prefix.length),
      [name, ...descendants] = rest.split("/");
    if (!name) continue;
    const node = directoryNode(file, prefix, name, descendants.length > 0);
    const { id } = node;
    if (!nodes.has(id)) nodes.set(id, node);
    nodes.get(id).fileCount++;
    membership.set(file.canonicalId, id);
  }
  return { nodes, membership };
}

function directoryNode(file, prefix, name, folder) {
  const path = `${prefix}${name}`,
    type = folder ? "directory" : "file";
  return {
    id: `${type}:${path}`,
    path,
    canonicalId: folder ? undefined : file.canonicalId,
    layerId: folder ? undefined : file.layerId,
    type,
    label: name,
    color: folder ? undefined : file.color,
    fileCount: 0,
  };
}

function directoryEdges(edges, membership) {
  const pairs = new Map();
  for (const edge of edges) {
    const source = membership.get(edge.source),
      target = membership.get(edge.target);
    if (!source || !target || source === target) continue;
    const key = JSON.stringify([source, target]);
    const item = pairs.get(key) || {
      id: `directory-edge:${key}`,
      source,
      target,
      type: "imports",
      weight: 0,
    };
    item.weight++;
    pairs.set(key, item);
  }
  return pairs;
}

function directoryPage(projection, page, size = 6) {
  const pages = Math.max(1, Math.ceil(projection.nodes.length / size));
  const index = Math.max(0, Math.min(pages - 1, Number.isInteger(page) ? page : 0));
  const nodes = projection.nodes.slice(index * size, (index + 1) * size);
  const ids = new Set(nodes.map((node) => node.id));
  const positions = new Map(
    projection.nodes.map((node, i) => [node.id, { node, page: Math.floor(i / size) }]),
  );
  const edges = [],
    boundary = [],
    other = [];
  for (const edge of projection.edges) {
    const sourceHere = ids.has(edge.source),
      targetHere = ids.has(edge.target);
    if (sourceHere && targetHere) edges.push(edge);
    else if (sourceHere || targetHere)
      boundary.push({
        ...edge,
        sourceNode: positions.get(edge.source).node,
        targetNode: positions.get(edge.target).node,
        destination: positions.get(sourceHere ? edge.target : edge.source),
      });
    else other.push(edge);
  }
  return { ...projection, nodes, edges, boundary, other, page: index, pages };
}

export { overview, directoryGraph, directoryPage };
