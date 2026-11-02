import { canonical, uniqueEdges } from "./graph-data.js";

const UNKNOWN = "__unknown__";

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

export { prepare };
