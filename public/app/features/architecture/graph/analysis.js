import { prepare } from "./model.js";

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

function analytics(model) {
  if (!model.projectGraph) return null;
  const data = prepare(model);
  const outgoing = new Map([...data.files.keys()].map((id) => [id, []]));
  const incoming = new Map([...data.files.keys()].map((id) => [id, []]));
  for (const { source, target } of data.edges) {
    outgoing.get(source).push(target);
    incoming.get(target).push(source);
  }
  const order = finishingOrder(data.files.keys(), outgoing);
  const cycles = stronglyConnected(order, incoming, outgoing);
  return { data, incoming, outgoing, cycles };
}

function finishingOrder(ids, outgoing) {
  const visited = new Set(),
    order = [];
  for (const id of ids) {
    if (visited.has(id)) continue;
    visited.add(id);
    const stack = [[id, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1],
        neighbors = outgoing.get(top[0]);
      if (top[1] < neighbors.length) {
        const next = neighbors[top[1]++];
        if (!visited.has(next)) {
          visited.add(next);
          stack.push([next, 0]);
        }
      } else {
        order.push(top[0]);
        stack.pop();
      }
    }
  }
  return order;
}

function stronglyConnected(order, incoming, outgoing) {
  const visited = new Set();
  const cycles = [];
  for (const id of order.reverse()) {
    if (visited.has(id)) continue;
    const group = [],
      stack = [id];
    visited.add(id);
    while (stack.length) {
      const next = stack.pop();
      group.push(next);
      for (const source of incoming.get(next))
        if (!visited.has(source)) {
          visited.add(source);
          stack.push(source);
        }
    }
    if (group.length > 1 || outgoing.get(id).includes(id)) cycles.push(group.sort());
  }
  cycles.sort((a, b) => a[0].localeCompare(b[0]));
  return cycles;
}

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

export { focus, analytics, impact, projectSelection };
