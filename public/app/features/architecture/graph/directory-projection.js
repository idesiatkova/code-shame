import { prepare } from "./model.js";

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

export { directoryGraph };
