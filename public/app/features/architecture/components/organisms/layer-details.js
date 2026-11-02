import { renderDetails } from "../molecules/detail-content.js";

function renderOverviewLayerDetails(element, node) {
  const edges = node.connectedEdges().map((edge) => edge.data());
  const id = node.id();
  const sum = (predicate) =>
    edges.filter(predicate).reduce((total, edge) => total + edge.weight, 0);
  renderDetails(element, node.data("label"), "File dependencies", [
    ["Files", node.data("fileCount")],
    ["Outbound to other layers", sum((edge) => edge.source === id && edge.target !== id)],
    ["Inbound from other layers", sum((edge) => edge.target === id && edge.source !== id)],
    ["Within layer", node.data("withinLayer") || 0],
  ]);
}

function renderLayerDetails(element, data, descendants) {
  renderDetails(
    element,
    data.label,
    data.source === "fallow-boundary" ? "Configured Fallow boundary" : "Automatically classified",
    [
      ["Files", data.fileCount],
      ["Shown in map", descendants.filter('[type = "file"]').length],
    ],
  );
}

export { renderOverviewLayerDetails, renderLayerDetails };
