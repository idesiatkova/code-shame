function renderBoundaryConnections(element, projection, navigate) {
  if (!projection.boundary.length) return;
  const list = document.createElement("div");
  list.className = "architecture-boundary-connections";
  const heading = document.createElement("h3");
  heading.textContent = `Cross-page connections (${projection.boundary.length})`;
  list.append(heading);
  for (const edge of projection.boundary) {
    const row = document.createElement("p");
    row.dataset.edgeId = edge.id;
    const description = document.createElement("span");
    description.textContent = `${edge.sourceNode.path} → ${edge.targetNode.path} · ${edge.weight} file ${edge.weight === 1 ? "import" : "imports"} · `;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = `Show ${edge.destination.node.path} on page ${edge.destination.page + 1}`;
    button.addEventListener("click", () => navigate(edge.destination.page, edge.id));
    row.append(description, button);
    list.append(row);
  }
  element.append(list);
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

export { renderBoundaryConnections, appendFiles };
