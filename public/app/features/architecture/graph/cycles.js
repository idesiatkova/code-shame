import { prepare } from "./model.js";

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
  return {
    data,
    incoming: readonlyAdjacency(incoming),
    outgoing: readonlyAdjacency(outgoing),
    cycles,
  };
}

function readonlyAdjacency(index) {
  for (const neighbors of index.values()) Object.freeze(neighbors);
  return Object.freeze({
    has: (id) => index.has(id),
    get: (id) => index.get(id),
  });
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

export { analytics };
