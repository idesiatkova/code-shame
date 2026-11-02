import { createSymbolContext } from "./symbol-context.js";
import { hasCallSite } from "./source-navigation.js";
import { functionGraphStyle } from "./graph/function-graph.js";

async function readJsonResponse(response, label) {
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(failure.error || `Could not load ${label} (${response.status}).`);
  }
  return response.json();
}

export function createSourceExplorer(
  panel,
  fetchSource = fetch,
  onClose = () => {},
  onNavigate = () => {},
  isListed = () => true,
  onBack = () => {},
) {
  let request = 0,
    controller,
    graphController,
    data,
    selected,
    file,
    anchor,
    trigger,
    query = "",
    location = null,
    graphData,
    graphError,
    navigationError,
    graph,
    graphObserver,
    graphRequest = 0,
    graphNeedsLayout = false,
    graphAdjusting = false,
    rendering = false,
    restoring = false,
    restoreFocusCancelled = false,
    pageMoved = false,
    pendingFocus = null,
    pendingPage = null,
    canBack = false;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  const button = (text, action) => {
    const node = element("button", "secondary-button", text);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  function close(restoreFocus = false) {
    request++;
    controller?.abort();
    controller = null;
    clearGraph();
    data = selected = file = anchor = location = null;
    panel.hidden = true;
    panel.replaceChildren();
    if (restoreFocus) {
      onClose();
      if (trigger?.isConnected) trigger.focus();
    }
    trigger = null;
    query = "";
    pendingFocus = navigationError = pendingPage = null;
    restoring = canBack = false;
  }
  function clearGraph() {
    graphRequest++;
    graphController?.abort();
    graphController = null;
    graphObserver?.disconnect();
    graphObserver = null;
    graph?.destroy();
    graph = null;
    graphData = graphError = null;
  }
  function cancelNavigation() {
    request++;
    controller?.abort();
    controller = null;
  }
  function select(symbol) {
    onNavigate(true);
    pendingFocus = navigationError = pendingPage = null;
    cancelNavigation();
    clearGraph();
    selected = symbol;
    location = null;
    canBack = !!onNavigate(false, true);
    render({ detail: true });
    onNavigate(true);
    loadGraph();
  }
  function snapshot() {
    const code = panel.querySelector(".source-explorer-code");
    const list = panel.querySelector(".source-explorer-list");
    return {
      file,
      data,
      selected,
      query,
      location,
      scroll: code?.scrollTop || 0,
      scrollLeft: code?.scrollLeft || 0,
      listScroll: list?.scrollTop || 0,
      pageX: pendingPage?.pageX ?? globalThis.window?.scrollX ?? 0,
      pageY: pendingPage?.pageY ?? globalThis.window?.scrollY ?? 0,
      unresolvedOpen: !!panel.querySelector(".source-explorer-unresolved")?.open,
      focus: panel.contains(document.activeElement)
        ? pendingFocus || document.activeElement?.dataset?.navigationFocus
        : null,
    };
  }
  async function loadGraph() {
    const sequence = ++graphRequest;
    graphController = new AbortController();
    try {
      const response = await fetchSource(
        `/api/function-graph?file=${encodeURIComponent(file)}&symbol=${encodeURIComponent(selected.id)}`,
        { signal: graphController.signal },
      );
      const result = await readJsonResponse(response, "function graph");
      if (sequence !== graphRequest) return;
      if (result.root?.hash && data.hash && result.root.hash !== data.hash)
        throw new Error("The source has changed. Reopen it to refresh the function graph.");
      graphData = result;
      refreshGraph();
    } catch (error) {
      if (sequence !== graphRequest || error.name === "AbortError") return;
      graphError = error.message || "Could not load function graph.";
      refreshGraph();
    }
  }
  async function navigate(target, site = null) {
    if (!target?.file || !target.id) return;
    if (!isListed(target.file)) {
      navigationError = "The target file is no longer listed in this project.";
      render({ restore: snapshot() });
      return;
    }
    onNavigate(true);
    const previous = snapshot();
    const previousGraph = graphData;
    pendingFocus = null;
    clearGraph();
    request++;
    controller?.abort();
    controller = new AbortController();
    const sequence = request;
    try {
      const response = await fetchSource(`/api/source?file=${encodeURIComponent(target.file)}`, {
        signal: controller.signal,
      });
      const result = await readJsonResponse(response, "source");
      if (sequence !== request) return;
      applyNavigation(result, target, site);
    } catch (error) {
      if (sequence !== request || error.name === "AbortError") return;
      navigationError = error.message || "Could not load target source.";
      graphData = previousGraph;
      render({ restore: previous });
      if (!graphData && selected) loadGraph();
    }
  }
  function render(focusTarget) {
    rendering = true;
    graph?.destroy();
    graph = null;
    const canRestoreFocus = panel.contains(document.activeElement);
    const restoreDetailFocus =
      !focusTarget && document.activeElement?.className === "source-explorer-heading";
    const restorePanelFocus =
      !focusTarget && document.activeElement !== panel && panel.contains(document.activeElement);
    let inventoryTarget;
    renderHeader(focusTarget, canRestoreFocus, restorePanelFocus);
    if (!data) {
      rendering = false;
      return;
    }
    if (navigationError) {
      const status = element("p", "source-explorer-status", navigationError);
      status.setAttribute("role", "status");
      panel.append(status);
    }
    if (data.diagnostics?.length) {
      const status = element(
        "p",
        "source-explorer-status",
        data.diagnostics
          .map((item) => (typeof item === "string" ? item : item.message || String(item)))
          .join(" · "),
      );
      panel.append(status);
    }
    panel.append(
      element(
        "p",
        "source-explorer-status",
        "Source is read from the current file on disk and may differ from the report.",
      ),
    );
    const symbols = createSymbolContext(data.symbols);
    const workspace = element("div", "source-explorer-workspace");
    const inventory = element("div", "source-explorer-inventory");
    inventoryTarget = renderInventory(inventory, symbols, focusTarget);
    workspace.append(inventory);
    panel.append(workspace);
    if (focusTarget?.restore) inventory.children[1].scrollTop = focusTarget.restore.listScroll || 0;
    inventoryTarget?.focus();
    if (!selected) {
      workspace.append(
        element("p", "source-explorer-status", "Choose a symbol to inspect its source."),
      );
      if (focusTarget?.restore) {
        pendingFocus = focusTarget.restore.focus;
        restoreFocus();
      }
      restorePagePosition(focusTarget?.restore);
      rendering = false;
      return;
    }
    renderDetail(workspace, symbols, focusTarget, restoreDetailFocus);
    restorePagePosition(focusTarget?.restore);
    rendering = false;
  }
  function renderInventory(inventory, symbols, focusTarget) {
    let inventoryTarget;
    {
      const search = element("input", "source-explorer-search");
      search.type = "search";
      search.placeholder = "Search symbols in this file";
      search.setAttribute("aria-label", "Search symbols in this file");
      search.dataset.navigationFocus = "search";
      search.value = query;
      const list = element("div", "source-explorer-list");
      list.addEventListener("scroll", () => {
        if (!rendering) onNavigate(true);
      });
      const update = () => {
        const matches = data.symbols.filter((symbol) =>
          symbols.describe(symbol).searchText.toLowerCase().includes(search.value.toLowerCase()),
        );
        list.replaceChildren(
          ...matches.map((symbol) => {
            const label = symbols.describe(symbol).label,
              metadata = `${symbol.kind} · lines ${symbol.startLine}–${symbol.endLine}`;
            const item = button("", () => select(symbol));
            item.append(
              element("span", "source-explorer-item-name", label),
              element("span", "source-explorer-item-meta", metadata),
            );
            item.className = "source-explorer-item";
            item.dataset.navigationFocus = `symbol:${symbol.id}`;
            item.title = `${label} · ${metadata}`;
            item.setAttribute("aria-label", item.title);
            item.setAttribute("aria-pressed", String(selected?.id === symbol.id));
            if (focusTarget === symbol.id) inventoryTarget = item;
            return item;
          }),
        );
        if (!matches.length)
          list.append(
            element(
              "p",
              "source-explorer-status",
              data.symbols.length
                ? "No matching symbols."
                : data.diagnostics?.length
                  ? "Symbol inventory unavailable."
                  : "No functions, methods, or classes found.",
            ),
          );
      };
      search.addEventListener("input", () => {
        query = search.value;
        update();
        onNavigate(true);
      });
      inventory.append(search, list);
      update();
    }
    return inventoryTarget;
  }
  function renderCalls(detail, focusTarget) {
    const calls = element("div", "source-explorer-calls");
    calls.append(element("h4", "", "Calls in this symbol"));
    const matching = data.calls.filter((call) => call.ownerId === selected.id);
    if (!matching.length) calls.append(element("p", "source-explorer-status", "No calls found."));
    const unresolved = matching.filter((call) => call.status !== "resolved" || !call.target);
    const unresolvedDetails = element("details", "source-explorer-unresolved");
    unresolvedDetails.open = !!focusTarget?.restore?.unresolvedOpen;
    unresolvedDetails.addEventListener("toggle", () => {
      if (!rendering) onNavigate(true);
    });
    if (unresolved.length)
      unresolvedDetails.append(element("summary", "", `Unresolved calls (${unresolved.length})`));
    renderCallItems(matching, calls, unresolvedDetails);
    if (unresolved.length) calls.append(unresolvedDetails);
    detail.append(calls);
  }
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
  function applyOpenedSource(result, restored) {
    data = result;
    selected = restored?.symbol ? data.symbols.find((item) => item.id === restored.symbol) : null;
    restored = reconcileRestoredSource(restored);
    const site = restored?.location;
    if (hasCallSite(data, selected, site)) location = site;
    if (
      selected &&
      !pageMoved &&
      Number.isFinite(restored?.pageX) &&
      Number.isFinite(restored?.pageY)
    )
      pendingPage = { pageX: restored.pageX, pageY: restored.pageY };
    renderOpenedSource(restored, site);
    restoring = false;
    if (restored) onNavigate(true);
    if (selected) loadGraph();
  }
  function renderCode(code, detail) {
    const lines = data.source.split(/\r\n|[\r\n\u2028\u2029]/);
    for (
      let number = selected.startLine;
      number <= Math.min(selected.endLine, lines.length);
      number++
    ) {
      const line = element("div", "source-explorer-line");
      line.id = `source-line-${number}`;
      line.append(
        element("span", "source-explorer-line-number", String(number)),
        element("span", "source-explorer-line-text", lines[number - 1]),
      );
      code.append(line);
    }
    detail.append(code);
    if (location) {
      const line = [...code.children].find((item) => item.id === `source-line-${location.line}`);
      line?.classList.add("is-selected");
      line?.scrollIntoView?.({ block: "nearest" });
    }
  }
  function renderCallItems(matching, calls, unresolvedDetails) {
    for (const call of matching) {
      const resolved = call.status === "resolved" && call.target;
      const name = call.name.length > 100 ? `${call.name.slice(0, 100)}…` : call.name;
      const item = element("div", "source-explorer-call");
      const siteButton = button(
        `${name} · call at line ${call.line}:${call.column} · ${resolved ? "resolved" : call.reason || "unresolved syntax"}`,
        () =>
          navigate(
            { file, id: selected.id, hash: data.hash },
            { line: call.line, column: call.column },
          ),
      );
      siteButton.dataset.navigationFocus = `call:${call.line}:${call.column}`;
      item.append(siteButton);
      if (resolved) {
        const declaration = button("Go to declaration", () => navigate(call.target));
        declaration.setAttribute("aria-label", `Go to declaration of ${call.name}`);
        declaration.dataset.navigationFocus = `call:${call.line}:${call.column}:declaration`;
        item.append(declaration);
      }
      siteButton.title = `${call.name} · line ${call.line} · ${resolved ? "resolved" : call.reason || "unresolved syntax"}`;
      (resolved ? calls : unresolvedDetails).append(item);
    }
  }
  function renderHeader(focusTarget, canRestoreFocus, restorePanelFocus) {
    const header = element("div", "source-explorer-header");
    const closeButton = button("Close source", () => close(true));
    closeButton.dataset.navigationFocus = "close";
    header.append(element("h3", "", `Source: ${file}`), closeButton);
    if (file !== anchor)
      header.append(
        element(
          "p",
          "source-explorer-status",
          `Architecture file: ${anchor} · Source file: ${file}`,
        ),
      );
    const actions = element("div", "source-explorer-actions");
    if (canBack) {
      const previous = button("Previous location", onBack);
      previous.dataset.previousLocation = "true";
      actions.append(previous);
    }
    if (selected)
      actions.append(
        button("Back to symbols", () => {
          onNavigate(true);
          const id = selected.id;
          cancelNavigation();
          clearGraph();
          selected = location = pendingPage = null;
          canBack = !!onNavigate(false, true);
          render(id);
          onNavigate(true);
        }),
      );
    panel.replaceChildren(header, actions);
    if (restorePanelFocus || (focusTarget?.restore && canRestoreFocus))
      panel.focus({ preventScroll: true });
  }
  function renderDetail(workspace, symbols, focusTarget, restoreDetailFocus) {
    const detail = element("div", "source-explorer-detail");
    workspace.append(detail);
    const heading = element(
      "h4",
      "source-explorer-heading",
      `${symbols.describe(selected).label} · ${selected.kind} · lines ${selected.startLine}–${selected.endLine}`,
    );
    heading.tabIndex = -1;
    detail.append(heading);
    heading.dataset.navigationFocus = "heading";
    if (focusTarget?.detail || restoreDetailFocus) heading.focus();
    detail.append(element("pre", "source-explorer-signature", selected.signature));
    const code = element("div", "source-explorer-code");
    code.tabIndex = 0;
    code.setAttribute("role", "region");
    code.setAttribute("aria-label", `Source code for ${selected.name}`);
    code.dataset.navigationFocus = "code";
    code.addEventListener("scroll", () => {
      if (!rendering) onNavigate(true);
    });
    renderCode(code, detail);
    renderCalls(detail, focusTarget);
    renderGraph(detail);
    if (focusTarget?.restore) {
      code.scrollTop = focusTarget.restore.scroll || 0;
      code.scrollLeft = focusTarget.restore.scrollLeft || 0;
      pendingFocus = focusTarget.restore.focus;
      restoreFocus();
    }
  }
  function applyNavigation(result, target, site) {
    const symbol = result.symbols.find((item) => item.id === target.id);
    if (
      !symbol ||
      (target.hash && target.hash !== result.hash) ||
      (target.name && symbol.name !== target.name) ||
      (target.startLine && symbol.startLine !== target.startLine)
    )
      throw new Error(
        "The target symbol has changed or is no longer available. Reopen the source to refresh.",
      );
    if (site && !hasCallSite(result, symbol, { ...site, hash: target.hash }))
      throw new Error(
        "The call site has changed or is no longer available. Reopen the source to refresh.",
      );
    if (file !== target.file || selected?.id !== symbol.id) query = "";
    file = target.file;
    data = result;
    selected = symbol;
    location = site ? { ...site, hash: result.hash } : null;
    navigationError = null;
    pendingPage = null;
    canBack = !!onNavigate(false, true);
    panel.setAttribute("aria-label", `Source explorer for ${file}`);
    render(panel.contains(document.activeElement) ? { detail: true } : undefined);
    onNavigate(true);
    loadGraph();
  }
  function reconcileRestoredSource(restored) {
    if (restored?.sourceHash && restored.sourceHash !== data.hash) {
      canBack = false;
      if (restored.retained) {
        selected = null;
        query = "";
        restored = { file: restored.file };
      } else
        restored = {
          file: restored.file,
          symbol: restored.symbol,
          query: restored.query,
          location: restored.location,
          invalidLocation: restored.invalidLocation,
        };
    }
    if (restoreFocusCancelled)
      restored = {
        ...restored,
        focus: panel.contains(document.activeElement)
          ? document.activeElement?.dataset?.navigationFocus
          : null,
      };
    return restored;
  }
  function renderOpenedSource(restored, site) {
    render(
      restored &&
        (restored.focus ||
          restored.scroll ||
          restored.scrollLeft ||
          restored.listScroll ||
          Number.isFinite(restored.pageY))
        ? { restore: restored }
        : selected && panel.contains(document.activeElement)
          ? { detail: true }
          : undefined,
    );
    if (restored?.symbol && !selected)
      panel.append(
        element(
          "p",
          "source-explorer-status",
          "The linked symbol is no longer available in this file.",
        ),
      );
    if ((site && !location) || restored?.invalidLocation)
      panel.append(
        element(
          "p",
          "source-explorer-status",
          "The linked call site is no longer available in this file.",
        ),
      );
  }
  function prepareOpen(path, sourceTrigger, restored) {
    close();
    trigger = sourceTrigger;
    anchor = path;
    file = restored?.file || path;
    query = restored?.query || "";
    panel.hidden = false;
    restoring = !!restored;
    restoreFocusCancelled = false;
    pageMoved = false;
    canBack = !!restored?.canBack;
    if (!restored) onNavigate();
    panel.setAttribute("aria-label", `Source explorer for ${file}`);
    panel.tabIndex = -1;
    render();
    if (!restored?.preserveFocus) {
      rendering = true;
      panel.focus({ preventScroll: true });
      rendering = false;
    }
    if (!restored) panel.scrollIntoView?.({ block: "start" });
    panel.append(element("p", "source-explorer-status", "Loading source…"));
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
  function restorePagePosition(state) {
    if (!(restoring && pageMoved) && Number.isFinite(state?.pageX) && Number.isFinite(state?.pageY))
      globalThis.window?.scrollTo?.(state.pageX, state.pageY);
  }
  function restoreFocus() {
    if (!pendingFocus || !panel.contains(document.activeElement)) {
      pendingFocus = null;
      return;
    }
    const find = (node) =>
      node.dataset?.navigationFocus === pendingFocus
        ? node
        : [...node.children].map(find).find(Boolean);
    const target = find(panel);
    if (target) {
      pendingFocus = null;
      target.focus({ preventScroll: true });
      return true;
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
    let fitMode = true,
      size = { width: canvas.clientWidth, height: canvas.clientHeight };
    controls.append(
      button("Fit", () => {
        if (!graph) return;
        fitMode = true;
        graphAdjusting = true;
        graph.resize();
        graph.fit(graph.elements(), 30);
        graphAdjusting = false;
      }),
      ...[
        ["Zoom in", 1.25],
        ["Zoom out", 0.8],
      ].map(([label, factor]) =>
        button(label, () => {
          if (graph)
            graph.zoom({
              level: graph.zoom() * factor,
              renderedPosition: { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
            });
        }),
      ),
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
    renderGraphLists(section, nodes, localEdges, rootKey, key);
  }
  function refreshGraph() {
    const detail = panel.querySelector(".source-explorer-detail");
    const section = detail?.querySelector(".function-graph");
    if (!section) return;
    graph?.destroy();
    graph = null;
    section.remove();
    renderGraph(detail);
    rendering = true;
    const restoredFocus = restoreFocus();
    rendering = false;
    if (pendingPage) {
      rendering = true;
      restorePagePosition(pendingPage);
      pendingPage = null;
      rendering = false;
    }
    if (restoredFocus) onNavigate(true);
  }
  async function open(path, sourceTrigger = document.activeElement, restored = null) {
    prepareOpen(path, sourceTrigger, restored);
    const sequence = ++request;
    controller = new AbortController();
    try {
      const response = await fetchSource(`/api/source?file=${encodeURIComponent(file)}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(
          failure.code === "UNSUPPORTED_FILE" || response.status === 415
            ? "Source exploration is not supported for this file."
            : failure.error || `Could not load source (${response.status}).`,
        );
      }
      const result = await response.json();
      if (sequence !== request) return;
      applyOpenedSource(result, restored);
    } catch (error) {
      if (sequence !== request || error.name === "AbortError") return;
      restoring = false;
      render();
      panel.append(
        element("p", "source-explorer-status", error.message || "Could not load source."),
      );
    }
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
  const cancelPage = () => {
    if (!rendering && !panel.hidden) {
      pendingPage = null;
      if (restoring) pageMoved = true;
    }
  };
  panel.addEventListener("focusin", () => {
    if (!rendering) {
      cancelPage();
      pendingFocus = null;
      if (restoring) restoreFocusCancelled = true;
      else onNavigate(true);
    }
  });
  for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
    globalThis.window?.addEventListener?.(event, cancelPage, { passive: true });
  globalThis.window?.addEventListener?.("scroll", () => {
    if (!rendering && !panel.hidden && !restoring && !pendingPage) onNavigate(true);
  });
  function invalidateBack() {
    canBack = false;
    [...(panel.querySelector(".source-explorer-actions")?.children || [])]
      .find((child) => child.dataset.previousLocation)
      ?.remove();
  }
  return {
    open,
    close,
    resize,
    invalidateBack,
    get file() {
      return anchor;
    },
    get currentFile() {
      return file;
    },
    get canBack() {
      return canBack;
    },
    get state() {
      const { scroll, scrollLeft, listScroll, pageX, pageY, unresolvedOpen, focus } = snapshot();
      return {
        file,
        symbol: selected?.id || "",
        query,
        location,
        sourceHash: data?.hash || "",
        scroll,
        scrollLeft,
        listScroll,
        pageX,
        pageY,
        unresolvedOpen,
        focus,
      };
    },
  };
}
