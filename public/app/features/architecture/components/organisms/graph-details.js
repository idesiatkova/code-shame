import { renderDetails, appendNote } from "../molecules/detail-content.js";

function renderFileDetails(element, data, graph, model, analysis, impactResult) {
  const metrics = data.metrics || {};
  const id = data.canonicalId;
  const outgoing = analysis ? analysis.outgoing.get(id).length : "Unavailable";
  const incoming = analysis ? analysis.incoming.get(id).length : "Unavailable";
  const qualifier = analysis && !analysis.data.graph.complete ? " (at least)" : "";
  renderDetails(element, data.label, data.path, [
    ["Layer", fileLayerLabel(data, graph, model, analysis)],
    ["Entry point", data.entryPoint ? "Yes" : "No"],
    [`Imports${qualifier}`, outgoing],
    [`Imported by${qualifier}`, incoming],
    ...(impactResult
      ? [
          [`Direct consumers${qualifier}`, impactResult.direct],
          [
            analysis.data.graph.complete
              ? "Other reachable consumers"
              : "Other reachable consumers (observed)",
            impactResult.transitive,
          ],
        ]
      : []),
    ...fileMetricRows(metrics),
  ]);
  appendNote(
    element,
    impactResult
      ? "Direct consumers import this file; other reachable consumers reach it through imports. Shown / total counts cover this impact subgraph. Fallow metrics come from a separate source."
      : "Import counts cover the project graph; Fallow metrics come from a separate source.",
  );
  if (impactResult && !analysis.data.graph.complete) {
    const note = document.createElement("p");
    note.textContent = "Partial graph: missing dependencies may change these results.";
    element.append(note);
  }
}

function fileMetricRows(metrics) {
  return [
    ["Fallow fan-in", metrics.fanIn ?? "Unavailable"],
    ["Fallow fan-out", metrics.fanOut ?? "Unavailable"],
    ["Lines", metrics.lines ?? "Unavailable"],
    [
      "Maintainability",
      metrics.maintainability == null ? "Unavailable" : Number(metrics.maintainability).toFixed(1),
    ],
  ];
}

function fileLayerLabel(data, graph, model, analysis) {
  return (
    analysis?.data.layers.get(data.layerId)?.label ||
    (model.nodes || []).find((node) => node.type === "layer" && node.layerId === data.layerId)
      ?.label ||
    layerLabel(graph, data.parent)
  );
}

function layerLabel(graph, parentId) {
  const parent = graph.getElementById(parentId);
  return parent.empty() ? "Other" : parent.data("label");
}

export { renderFileDetails };
