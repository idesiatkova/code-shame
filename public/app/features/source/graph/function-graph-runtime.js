import { functionGraphStyle } from "./function-graph.js";

export function createFunctionGraphRuntime(panel, navigate) {
  let graph,
    graphObserver,
    graphNeedsLayout = false,
    graphAdjusting = false;
  let fitMode = true,
    size;
  function destroy() {
    graphObserver?.disconnect();
    graphObserver = null;
    graph?.destroy();
    graph = null;
  }
  function mount(canvas, nodes, localNodes, localEdges, rootKey, key, file, location) {
    destroy();
    fitMode = true;
    size = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (typeof window !== "undefined" && typeof window.cytoscape === "function") {
      graph = window.cytoscape({
        container: canvas,
        elements: [
          ...localNodes.map((node) => ({
            data: {
              id: key(node),
              label: `${node.name}\n${node.file}${node.startLine ? `:${node.startLine}` : ""}`,
              target: node,
            },
            classes: key(node) === rootKey ? "root" : "",
          })),
          ...localEdges.map((edge, index) => ({
            data: { id: `edge-${index}`, source: key(edge.source), target: key(edge.target) },
            classes:
              location &&
              edge.file === file &&
              edge.line === location.line &&
              edge.column === location.column
                ? "selected-call"
                : "",
          })),
        ],
        layout: { name: "dagre", rankDir: "LR", nodeSep: 18, rankSep: 45, padding: 15 },
        style: functionGraphStyle(),
      });
      graphNeedsLayout = panel.hidden;
      const initialZoom = graph.zoom();
      if (initialZoom < 0.75 || initialZoom > 1.2) {
        graph.zoom(initialZoom < 0.75 ? 0.9 : 1.2);
        graph.center(graph.getElementById(rootKey));
      }
      graph.on("pan zoom", () => {
        if (!graphAdjusting) fitMode = false;
      });
      graphObserver?.disconnect();
      if (typeof ResizeObserver !== "undefined") {
        const observedGraph = graph;
        graphObserver = new ResizeObserver(() => {
          if (
            graph !== observedGraph ||
            panel.hidden ||
            !canvas.clientWidth ||
            !canvas.clientHeight
          )
            return;
          const next = { width: canvas.clientWidth, height: canvas.clientHeight };
          if (size.width === next.width && size.height === next.height) return;
          const pan = graph.pan();
          graphAdjusting = true;
          graph.resize();
          if (fitMode) graph.fit(graph.elements(), 30);
          else if (size.width && size.height)
            graph.pan({
              x: pan.x + (next.width - size.width) / 2,
              y: pan.y + (next.height - size.height) / 2,
            });
          size = next;
          graphAdjusting = false;
        });
        graphObserver.observe(canvas);
      }
      graph.on("tap", "node", (event) => {
        const target = event.target.data("target");
        if (key(target) !== rootKey) navigate(target);
      });
      graph.on("tap", "edge", (event) => {
        const edge = localEdges[Number(event.target.id().slice(5))];
        const owner = edge && nodes.find((node) => key(node) === key(edge.source));
        if (owner?.hash && owner.file === edge.file)
          navigate(owner, { line: edge.line, column: edge.column });
      });
    } else canvas.hidden = true;
  }
  function fit() {
    if (!graph) return;
    fitMode = true;
    graphAdjusting = true;
    graph.resize();
    graph.fit(graph.elements(), 30);
    graphAdjusting = false;
  }
  function zoom(canvas, factor) {
    if (graph)
      graph.zoom({
        level: graph.zoom() * factor,
        renderedPosition: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
      });
  }
  function resize() {
    if (!graph) return;
    graphAdjusting = true;
    graph.resize();
    if (graphNeedsLayout) {
      graph.layout({ name: "dagre", rankDir: "LR", nodeSep: 18, rankSep: 45, padding: 15 }).run();
      graph.fit(graph.elements(), 30);
      graphNeedsLayout = false;
    }
    graphAdjusting = false;
  }
  return { mount, destroy, fit, zoom, resize };
}
