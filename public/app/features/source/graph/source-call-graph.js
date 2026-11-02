import { element, button } from "../source-dom.js";

export function renderCallGraph(
  detail,
  graphData,
  graphError,
  file,
  selected,
  location,
  navigate,
  graphRuntime,
) {
  function renderGraphLists(section, nodes, localEdges, rootKey, key) {
    for (const [label, relevant, endpoint] of [
      ["Incoming", localEdges.filter((e) => key(e.target) === rootKey), "source"],
      ["Outgoing", localEdges.filter((e) => key(e.source) === rootKey), "target"],
    ]) {
      const group = element("div", "function-graph-list");
      group.append(element("h4", "", label));
      if (!relevant.length)
        group.append(
          element(
            "p",
            "source-explorer-status",
            "No resolved calls found in this scan; this does not establish that none exist.",
          ),
        );
      for (const edge of relevant) {
        const target = nodes.find((node) => key(node) === key(edge[endpoint]));
        const owner = nodes.find((node) => key(node) === key(edge.source));
        if (target && owner?.hash && owner.file === edge.file) {
          const row = element("div", "function-graph-edge");
          const siteButton = button(
            `${target.name} · ${target.file} · call at ${edge.file}:${edge.line}:${edge.column}`,
            () => navigate(owner, { line: edge.line, column: edge.column }),
          );
          if (
            location &&
            edge.file === file &&
            edge.line === location.line &&
            edge.column === location.column
          )
            siteButton.setAttribute("aria-current", "location");
          const declaration = button("Go to declaration", () => navigate(target));
          declaration.setAttribute(
            "aria-label",
            `Go to declaration of ${target.name} in ${target.file}`,
          );
          siteButton.dataset.navigationFocus = `edge:${label}:${edge.file}:${edge.line}:${edge.column}`;
          declaration.dataset.navigationFocus = `${siteButton.dataset.navigationFocus}:declaration`;
          row.append(siteButton, declaration);
          group.append(row);
        }
      }
      section.append(group);
    }
  }
  function renderSelectedCall(section, nodes, localEdges, key) {
    const chosen = localEdges.find(
      (edge) =>
        location &&
        edge.file === file &&
        edge.line === location.line &&
        edge.column === location.column,
    );
    if (chosen) {
      const caller = nodes.find((node) => key(node) === key(chosen.source));
      const callee = nodes.find((node) => key(node) === key(chosen.target));
      if (caller && callee)
        section.append(
          element(
            "p",
            "source-explorer-status",
            `Selected resolved call: ${caller.name} (${caller.file}) → ${callee.name} (${callee.file}) · ${chosen.file}:${chosen.line}:${chosen.column}`,
          ),
        );
    }
  }
  function graphCoverage(coverage, diagnostics) {
    const count = Array.isArray(coverage?.files) ? coverage.files.length : (coverage?.files ?? 0);
    const note = `Partial call coverage: ${count} files scanned${coverage?.truncated ? ` (limit ${coverage.limit})` : ""}; incoming calls cover this file and bounded transitive importers. Function-owned calls only; module-level calls omitted. Dynamic calls may be unresolved.`;
    return [
      note,
      ...diagnostics.map((d) =>
        typeof d === "string" ? d : [d.file, d.message].filter(Boolean).join(": "),
      ),
    ]
      .filter(Boolean)
      .join(" · ");
  }
  function renderGraph(detail) {
    const section = element("section", "function-graph");
    section.append(element("h4", "", "Function calls"));
    detail.append(section);
    if (graphError) {
      section.append(element("p", "source-explorer-status", graphError));
      return;
    }
    if (!graphData) {
      section.append(element("p", "source-explorer-status", "Loading function calls…"));
      return;
    }
    const { nodes = [], edges = [], coverage, diagnostics = [] } = graphData;
    section.append(element("p", "source-explorer-status", graphCoverage(coverage, diagnostics)));
    const canvas = element("div", "function-graph-canvas");
    canvas.setAttribute("aria-hidden", "true");
    const controls = element("div", "function-graph-controls");
    controls.append(
      button("Fit", () => graphRuntime.fit()),
      ...[
        ["Zoom in", 1.25],
        ["Zoom out", 0.8],
      ].map(([label, factor]) => button(label, () => graphRuntime.zoom(canvas, factor))),
    );
    section.append(controls, canvas);
    const key = (node) => JSON.stringify([node.file, node.id]);
    const rootKey = key({ file, id: selected.id });
    const localEdges = edges.filter(
      (edge) => key(edge.source) === rootKey || key(edge.target) === rootKey,
    );
    const localKeys = new Set([
      rootKey,
      ...localEdges.flatMap((edge) => [key(edge.source), key(edge.target)]),
    ]);
    const localNodes = nodes.filter((node) => localKeys.has(key(node)));
    renderSelectedCall(section, nodes, localEdges, key);
    graphRuntime.mount(canvas, nodes, localNodes, localEdges, rootKey, key, file, location);
    renderGraphLists(section, nodes, localEdges, rootKey, key);
  }
  renderGraph(detail);
}
