import { readDesignTokens, presentStyles } from "../../../shared/design/tokens.js";

const NODE_WIDTH = 142;
const NODE_HEIGHT = 48;
const GROUP_PADDING_X = 28;

function createGraphOptions(container, model, tokens = readDesignTokens()) {
  return {
    autoungrabify: true,
    boxSelectionEnabled: false,
    container,
    elements: toCytoscapeElements(model),
    layout: {
      name: "dagre",
      rankDir: container?.clientWidth && container.clientWidth < 900 ? "TB" : "LR",
      nodeSep: 45,
      rankSep: 100,
      edgeSep: 24,
      nodeDimensionsIncludeLabels: true,
      useDagreEdgeControlPoints: true,
      automaticDagreEdgeStyle: true,
      fit: true,
      padding: 36,
    },
    maxZoom: 2.4,
    minZoom: 0.05,
    style: graphStyle(tokens),
    userPanningEnabled: true,
  };
}

function toCytoscapeElements(model, positions = new Map()) {
  const nodes = (model.nodes || []).map((node) => ({
    data: node,
    classes: node.entryPoint ? "entry-point" : "",
    position: positions.get(node.id),
  }));
  const edges = (model.edges || []).map((edge) => ({
    data: edge,
    classes: edge.crossLayer ? "cross-layer" : "",
  }));
  return [...nodes, ...edges];
}

function graphStyle(tokens) {
  return presentStyles([
    {
      selector: "node",
      style: {
        "font-family": tokens["font-sans"],
        "text-events": "yes",
      },
    },
    {
      selector: 'node[type = "layer"]',
      style: {
        shape: "round-rectangle",
        "background-opacity": 0.08,
        "border-opacity": 0.58,
        "border-width": 1,
        label: "data(label)",
        padding: `${GROUP_PADDING_X}px`,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        "font-size": tokens["text-normal"],
        "font-weight": tokens["weight-bold"],
        "text-halign": "center",
        "text-valign": "top",
        "text-margin-y": -18,
      },
    },
    {
      selector: 'node[type = "layer"][color]',
      style: {
        "background-color": "data(color)",
        "border-color": "data(color)",
        color: "data(color)",
      },
    },
    {
      selector: 'node[type = "overview-layer"]',
      style: {
        shape: "round-rectangle",
        width: 185,
        height: 62,
        "background-opacity": 0.16,
        "border-width": 1,
        color: tokens.ink,
        label: "data(displayLabel)",
        "font-size": tokens["text-small"],
        "font-weight": tokens["weight-bold"],
        "text-halign": "center",
        "text-valign": "center",
        "text-wrap": "wrap",
        "text-max-width": 165,
      },
    },
    {
      selector: 'node[type = "overview-layer"][color]',
      style: { "background-color": "data(color)", "border-color": "data(color)" },
    },
    {
      selector: 'node[type = "directory"]',
      style: {
        shape: "round-rectangle",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        "background-color": tokens["graph-directory-surface"],
        "border-color": tokens["graph-directory-border"],
        "border-width": 2,
        color: tokens.ink,
        label: "data(label)",
        "font-size": tokens["text-small"],
        "text-halign": "center",
        "text-valign": "center",
        "text-wrap": "ellipsis",
        "text-max-width": NODE_WIDTH - 18,
      },
    },
    {
      selector: 'node[type = "file"]',
      style: {
        shape: "round-rectangle",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        "background-color": tokens["control-surface"],
        "border-opacity": 0.62,
        "border-width": 1,
        color: tokens.ink,
        label: "data(label)",
        "font-size": tokens["text-2xs"],
        "font-weight": tokens["weight-600"],
        "text-max-width": NODE_WIDTH - 18,
        "text-halign": "center",
        "text-valign": "center",
        "text-wrap": "wrap",
        "text-overflow-wrap": "anywhere",
      },
    },
    { selector: 'node[type = "file"][color]', style: { "border-color": "data(color)" } },
    {
      selector: "node.entry-point",
      style: {
        "border-width": 3,
        "background-color": tokens["graph-entry-surface"],
      },
    },
    {
      selector: 'node[type = "summary"]',
      style: {
        shape: "round-rectangle",
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        "background-opacity": 0,
        "border-style": "dashed",
        "border-width": 1,
        color: tokens.muted,
        label: "data(label)",
        "font-size": tokens["text-2xs"],
      },
    },
    { selector: 'node[type = "summary"][color]', style: { "border-color": "data(color)" } },
    {
      selector: "edge",
      style: {
        width: "mapData(weight, 1, 5, 1, 4)",
        label: "",
        "font-size": tokens["text-2xs"],
        color: tokens.ink,
        "text-background-color": tokens["control-surface"],
        "text-background-opacity": 1,
        "curve-style": "bezier",
        "line-color": tokens["graph-edge"],
        "line-opacity": 0.85,
        "target-arrow-color": tokens["graph-edge"],
        "target-arrow-shape": "triangle",
        "arrow-scale": 1.2,
      },
    },
    { selector: "edge[weight > 1]", style: { label: "data(weight)" } },
    {
      selector: "edge.cross-layer",
      style: {
        "line-color": tokens.coupling,
        "line-opacity": 0.95,
        "target-arrow-color": tokens.coupling,
      },
    },
    {
      selector: ".is-muted",
      style: { opacity: 0.12 },
    },
    {
      selector: ".is-active",
      style: {
        opacity: 1,
        "line-opacity": 0.96,
        "z-index": 999,
      },
    },
    {
      selector: "node.is-selected",
      style: {
        "border-width": 3,
        "overlay-opacity": 0.12,
        "overlay-padding": 7,
      },
    },
    { selector: "node.is-selected[color]", style: { "overlay-color": "data(color)" } },
    {
      selector: 'node[type = "directory"].is-selected',
      style: { "overlay-color": tokens["graph-directory-border"] },
    },
  ]);
}

export { createGraphOptions };
