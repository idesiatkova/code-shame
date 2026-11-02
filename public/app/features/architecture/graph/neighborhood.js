import { prepare } from "./model.js";
import { selectionProjection } from "./selection.js";

function focus(model, selected, direction = "both", depth = 1, limit = 60) {
  const data = prepare(model);
  if (!data.files.has(selected))
    return { nodes: [], edges: [], totalFiles: 0, totalEdges: 0, shownFiles: 0, shownEdges: 0 };
  const visited = new Set([selected]);
  let frontier = new Set([selected]);
  for (let step = 0; step < depth; step++) {
    const next = new Set();
    for (const edge of data.edges) {
      if (direction !== "inbound" && frontier.has(edge.source) && !visited.has(edge.target))
        next.add(edge.target);
      if (direction !== "outbound" && frontier.has(edge.target) && !visited.has(edge.source))
        next.add(edge.source);
    }
    for (const id of next) visited.add(id);
    frontier = next;
  }
  const allEdges = data.edges.filter(
    (edge) =>
      visited.has(edge.source) &&
      visited.has(edge.target) &&
      (depth !== 1 ||
        (direction !== "inbound" && edge.source === selected) ||
        (direction !== "outbound" && edge.target === selected)),
  );
  return selectionProjection(data, [...visited], allEdges, limit, "focus");
}

export { focus };
