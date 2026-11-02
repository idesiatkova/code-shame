// Configured boundaries retain the model color; automatic classifications use
// stable theme colors even when configured boundaries change palette positions.
function colorizeProjection(model, projection, tokens) {
  const sources = new Map(
    (model.nodes || [])
      .filter((node) => node.type === "layer")
      .map((node) => [node.layerId, node.source]),
  );
  return {
    ...projection,
    nodes: projection.nodes.map((node) => {
      if (node.type === "directory")
        return { ...node, color: tokens["graph-directory-border"] || node.color };
      const source = sources.get(node.layerId);
      const key =
        node.layerId === "__unknown__" || !node.layerId ? "layer-unknown" : `layer-${node.layerId}`;
      const color =
        (source === "automatic" || source === "demo" || key === "layer-unknown") && tokens[key];
      return color ? { ...node, color } : node;
    }),
  };
}

export { colorizeProjection };
