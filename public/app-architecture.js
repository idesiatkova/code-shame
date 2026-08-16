{
  const NODE_WIDTH = 142;
  const NODE_HEIGHT = 48;
  const CHILD_GAP_X = 18;
  const CHILD_GAP_Y = 26;
  const GROUP_GAP = 48;
  const GROUP_PADDING_X = 28;
  const GROUP_PADDING_Y = 78;

  function createRenderer({ container, details, fitButton, legend, stats }) {
    let graph = null;

    fitButton.addEventListener("click", () => {
      if (graph) graph.fit(graph.elements(), 36);
    });

    function clear(message = "No project structure yet.") {
      destroyGraph();
      container.replaceChildren(emptyState(message));
      legend.replaceChildren();
      stats.textContent = "";
      renderPrompt(details, "Select a file to inspect its role and Fallow metrics.");
    }

    function render(model) {
      destroyGraph();
      if (!model || model.state === "failed") {
        clear(model && model.error ? `Project structure unavailable: ${model.error}` : undefined);
        return;
      }

      const nodes = Array.isArray(model.nodes) ? model.nodes : [];
      if (nodes.filter((node) => node.type === "file").length === 0) {
        clear("No project files were discovered for the architecture map.");
        return;
      }
      if (typeof window.cytoscape !== "function") {
        clear("Cytoscape.js could not be loaded.");
        return;
      }

      container.replaceChildren();
      const positions = calculatePositions(nodes, container.clientWidth || 960);
      graph = window.cytoscape(createGraphOptions(container, model, positions));

      bindGraphInteractions(graph, details);
      renderLegend(legend, graph, nodes);
      renderStats(stats, model);
      renderPrompt(details, "Select a file to inspect its role and Fallow metrics.");
    }

    function destroyGraph() {
      if (graph) graph.destroy();
      graph = null;
    }

    return { clear, render };
  }

  function createGraphOptions(container, model, positions) {
    return {
      autoungrabify: true,
      boxSelectionEnabled: false,
      container,
      elements: toCytoscapeElements(model, positions),
      layout: { name: "preset", fit: true, padding: 36 },
      maxZoom: 2.4,
      minZoom: 0.25,
      style: graphStyle(),
      textureOnViewport: true,
      userPanningEnabled: false
    };
  }

  function toCytoscapeElements(model, positions = new Map()) {
    const nodes = (model.nodes || []).map((node) => ({
      data: node,
      classes: node.entryPoint ? "entry-point" : "",
      position: positions.get(node.id)
    }));
    const edges = (model.edges || []).map((edge) => ({
      data: edge,
      classes: edge.crossLayer ? "cross-layer" : ""
    }));
    return [...nodes, ...edges];
  }

  function calculatePositions(nodes, containerWidth) {
    const layers = nodes.filter((node) => node.type === "layer");
    const childrenByParent = new Map();
    nodes.filter((node) => node.type !== "layer").forEach((node) => {
      const siblings = childrenByParent.get(node.parent);
      if (siblings) siblings.push(node);
      else childrenByParent.set(node.parent, [node]);
    });
    const columns = containerWidth >= 960 ? 3 : containerWidth >= 640 ? 2 : 1;
    const availableWidth = Math.max(320, containerWidth - GROUP_GAP * (columns + 1));
    const targetGroupWidth = Math.floor(availableWidth / columns);
    const childColumns = columns > 1 ? 2 : 1;
    const contentWidth = childColumns * NODE_WIDTH + (childColumns - 1) * CHILD_GAP_X;
    const groupWidth = Math.max(300, targetGroupWidth, contentWidth + GROUP_PADDING_X * 2);
    const positions = new Map();
    let rowTop = GROUP_GAP;

    for (let rowStart = 0; rowStart < layers.length; rowStart += columns) {
      const rowLayers = layers.slice(rowStart, rowStart + columns);
      const rowHeight = Math.max(...rowLayers.map((layerNode) => {
        const childCount = (childrenByParent.get(layerNode.id) || []).length;
        return groupHeight(childCount, childColumns);
      }));

      rowLayers.forEach((layerNode, columnIndex) => {
        const children = childrenByParent.get(layerNode.id) || [];
        const centerX = GROUP_GAP + columnIndex * (groupWidth + GROUP_GAP) + groupWidth / 2;
        const left = centerX - contentWidth / 2 + NODE_WIDTH / 2;
        const top = rowTop + GROUP_PADDING_Y;

        children.forEach((child, childIndex) => {
          positions.set(child.id, {
            x: left + (childIndex % childColumns) * (NODE_WIDTH + CHILD_GAP_X),
            y: top + Math.floor(childIndex / childColumns) * (NODE_HEIGHT + CHILD_GAP_Y)
          });
        });
      });

      rowTop += rowHeight + GROUP_GAP;
    }

    return positions;
  }

  function groupHeight(childCount, childColumns) {
    const rows = Math.max(1, Math.ceil(childCount / childColumns));
    return GROUP_PADDING_Y + rows * NODE_HEIGHT + Math.max(0, rows - 1) * CHILD_GAP_Y + GROUP_PADDING_Y / 2;
  }

  function graphStyle() {
    return [
      {
        selector: "node",
        style: {
          "font-family": "Inter, ui-sans-serif, system-ui, sans-serif",
          "text-events": "yes"
        }
      },
      {
        selector: 'node[type = "layer"]',
        style: {
          shape: "round-rectangle",
          "background-color": "data(color)",
          "background-opacity": 0.08,
          "border-color": "data(color)",
          "border-opacity": 0.58,
          "border-width": 1,
          color: "data(color)",
          label: "data(label)",
          padding: `${GROUP_PADDING_X}px`,
          "font-size": 13,
          "font-weight": 700,
          "text-halign": "center",
          "text-valign": "top",
          "text-margin-y": -18
        }
      },
      {
        selector: 'node[type = "file"]',
        style: {
          shape: "round-rectangle",
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          "background-color": "#202522",
          "border-color": "data(color)",
          "border-opacity": 0.62,
          "border-width": 1,
          color: "#f5f1e8",
          label: "data(label)",
          "font-size": 10,
          "font-weight": 600,
          "text-max-width": NODE_WIDTH - 18,
          "text-halign": "center",
          "text-valign": "center",
          "text-wrap": "ellipsis"
        }
      },
      {
        selector: "node.entry-point",
        style: {
          "border-width": 3,
          "background-color": "#273029"
        }
      },
      {
        selector: 'node[type = "summary"]',
        style: {
          shape: "round-rectangle",
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          "background-opacity": 0,
          "border-color": "data(color)",
          "border-style": "dashed",
          "border-width": 1,
          color: "#aaa59a",
          label: "data(label)",
          "font-size": 10
        }
      },
      {
        selector: "edge",
        style: {
          width: "mapData(weight, 1, 5, 1, 4)",
          "curve-style": "bezier",
          "line-color": "#59625d",
          "line-opacity": 0.48,
          "target-arrow-color": "#59625d",
          "target-arrow-shape": "triangle",
          "arrow-scale": 0.72
        }
      },
      {
        selector: "edge.cross-layer",
        style: {
          "line-color": "#b47cff",
          "line-opacity": 0.72,
          "target-arrow-color": "#b47cff"
        }
      },
      {
        selector: ".is-muted",
        style: { opacity: 0.12 }
      },
      {
        selector: ".is-active",
        style: {
          opacity: 1,
          "line-opacity": 0.96,
          "z-index": 999
        }
      },
      {
        selector: "node.is-selected",
        style: {
          "border-width": 3,
          "overlay-color": "data(color)",
          "overlay-opacity": 0.12,
          "overlay-padding": 7
        }
      }
    ];
  }

  function bindGraphInteractions(graph, details) {
    graph.on("tap", 'node[type = "file"]', (event) => {
      const node = event.target;
      focusCollection(graph, node.closedNeighborhood(), node);
      renderFileDetails(details, node.data(), graph);
    });
    graph.on("tap", 'node[type = "layer"]', (event) => {
      const node = event.target;
      const collection = node.add(node.descendants()).add(node.descendants().connectedEdges());
      focusCollection(graph, collection, node);
      renderLayerDetails(details, node.data(), node.descendants());
    });
    graph.on("tap", (event) => {
      if (event.target !== graph) return;
      resetFocus(graph);
      renderPrompt(details, "Select a file to inspect its role and Fallow metrics.");
    });
  }

  function focusCollection(graph, collection, selectedNode) {
    graph.elements().addClass("is-muted").removeClass("is-active is-selected");
    collection.removeClass("is-muted").addClass("is-active");
    selectedNode.addClass("is-selected");
  }

  function resetFocus(graph) {
    graph.elements().removeClass("is-muted is-active is-selected");
  }

  function renderLegend(element, graph, nodes) {
    const layers = nodes.filter((node) => node.type === "layer");
    element.replaceChildren(...layers.map((layerNode) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "architecture-legend-item";
      button.style.setProperty("--layer-color", layerNode.color);
      button.textContent = `${layerNode.label} · ${formatNumber(layerNode.fileCount)}`;
      button.addEventListener("click", () => {
        const node = graph.getElementById(layerNode.id);
        const collection = node.add(node.descendants()).add(node.descendants().connectedEdges());
        focusCollection(graph, collection, node);
        graph.fit(node.add(node.descendants()), 44);
      });
      return button;
    }));
  }

  function renderStats(element, model) {
    const parts = [
      `${formatNumber(model.totalFileCount)} files`,
      `${formatNumber(model.layerCount)} layers`,
      `${formatNumber((model.edges || []).length)} imports`,
      `${formatNumber(model.crossLayerEdgeCount)} cross-layer`
    ];
    if (model.truncated) parts.push(`${formatNumber(model.visibleFileCount)} shown`);
    if (model.inspectionErrorCount) parts.push(`${formatNumber(model.inspectionErrorCount)} traces unavailable`);
    element.textContent = parts.join(" · ");
  }

  function renderFileDetails(element, data, graph) {
    const metrics = data.metrics || {};
    const outgoing = graph.getElementById(data.id).outgoers("edge").length;
    const incoming = graph.getElementById(data.id).incomers("edge").length;
    renderDetails(element, data.label, data.path, [
      ["Layer", layerLabel(graph, data.parent)],
      ["Entry point", data.entryPoint ? "Yes" : "No"],
      ["Imports", outgoing],
      ["Imported by", incoming],
      ["Fallow fan-in", metrics.fanIn || 0],
      ["Fallow fan-out", metrics.fanOut || 0],
      ["Lines", metrics.lines || 0],
      ["Maintainability", Number(metrics.maintainability || 0).toFixed(1)]
    ]);
  }

  function renderLayerDetails(element, data, descendants) {
    renderDetails(element, data.label, data.source === "fallow-boundary" ? "Configured Fallow boundary" : "Automatically classified", [
      ["Files", data.fileCount],
      ["Shown", descendants.filter('[type = "file"]').length],
      ["Hidden", data.hiddenFileCount || 0]
    ]);
  }

  function renderDetails(element, title, subtitle, rows) {
    const heading = document.createElement("h3");
    heading.textContent = title;
    const description = document.createElement("p");
    description.className = "architecture-detail-path";
    description.textContent = subtitle;
    const list = document.createElement("dl");
    rows.forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      detail.textContent = String(value);
      list.append(term, detail);
    });
    element.replaceChildren(heading, description, list);
  }

  function renderPrompt(element, message) {
    const heading = document.createElement("h3");
    heading.textContent = "Project structure";
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    element.replaceChildren(heading, paragraph);
  }

  function layerLabel(graph, parentId) {
    const parent = graph.getElementById(parentId);
    return parent.empty() ? "Other" : parent.data("label");
  }

  function emptyState(message) {
    const node = document.createElement("div");
    node.className = "empty-state architecture-empty";
    node.textContent = message;
    return node;
  }

  function createDemoModel() {
    const layers = [
      demoLayer("styles", "Styles / Design System", "#5fb57d", 2),
      demoLayer("state", "State / Zustand", "#b47cff", 2),
      demoLayer("ui", "UI / Components", "#5aa7ff", 3),
      demoLayer("api", "API / Data", "#e0a84f", 2),
      demoLayer("domain", "Domain / Features", "#df6d63", 2),
      demoLayer("tests", "Tests", "#58c6c8", 2)
    ];
    const files = [
      demoFile("styles", "tokens.css"), demoFile("styles", "theme.css"),
      demoFile("state", "session-store.ts"), demoFile("state", "cart-store.ts"),
      demoFile("ui", "AppShell.tsx", true), demoFile("ui", "ProductCard.tsx"), demoFile("ui", "Checkout.tsx"),
      demoFile("api", "products-api.ts"), demoFile("api", "checkout-api.ts"),
      demoFile("domain", "product.ts"), demoFile("domain", "checkout.ts"),
      demoFile("tests", "checkout.test.ts"), demoFile("tests", "store.test.ts")
    ];
    const edges = [
      demoEdge("ui/AppShell.tsx", "state/session-store.ts"),
      demoEdge("ui/ProductCard.tsx", "domain/product.ts"),
      demoEdge("ui/Checkout.tsx", "state/cart-store.ts"),
      demoEdge("ui/Checkout.tsx", "domain/checkout.ts"),
      demoEdge("domain/product.ts", "api/products-api.ts"),
      demoEdge("domain/checkout.ts", "api/checkout-api.ts"),
      demoEdge("tests/checkout.test.ts", "domain/checkout.ts"),
      demoEdge("tests/store.test.ts", "state/cart-store.ts")
    ];
    return {
      state: "ready",
      source: "demo",
      totalFileCount: files.length,
      visibleFileCount: files.length,
      layerCount: layers.length,
      crossLayerEdgeCount: edges.length,
      truncated: false,
      inspectionErrorCount: 0,
      nodes: [...layers, ...files],
      edges
    };
  }

  function demoLayer(id, label, color, fileCount) {
    return { id: `layer:${id}`, type: "layer", layerId: id, label, color, fileCount, hiddenFileCount: 0, source: "demo" };
  }

  function demoFile(layerId, label, entryPoint = false) {
    const filePath = `${layerId}/${label}`;
    return {
      id: `file:${filePath}`,
      type: "file",
      parent: `layer:${layerId}`,
      layerId,
      color: demoColor(layerId),
      label,
      directory: layerId,
      path: filePath,
      entryPoint,
      metrics: { fanIn: entryPoint ? 7 : 2, fanOut: 2, lines: 84, maintainability: 82.4 }
    };
  }

  function demoEdge(source, target) {
    const sourceLayer = source.split("/")[0];
    const targetLayer = target.split("/")[0];
    return {
      id: `imports:${source}->${target}`,
      type: "imports",
      source: `file:${source}`,
      target: `file:${target}`,
      sourceLayer,
      targetLayer,
      crossLayer: sourceLayer !== targetLayer,
      weight: 1
    };
  }

  function demoColor(layerId) {
    return {
      styles: "#5fb57d", state: "#b47cff", ui: "#5aa7ff", api: "#e0a84f", domain: "#df6d63", tests: "#58c6c8"
    }[layerId] || "#8794a8";
  }

  function formatNumber(value) {
    return new Intl.NumberFormat().format(Number(value) || 0);
  }

  window.codeShameArchitecture = {
    calculatePositions,
    createGraphOptions,
    createDemoModel,
    createRenderer,
    toCytoscapeElements
  };
}
