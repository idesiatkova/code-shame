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

export { directoryPage };
