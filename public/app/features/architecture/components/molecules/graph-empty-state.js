function renderPrompt(element, message, title = "Project structure") {
  const heading = document.createElement("h3");
  heading.textContent = title;
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  element.replaceChildren(heading, paragraph);
}

function emptyState(message) {
  const node = document.createElement("div");
  node.className = "empty-state architecture-empty";
  node.textContent = message;
  return node;
}

export { renderPrompt, emptyState };
