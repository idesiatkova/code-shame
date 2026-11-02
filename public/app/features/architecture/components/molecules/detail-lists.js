function renderBoundaryConnections(element, projection, navigate) {
  if (!projection.boundary.length) return;
  const list = document.createElement("div");
  list.className = "architecture-boundary-connections";
  const heading = document.createElement("h3");
  heading.textContent = `Cross-page connections (${projection.boundary.length})`;
  list.append(heading);
  appendDirectoryConnections(list, projection.boundary, navigate);
  element.append(list);
}

function appendDirectoryConnections(element, edges, navigate) {
  const groups = new Map();
  for (const edge of edges) {
    const key = edge.sourceNode.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  const list = document.createElement("ul");
  list.className = "architecture-connection-groups";
  for (const connections of groups.values()) list.append(connectionGroup(connections, navigate));
  element.append(list);
}

function connectionGroup(connections, navigate) {
  const group = document.createElement("li");
  group.className = "architecture-connection-group";
  const heading = document.createElement("h4");
  const source = connections[0].sourceNode;
  heading.textContent = source.label || source.path.split("/").at(-1);
  heading.title = source.path;
  const targets = document.createElement("ul");
  for (const edge of connections) {
    const row = connectionRow(edge);
    if (navigate) appendPageLink(heading, row, edge, navigate);
    targets.append(row);
  }
  group.append(heading, targets);
  return group;
}

function connectionRow(edge) {
  const row = document.createElement("li");
  row.className = "architecture-connection-row";
  row.dataset.edgeId = edge.id;
  row.setAttribute("aria-label", `${edge.sourceNode.path} imports ${edge.targetNode.path}`);
  const arrow = document.createElement("i");
  arrow.setAttribute("data-lucide", "corner-down-right");
  arrow.setAttribute("aria-hidden", "true");
  const target = document.createElement("span");
  target.className = "architecture-connection-target";
  target.textContent = edge.targetNode.label || edge.targetNode.path.split("/").at(-1);
  target.title = edge.targetNode.path;
  const count = document.createElement("span");
  count.className = "architecture-connection-count";
  count.textContent = `${edge.weight} ${edge.weight === 1 ? "import" : "imports"}`;
  row.append(arrow, target, count);
  return row;
}

function appendPageLink(heading, row, edge, navigate) {
  const destination = edge.destination.node.id === edge.sourceNode.id ? heading : row;
  if (destination === heading && heading.querySelector("button")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "architecture-file-link architecture-connection-page";
  button.textContent = `Page ${edge.destination.page + 1}`;
  const label = `Show ${edge.destination.node.path} on page ${edge.destination.page + 1}`;
  button.setAttribute("aria-label", label);
  button.title = label;
  const icon = document.createElement("i");
  icon.setAttribute("data-lucide", "arrow-right");
  icon.setAttribute("aria-hidden", "true");
  button.append(icon);
  button.addEventListener("click", () => navigate(edge.destination.page, edge.id));
  destination.append(button);
}

function appendFiles(element, label, files, explore, open = false) {
  if (!files.length) return;
  const disclosure = document.createElement("details");
  disclosure.open = open;
  const summary = document.createElement("summary");
  summary.textContent = label;
  const list = document.createElement("ul");
  list.className = "architecture-file-list";
  files.forEach((file) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "architecture-file-link";
    button.textContent = file.path;
    button.setAttribute("aria-label", `Explore ${file.path}`);
    button.addEventListener("click", () => explore(file.canonicalId));
    item.append(button);
    list.append(item);
  });
  disclosure.append(summary, list);
  element.append(disclosure);
}

export { renderBoundaryConnections, appendDirectoryConnections, appendFiles };
