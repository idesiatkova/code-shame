import { prepare } from "./model.js";

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

export { overview };
