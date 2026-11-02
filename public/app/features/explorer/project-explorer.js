// A tree owns focus separately from selection so collapsing folders never navigates.
export function createProjectExplorer({ container, onSelect, onExpansionChange = () => {} }) {
  const expanded = new Set(["."]);
  let root,
    nodes = new Map(),
    selectedPath = ".",
    selectedKind = "project",
    focusPath = ".";
  const tree = document.createElement("div");
  tree.className = "project-tree";
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", "Project files");
  container.replaceChildren(tree);

  function build(files, projectName) {
    root = { path: ".", name: projectName || "Project", kind: "project", children: new Map() };
    nodes = new Map([[".", root]]);
    for (const path of files) {
      const parts = path.split("/");
      let parent = root,
        prefix = "";
      parts.forEach((name, index) => {
        prefix = prefix ? `${prefix}/${name}` : name;
        if (!parent.children.has(name)) {
          const node = {
            path: prefix,
            name,
            kind: index === parts.length - 1 ? "file" : "directory",
            parent,
            children: new Map(),
          };
          parent.children.set(name, node);
          nodes.set(prefix, node);
        }
        parent = parent.children.get(name);
      });
    }
  }

  function visibleAncestor(path) {
    let node = nodes.get(path) || root;
    while (node.parent) {
      let ancestor = node.parent;
      while (ancestor && expanded.has(ancestor.path)) ancestor = ancestor.parent;
      if (!ancestor) break;
      node = ancestor;
    }
    return node.path;
  }

  function icon(kind, open) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("project-tree-icon");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
    shape.setAttribute(
      "d",
      kind === "file"
        ? "M4 1.75h5l3 3v9.5H4z M9 1.75v3h3"
        : open
          ? "M2 5V3.25h4l1.3 1.5H14v1 M2 6h12l-1.2 7H2z"
          : "M2 3.25h4l1.3 1.5H14v8H2z",
    );
    svg.append(shape);
    return svg;
  }

  function render(restoreFocus = false) {
    const scrollTop = tree.scrollTop;
    focusPath = visibleAncestor(focusPath);
    const items = new Map();
    function branch(node, level) {
      const item = document.createElement("div");
      item.className = "project-tree-item";
      item.setAttribute("role", "treeitem");
      item.setAttribute("aria-level", String(level));
      item.setAttribute("aria-label", node.name);
      item.setAttribute(
        "aria-selected",
        String(node.path === selectedPath && node.kind === selectedKind),
      );
      item.tabIndex = node.path === focusPath ? 0 : -1;
      item.dataset.path = node.path;
      if (node.kind !== "file") item.setAttribute("aria-expanded", String(expanded.has(node.path)));
      const row = document.createElement("div");
      row.className = "project-tree-row";
      row.style.setProperty("--tree-level", level - 1);
      if (node.kind !== "file") {
        const chevron = document.createElement("span");
        chevron.className = "project-tree-chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.textContent = expanded.has(node.path) ? "▾" : "▸";
        row.append(chevron);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "project-tree-chevron";
        spacer.setAttribute("aria-hidden", "true");
        row.append(spacer);
      }
      const label = document.createElement("span");
      label.className = "project-tree-label";
      label.textContent = node.name;
      row.append(icon(node.kind, expanded.has(node.path)), label);
      item.append(row);
      items.set(node.path, item);
      if (node.kind !== "file" && expanded.has(node.path)) {
        const group = document.createElement("div");
        group.setAttribute("role", "group");
        const children = [...node.children.values()].sort(
          (a, b) => (a.kind === "file") - (b.kind === "file") || a.name.localeCompare(b.name),
        );
        for (const child of children) group.append(branch(child, level + 1));
        item.append(group);
      }
      return item;
    }
    tree.replaceChildren(branch(root, 1));
    tree.scrollTop = scrollTop;
    if (restoreFocus) items.get(focusPath)?.focus({ preventScroll: true });
    const folders = [...nodes.values()].filter((node) => node.parent && node.kind !== "file");
    onExpansionChange(
      folders.some((node) => expanded.has(node.path)),
      folders.length > 0,
    );
    return items;
  }

  function select(node) {
    selectedPath = node.path;
    selectedKind = node.kind;
    render(true);
    onSelect({ path: node.path, kind: node.kind });
  }

  function toggle(node) {
    if (expanded.has(node.path)) expanded.delete(node.path);
    else expanded.add(node.path);
    focusPath = node.path;
    render(true);
  }

  tree.addEventListener("focusin", (event) => {
    const item = event.target.closest('[role="treeitem"]');
    if (!item || !tree.contains(item)) return;
    focusPath = item.dataset.path;
    tree.querySelectorAll('[role="treeitem"]').forEach((row) => {
      row.tabIndex = row === item ? 0 : -1;
    });
  });

  tree.addEventListener("click", (event) => {
    const row = event.target.closest(".project-tree-row");
    if (!row || !tree.contains(row)) return;
    const node = nodes.get(row.parentElement.dataset.path);
    focusPath = node.path;
    if (event.target.closest(".project-tree-chevron") && node.kind !== "file") {
      toggle(node);
      return;
    }
    if (node.kind !== "file" && node.path === selectedPath && node.kind === selectedKind) {
      if (expanded.has(node.path)) expanded.delete(node.path);
      else expanded.add(node.path);
    }
    select(node);
  });

  function arrowTarget(key, node, item) {
    if (key === "ArrowRight") {
      if (node.kind !== "file" && !expanded.has(node.path)) toggle(node);
      else if (node.kind !== "file") return item.querySelector('[role="treeitem"]');
    } else if (node.kind !== "file" && expanded.has(node.path)) toggle(node);
    else if (node.parent)
      return [...tree.querySelectorAll('[role="treeitem"]')].find(
        (row) => row.dataset.path === node.parent.path,
      );
  }
  tree.addEventListener("keydown", (event) => {
    const item = event.target.closest('[role="treeitem"]');
    if (!item || event.target !== item) return;
    const node = nodes.get(item.dataset.path);
    const visible = [...tree.querySelectorAll('[role="treeitem"]')];
    const index = visible.indexOf(item);
    let target;
    switch (event.key) {
      case "ArrowDown":
        target = visible[Math.min(index + 1, visible.length - 1)];
        break;
      case "ArrowUp":
        target = visible[Math.max(index - 1, 0)];
        break;
      case "Home":
        target = visible[0];
        break;
      case "End":
        target = visible[visible.length - 1];
        break;
      case "ArrowRight":
      case "ArrowLeft":
        target = arrowTarget(event.key, node, item);
        break;
      case "Enter":
      case " ":
        select(node);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (target) target.focus({ preventScroll: true });
    if (tree.contains(document.activeElement))
      document.activeElement
        .querySelector(".project-tree-row")
        ?.scrollIntoView?.({ block: "nearest" });
  });

  return {
    update({ files, projectName, selectedPath: path = ".", selectedKind: kind = "project" }) {
      const hadFocus = tree.contains(document.activeElement);
      selectedPath = path;
      selectedKind = kind;
      build(files, projectName);
      if (!hadFocus && nodes.has(path)) focusPath = path;
      render(hadFocus);
    },
    reveal(path, { expand = false, focus = true, scroll = focus } = {}) {
      const node = nodes.get(path);
      if (!node) return;
      const hadFocus = tree.contains(document.activeElement);
      for (let parent = node.parent; parent; parent = parent.parent) expanded.add(parent.path);
      if (expand && node.kind !== "file") expanded.add(node.path);
      if (focus) focusPath = path;
      const items = render(focus || hadFocus);
      if (scroll)
        items.get(path)?.querySelector(".project-tree-row")?.scrollIntoView?.({ block: "nearest" });
    },
    toggleAll() {
      if (!root) return;
      const hadFocus = tree.contains(document.activeElement);
      const canCollapse = [...nodes.values()].some(
        (node) => node.parent && node.kind !== "file" && expanded.has(node.path),
      );
      expanded.clear();
      expanded.add(".");
      if (!canCollapse)
        for (const node of nodes.values()) if (node.kind !== "file") expanded.add(node.path);
      render(hadFocus);
    },
    clear() {
      expanded.clear();
      expanded.add(".");
      nodes.clear();
      root = undefined;
      focusPath = selectedPath = ".";
      selectedKind = "project";
      tree.replaceChildren();
      onExpansionChange(false, false);
    },
  };
}
