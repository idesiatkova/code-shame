function createWorkspaceTransitions({
  readWorkspace,
  readProject,
  readControls,
  setSelected,
  setDirectory,
  setMode,
  setPage,
  resetCycle,
  sourceExplorer,
  listedFiles,
  explorer,
  browserHeader,
  browser,
  overviewPanel,
  sourcePanel,
  map,
  saveNavigation,
  renderBrowser,
  refreshSearch,
  draw,
}) {
  let syncedSource = null;
  function syncSourceSelection() {
    const { mode } = readWorkspace();
    const { projectName } = readProject();
    if (mode !== "source" || !sourceExplorer.currentFile) return;
    const path = sourceExplorer.currentFile;
    if (syncedSource === path) return;
    syncedSource = path;
    explorer.update({
      files: listedFiles(),
      projectName,
      selectedPath: path,
      selectedKind: "file",
    });
    explorer.reveal(path, { expand: true, focus: false });
    const label = browserHeader.querySelector(".architecture-selected-file strong");
    if (label) label.textContent = `File: ${path}`;
  }
  function showMode(next) {
    let { mode } = readWorkspace();
    const { currentModel } = readProject();
    if (next !== "source") syncedSource = null;
    if (mode === "source" && next !== "source" && sourceExplorer.currentFile) {
      saveNavigation(true);
      const selected = sourceExplorer.currentFile;
      setSelected(selected);
      setDirectory(selected.includes("/") ? selected.slice(0, selected.lastIndexOf("/")) : ".");
      sourceExplorer.invalidateBack();
      setMode(next);
      renderBrowser();
      return;
    }
    setMode((mode = next));
    overviewPanel.hidden = mode !== "overview";
    sourcePanel.hidden = mode !== "source" || !sourceExplorer.file;
    map.hidden = mode !== "map";
    browserHeader
      .querySelectorAll("[data-mode]")
      .forEach((button) =>
        button.setAttribute("aria-current", String(button.dataset.mode === mode)),
      );
    if (mode === "map" && currentModel) draw();
    if (mode === "source") sourceExplorer.resize();
  }
  function openSource(trigger) {
    const { mode, selected } = readWorkspace();
    const { projectName } = readProject();
    if (sourceExplorer.file && (mode === "source" || sourceExplorer.currentFile === selected)) {
      showMode("source");
      saveNavigation();
      return;
    }
    const retained = window.history.state?.retainedSource;
    const saved =
      retained?.project === projectName &&
      retained.file === selected &&
      retained.state?.file === selected &&
      /^[a-f0-9]{64}$/.test(retained.state.sourceHash || "")
        ? {
            ...retained.state,
            retained: true,
            focus: null,
            pageX: undefined,
            pageY: undefined,
            canBack: false,
          }
        : null;
    showMode("source");
    sourceExplorer.open(selected, trigger, saved);
    if (saved) saveNavigation();
  }
  function selectOverview(path = ".", preserveTreeFocus = false, page = 0) {
    const { mode } = readWorkspace();
    const { dropdowns, search } = readControls();
    setDirectory(path);
    setSelected(null);
    resetCycle();
    setPage(page);
    dropdowns.view.refresh();
    dropdowns.cycle.refresh();
    sourceExplorer.close();
    search.value = "";
    refreshSearch();
    if (mode !== "map") setMode("overview");
    renderBrowser();
    if (!preserveTreeFocus) explorer.reveal(path, { expand: true, focus: false });
    saveNavigation();
    if (!preserveTreeFocus)
      browserHeader.querySelector(".architecture-selected-file")?.focus({ preventScroll: true });
  }
  function selectFile(path, preserveTreeFocus = false) {
    const { mode } = readWorkspace();
    const { dropdowns } = readControls();
    const inSource = mode === "source";
    if (inSource && sourceExplorer.currentFile === path) return;
    if (inSource) saveNavigation(true);
    setSelected(path);
    resetCycle();
    dropdowns.view.refresh();
    setDirectory(path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".");
    if (!preserveTreeFocus) explorer.reveal(path, { focus: false });
    setMode(inSource ? "source" : mode === "map" ? "map" : "overview");
    sourceExplorer.close();
    renderBrowser();
    if (inSource)
      sourceExplorer.open(path, browserHeader.querySelector('[data-mode="source"]'), {
        file: path,
        preserveFocus: true,
      });
    saveNavigation();
    if (!preserveTreeFocus && !inSource)
      browser.querySelector(".architecture-selected-file")?.focus({ preventScroll: true });
  }
  return { syncSourceSelection, showMode, openSource, selectOverview, selectFile };
}
export { createWorkspaceTransitions };
