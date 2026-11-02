import { hasCallSite } from "./source-identity.js";
import { renderCallGraph } from "./graph/source-call-graph.js";
import { createFunctionGraphRuntime } from "./graph/function-graph-runtime.js";

import { element } from "./source-dom.js";
import { renderSourceWorkspace } from "./components/organisms/source-workspace.js";
import { createSourceRestoration } from "./source-restoration.js";
import { createSourceRequests } from "./source-requests.js";

export function createSourceExplorer(
  panel,
  fetchSource = fetch,
  onClose = () => {},
  onNavigate = () => {},
  isListed = () => true,
  onBack = () => {},
) {
  const requests = createSourceRequests(fetchSource);
  const restoration = createSourceRestoration(panel, onNavigate);
  const graphRuntime = createFunctionGraphRuntime(panel, navigate);
  let data,
    selected,
    file,
    anchor,
    trigger,
    query = "",
    location = null,
    graphData,
    graphError,
    navigationError,
    canBack = false;
  function close(restoreFocus = false) {
    requests.cancelSource();
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
    restoration.pendingFocus = navigationError = restoration.pendingPage = null;
    restoration.restoring = canBack = false;
  }
  function clearGraph() {
    requests.cancelGraph();
    graphRuntime.destroy();
    graphData = graphError = null;
  }
  function cancelNavigation() {
    requests.cancelSource();
  }
  function select(symbol) {
    onNavigate(true);
    restoration.pendingFocus = navigationError = restoration.pendingPage = null;
    cancelNavigation();
    clearGraph();
    selected = symbol;
    location = null;
    canBack = !!onNavigate(false, true);
    render({ detail: true });
    onNavigate(true);
    loadGraph();
  }
  async function loadGraph() {
    try {
      const result = await requests.graph(file, selected.id);
      if (!result) return;
      if (result.root?.hash && data.hash && result.root.hash !== data.hash)
        throw new Error("The source has changed. Reopen it to refresh the function graph.");
      graphData = result;
      refreshGraph();
    } catch (error) {
      graphError = error.message || "Could not load function graph.";
      refreshGraph();
    }
  }
  async function navigate(target, site = null) {
    if (!target?.file || !target.id) return;
    if (!isListed(target.file)) {
      navigationError = "The target file is no longer listed in this project.";
      render({ restore: restoration.snapshot(file, data, selected, query, location) });
      return;
    }
    onNavigate(true);
    const previous = restoration.snapshot(file, data, selected, query, location);
    const previousGraph = graphData;
    restoration.pendingFocus = null;
    clearGraph();
    try {
      const result = await requests.source(target.file);
      if (!result) return;
      applyNavigation(result, target, site);
    } catch (error) {
      navigationError = error.message || "Could not load target source.";
      graphData = previousGraph;
      render({ restore: previous });
      if (!graphData && selected) loadGraph();
    }
  }
  function backToSymbols() {
    onNavigate(true);
    const id = selected.id;
    cancelNavigation();
    clearGraph();
    selected = location = restoration.pendingPage = null;
    canBack = !!onNavigate(false, true);
    render(id);
    onNavigate(true);
  }
  function render(focusTarget) {
    renderSourceWorkspace(focusTarget, {
      panel,
      data,
      selected,
      file,
      anchor,
      query,
      location,
      navigationError,
      canBack,
      graphData,
      graphError,
      graphRuntime,
      restoration,
      onNavigate,
      onBack,
      close,
      select,
      navigate,
      setQuery: (value) => {
        query = value;
      },
      backToSymbols,
    });
  }
  function applyOpenedSource(result, restored) {
    data = result;
    selected = restored?.symbol ? data.symbols.find((item) => item.id === restored.symbol) : null;
    restored = reconcileRestoredSource(restored);
    const site = restored?.location;
    if (hasCallSite(data, selected, site)) location = site;
    if (
      selected &&
      !restoration.pageMoved &&
      Number.isFinite(restored?.pageX) &&
      Number.isFinite(restored?.pageY)
    )
      restoration.pendingPage = { pageX: restored.pageX, pageY: restored.pageY };
    renderOpenedSource(restored, site);
    restoration.restoring = false;
    if (restored) onNavigate(true);
    if (selected) loadGraph();
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
    restoration.pendingPage = null;
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
    if (restoration.restoreFocusCancelled)
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
    restoration.restoring = !!restored;
    restoration.restoreFocusCancelled = false;
    restoration.pageMoved = false;
    canBack = !!restored?.canBack;
    if (!restored) onNavigate();
    panel.setAttribute("aria-label", `Source explorer for ${file}`);
    panel.tabIndex = -1;
    render();
    if (!restored?.preserveFocus) {
      restoration.rendering = true;
      panel.focus({ preventScroll: true });
      restoration.rendering = false;
    }
    if (!restored) panel.scrollIntoView?.({ block: "start" });
    panel.append(element("p", "source-explorer-status", "Loading source…"));
  }
  function refreshGraph() {
    const detail = panel.querySelector(".source-explorer-detail");
    const section = detail?.querySelector(".function-graph");
    if (!section) return;
    graphRuntime.destroy();
    section.remove();
    renderCallGraph(
      detail,
      graphData,
      graphError,
      file,
      selected,
      location,
      navigate,
      graphRuntime,
    );
    restoration.rendering = true;
    const restoredFocus = restoration.restoreFocus();
    restoration.rendering = false;
    if (restoration.pendingPage) {
      restoration.rendering = true;
      restoration.restorePagePosition(restoration.pendingPage);
      restoration.pendingPage = null;
      restoration.rendering = false;
    }
    if (restoredFocus) onNavigate(true);
  }
  async function open(path, sourceTrigger = document.activeElement, restored = null) {
    prepareOpen(path, sourceTrigger, restored);
    try {
      const result = await requests.source(file, true);
      if (result) applyOpenedSource(result, restored);
    } catch (error) {
      restoration.restoring = false;
      render();
      panel.append(
        element("p", "source-explorer-status", error.message || "Could not load source."),
      );
    }
  }
  function invalidateBack() {
    canBack = false;
    [...(panel.querySelector(".source-explorer-actions")?.children || [])]
      .find((child) => child.dataset.previousLocation)
      ?.remove();
  }
  return {
    open,
    close,
    resize: graphRuntime.resize,
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
      const { scroll, scrollLeft, listScroll, pageX, pageY, unresolvedOpen, focus } =
        restoration.snapshot(file, data, selected, query, location);
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
