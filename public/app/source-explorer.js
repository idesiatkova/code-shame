import { createSymbolContext } from "./symbol-context.js";

export function createSourceExplorer(panel, fetchSource = fetch, onClose = () => {}, onNavigate = () => {}, isListed = () => true) {
  let request = 0, controller, graphController, data, selected, file, anchor, trigger, query = "", graphData, graphError, graph, graphRequest = 0, graphNeedsLayout = false;
  const history = [];
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const button = (text, action) => {
    const node = element("button", "secondary-button", text);
    node.type = "button"; node.addEventListener("click", action); return node;
  };
  function close(restoreFocus = false) {
    request++; controller?.abort(); controller = null; clearGraph(); data = selected = file = anchor = null; history.length = 0;
    panel.hidden = true; panel.replaceChildren();
    if (restoreFocus) { onClose(); if (trigger?.isConnected) trigger.focus(); }
    trigger = null; query = "";
  }
  function clearGraph() {
    graphRequest++; graphController?.abort(); graphController = null; graph?.destroy(); graph = null; graphData = graphError = null;
  }
  function cancelNavigation() { request++; controller?.abort(); controller = null; }
  function select(symbol) { cancelNavigation(); clearGraph(); selected = symbol; render({ detail: true }); onNavigate(); loadGraph(); }
  async function loadGraph() {
    const sequence = ++graphRequest; graphController = new AbortController();
    try {
      const response = await fetchSource(`/api/function-graph?file=${encodeURIComponent(file)}&symbol=${encodeURIComponent(selected.id)}`, { signal: graphController.signal });
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || `Could not load function graph (${response.status}).`); }
      const result = await response.json();
      if (sequence !== graphRequest) return;
      if (result.root?.hash && data.hash && result.root.hash !== data.hash) throw new Error("The source has changed. Reopen it to refresh the function graph.");
      graphData = result; refreshGraph();
    } catch (error) {
      if (sequence !== graphRequest || error.name === "AbortError") return;
      graphError = error.message || "Could not load function graph."; refreshGraph();
    }
  }
  async function navigate(target) {
    if (!target?.file || !target.id) return;
    if (!isListed(target.file)) { graphError = "The target file is no longer listed in this project."; render(); return; }
    const previous = { file, data, selected, query };
    clearGraph(); request++; controller?.abort(); controller = new AbortController();
    const sequence = request;
    try {
      const response = await fetchSource(`/api/source?file=${encodeURIComponent(target.file)}`, { signal: controller.signal });
      if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(failure.error || `Could not load source (${response.status}).`); }
      const result = await response.json();
      if (sequence !== request) return;
      const symbol = result.symbols.find((item) => item.id === target.id);
      if (!symbol || (target.hash && target.hash !== result.hash) || (target.name && symbol.name !== target.name) || (target.startLine && symbol.startLine !== target.startLine)) throw new Error("The target symbol has changed or is no longer available. Reopen the source to refresh.");
      history.push(previous);
      file = target.file; data = result; query = ""; selected = symbol; panel.setAttribute("aria-label", `Source explorer for ${file}`); render({ detail: true }); onNavigate(); loadGraph();
    } catch (error) {
      if (sequence !== request || error.name === "AbortError") return;
      graphError = error.message || "Could not load target source."; render();
    }
  }
  function back() {
    request++; controller?.abort(); clearGraph();
    ({ file, data, selected, query } = history.pop());
    panel.setAttribute("aria-label", `Source explorer for ${file}`);
    render(selected ? { detail: true } : undefined); onNavigate(); if (selected) loadGraph();
  }
  function render(focusTarget) {
    graph?.destroy(); graph = null;
    const restoreDetailFocus = !focusTarget && document.activeElement?.className === "source-explorer-heading";
    const restorePanelFocus = !focusTarget && document.activeElement !== panel && panel.contains(document.activeElement);
    let inventoryTarget;
    const header = element("div", "source-explorer-header");
    header.append(element("h3", "", file), button("Close source", () => close(true)));
    if (file !== anchor) header.append(element("p", "source-explorer-status", `Architecture file: ${anchor} · Source file: ${file}`));
    const actions = element("div", "source-explorer-actions");
    if (history.length) actions.append(button("Back", back));
    if (selected) actions.append(button("Back to symbols", () => { const id = selected.id; cancelNavigation(); clearGraph(); selected = null; render(id); onNavigate(); }));
    panel.replaceChildren(header, actions);
    if (restorePanelFocus) panel.focus({ preventScroll: true });
    if (!data) return;
    if (data.diagnostics?.length) {
      const status = element("p", "source-explorer-status", data.diagnostics.map((item) => typeof item === "string" ? item : item.message || String(item)).join(" · "));
      panel.append(status);
    }
    panel.append(element("p", "source-explorer-status", "Source is read from the current file on disk and may differ from the report."));
    const symbols = createSymbolContext(data.symbols);
    const workspace = element("div", "source-explorer-workspace");
    const inventory = element("div", "source-explorer-inventory");
    {
      const search = element("input", "source-explorer-search");
      search.type = "search"; search.placeholder = "Search symbols in this file"; search.setAttribute("aria-label", "Search symbols in this file");
      search.value = query;
      const list = element("div", "source-explorer-list");
      const update = () => {
        const matches = data.symbols.filter((symbol) => symbols.describe(symbol).searchText.toLowerCase().includes(search.value.toLowerCase()));
        list.replaceChildren(...matches.map((symbol) => {
          const item = button(`${symbols.describe(symbol).label} · ${symbol.kind} · lines ${symbol.startLine}–${symbol.endLine}`, () => select(symbol));
          item.className = "source-explorer-item"; item.title = item.textContent; item.setAttribute("aria-pressed", String(selected?.id === symbol.id));
          if (focusTarget === symbol.id) inventoryTarget = item;
          return item;
        }));
        if (!matches.length) list.append(element("p", "source-explorer-status", data.symbols.length ? "No matching symbols." : data.diagnostics?.length ? "Symbol inventory unavailable." : "No functions, methods, or classes found."));
      };
      search.addEventListener("input", () => { query = search.value; update(); onNavigate(true); }); inventory.append(search, list); update();
    }
    workspace.append(inventory); panel.append(workspace);
    inventoryTarget?.focus();
    if (!selected) {
      workspace.append(element("p", "source-explorer-status", "Choose a symbol to inspect its source."));
      return;
    }
    const detail = element("div", "source-explorer-detail");
    workspace.append(detail);
    const heading = element("h4", "source-explorer-heading", `${symbols.describe(selected).label} · ${selected.kind} · lines ${selected.startLine}–${selected.endLine}`);
    heading.tabIndex = -1; detail.append(heading);
    if (focusTarget?.detail || restoreDetailFocus) heading.focus();
    detail.append(element("pre", "source-explorer-signature", selected.signature));
    const code = element("div", "source-explorer-code");
    code.tabIndex = 0; code.setAttribute("role", "region"); code.setAttribute("aria-label", `Source code for ${selected.name}`);
    const lines = data.source.split(/\r\n|[\r\n\u2028\u2029]/);
    for (let number = selected.startLine; number <= Math.min(selected.endLine, lines.length); number++) {
      const line = element("div", "source-explorer-line"); line.id = `source-line-${number}`;
      line.append(element("span", "source-explorer-line-number", String(number)), element("span", "source-explorer-line-text", lines[number - 1]));
      code.append(line);
    }
    detail.append(code);
    const calls = element("div", "source-explorer-calls");
    calls.append(element("h4", "", "Calls in this symbol"));
    const matching = data.calls.filter((call) => call.ownerId === selected.id);
    if (!matching.length) calls.append(element("p", "source-explorer-status", "No calls found."));
    const unresolved = matching.filter((call) => call.status !== "resolved" || !call.target);
    const unresolvedDetails = element("details", "source-explorer-unresolved");
    if (unresolved.length) unresolvedDetails.append(element("summary", "", `Unresolved calls (${unresolved.length})`));
    for (const call of matching) {
      const resolved = call.status === "resolved" && call.target;
      const name = call.name.length > 100 ? `${call.name.slice(0, 100)}…` : call.name;
      const item = button(`${name} · line ${call.line} · ${resolved ? "resolved" : call.reason || "unresolved syntax"}`, () => {
        if (call.status === "resolved" && call.target) { navigate(call.target); return; }
        const line = [...code.children].find((item) => item.id === `source-line-${call.line}`);
        for (const child of code.children) child.classList.remove("is-selected");
        line?.classList.add("is-selected"); line?.scrollIntoView?.({ block: "nearest" });
      });
      item.title = `${call.name} · line ${call.line} · ${resolved ? "resolved" : call.reason || "unresolved syntax"}`;
      (resolved ? calls : unresolvedDetails).append(item);
    }
    if (unresolved.length) calls.append(unresolvedDetails);
    detail.append(calls);
    renderGraph(detail);
  }
  function renderGraph(detail) {
    const section = element("section", "function-graph");
    section.append(element("h4", "", "Function calls")); detail.append(section);
    if (graphError) { section.append(element("p", "source-explorer-status", graphError)); return; }
    if (!graphData) { section.append(element("p", "source-explorer-status", "Loading function calls…")); return; }
    const { nodes = [], edges = [], coverage, diagnostics = [] } = graphData;
    const count = Array.isArray(coverage?.files) ? coverage.files.length : coverage?.files ?? 0;
    const note = `Partial call coverage: ${count} files scanned${coverage?.truncated ? ` (limit ${coverage.limit})` : ""}; incoming calls cover this file and bounded transitive importers. Function-owned calls only; module-level calls omitted. Dynamic calls may be unresolved.`;
    section.append(element("p", "source-explorer-status", [note, ...diagnostics.map((d) => typeof d === "string" ? d : [d.file, d.message].filter(Boolean).join(": "))].filter(Boolean).join(" · ")));
    const canvas = element("div", "function-graph-canvas"); canvas.setAttribute("aria-hidden", "true");
    const controls = element("div", "function-graph-controls");
    controls.append(button("Fit", () => { graph?.resize(); graph?.fit(graph.elements(), 30); }), ...[["Zoom in", 1.25], ["Zoom out", 0.8]].map(([label, factor]) => button(label, () => { if (graph) graph.zoom({ level: graph.zoom() * factor, renderedPosition: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 } }); })));
    section.append(controls, canvas);
    const key = (node) => JSON.stringify([node.file, node.id]);
    const rootKey = key({ file, id: selected.id });
    if (typeof window !== "undefined" && typeof window.cytoscape === "function") {
      graph = window.cytoscape({ container: canvas, elements: [...nodes.map((node) => ({ data: { id: key(node), label: `${node.name}\n${node.file}`, target: node }, classes: key(node) === rootKey ? "root" : "" })), ...edges.map((edge, index) => ({ data: { id: `edge-${index}`, source: key(edge.source), target: key(edge.target) } }))], layout: { name: "dagre", rankDir: "LR", nodeSep: 40, rankSep: 80, padding: 30 }, style: [{ selector: "node", style: { label: "data(label)", "text-wrap": "wrap", "text-max-width": 150, "text-valign": "center", "text-halign": "center", color: "#f1f5f1", "font-size": 11, width: 170, height: 54, shape: "round-rectangle", "background-color": "#46584a" } }, { selector: "node.root", style: { "background-color": "#688b6e", "border-width": 3, "border-color": "#d4e6d5" } }, { selector: "edge", style: { width: 2, "line-color": "#9db4a0", "target-arrow-color": "#9db4a0", "target-arrow-shape": "triangle", "curve-style": "bezier" } }] });
      graphNeedsLayout = panel.hidden;
      const initialZoom = graph.zoom();
      if (initialZoom < 0.9 || initialZoom > 1.4) { graph.zoom(Math.max(0.9, Math.min(1.4, initialZoom))); graph.center(graph.getElementById(rootKey)); }
      graph.on("tap", "node", (event) => { const target = event.target.data("target"); if (key(target) !== rootKey) navigate(target); });
    } else canvas.hidden = true;
    for (const [label, relevant, endpoint] of [["Incoming", edges.filter((e) => key(e.target) === rootKey), "source"], ["Outgoing", edges.filter((e) => key(e.source) === rootKey), "target"]]) {
      const group = element("div", "function-graph-list"); group.append(element("h4", "", label));
      if (!relevant.length) group.append(element("p", "source-explorer-status", "No resolved calls."));
      for (const edge of relevant) {
        const target = nodes.find((node) => key(node) === key(edge[endpoint]));
        if (target) group.append(button(`${target.name} · ${target.file} · call at ${edge.file}:${edge.line}:${edge.column}`, () => navigate(target)));
      }
      section.append(group);
    }
  }
  function refreshGraph() {
    const detail = panel.querySelector(".source-explorer-detail");
    const section = detail?.querySelector(".function-graph");
    if (!section) return;
    graph?.destroy(); graph = null; section.remove(); renderGraph(detail);
  }
  async function open(path, sourceTrigger = document.activeElement, restored = null) {
    close(); trigger = sourceTrigger; anchor = path; file = restored?.file || path; query = restored?.query || ""; panel.hidden = false;
    if (!restored) onNavigate();
    panel.setAttribute("aria-label", `Source explorer for ${file}`); panel.tabIndex = -1; render();
    panel.focus({ preventScroll: true }); panel.scrollIntoView?.({ block: "start" });
    panel.append(element("p", "source-explorer-status", "Loading source…"));
    const sequence = ++request; controller = new AbortController();
    try {
      const response = await fetchSource(`/api/source?file=${encodeURIComponent(file)}`, { signal: controller.signal });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.code === "UNSUPPORTED_FILE" || response.status === 415 ? "Source exploration is not supported for this file." : failure.error || `Could not load source (${response.status}).`);
      }
      const result = await response.json();
      if (sequence !== request) return;
      data = result; selected = restored?.symbol ? data.symbols.find((item) => item.id === restored.symbol) : null;
      render(selected && panel.contains(document.activeElement) ? { detail: true } : undefined);
      if (restored?.symbol && !selected) panel.append(element("p", "source-explorer-status", "The linked symbol is no longer available in this file."));
      if (selected) loadGraph();
    } catch (error) {
      if (sequence !== request || error.name === "AbortError") return;
      render(); panel.append(element("p", "source-explorer-status", error.message || "Could not load source."));
    }
  }
  function resize() {
    if (!graph) return;
    graph.resize();
    if (graphNeedsLayout) {
      graph.layout({ name: "dagre", rankDir: "LR", nodeSep: 40, rankSep: 80, padding: 30 }).run();
      graph.fit(graph.elements(), 30); graphNeedsLayout = false;
    }
  }
  return { open, close, resize, get file() { return anchor; }, get currentFile() { return file; }, get state() { return { file, symbol: selected?.id || "", query }; } };
}
