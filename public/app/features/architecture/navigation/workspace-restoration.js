import { overview } from "../graph/layer-projection.js";
import { readLocation } from "../../source/source-location.js";
import { matchingSavedState } from "../../source/source-identity.js";

function createWorkspaceRestoration({
  isReady,
  history,
  listedFiles,
  sourceExplorer,
  graphControls,
  readControls,
  readProject,
  readWorkspace,
  applySelection,
  applyGraphLocation,
  navigationStatus,
  setRestoring,
  renderBrowser,
  explorer,
  browserHeader,
  saveNavigation,
}) {
  function restoreGraphOptions(params) {
    const { analysis, currentModel } = readProject();
    const { view, dropdowns } = readControls();
    const rawPage = params.get("page");
    const directoryPageIndex =
      rawPage && /^[1-9]\d*$/.test(rawPage) && Number.isSafeInteger(Number(rawPage))
        ? Number(rawPage) - 1
        : 0;
    const valid = graphControls.restoreOptions(params, analysis);
    const activeLayer =
      view.value === "project" &&
      overview(currentModel).nodes.some((node) => node.id === params.get("layer"))
        ? params.get("layer")
        : null;
    Object.values(dropdowns).forEach((dropdown) => dropdown.refresh());
    return { rawPage, valid, directoryPageIndex, activeLayer };
  }
  function restoreNavigation() {
    if (!isReady() || !window.location) return;
    const {
      params,
      path,
      source,
      nextMode,
      invalid,
      directory: nextDirectory,
    } = history.readLocation(listedFiles());
    sourceExplorer.close();
    const selected = invalid ? null : path;
    const directory = nextDirectory;
    const mode = invalid ? "overview" : nextMode;
    applySelection({ selected, directory, mode });
    const { rawPage, valid, directoryPageIndex, activeLayer } = restoreGraphOptions(params);
    applyGraphLocation({ directoryPageIndex, activeLayer });
    navigationStatus.textContent = invalid
      ? "This link refers to a file, directory, or view that is not available in this project."
      : mode === "map" && !valid
        ? "Some map options in this link are unavailable; default options are shown."
        : "";
    setRestoring(true);
    renderBrowser();
    setRestoring(false);
    canonicalizeDirectoryPage(rawPage);
    explorer.reveal(selected || directory, { expand: true, focus: false });
    if (mode === "source") restoreSource(params, source);
    else browserHeader.querySelector(".architecture-selected-file")?.focus({ preventScroll: true });
  }
  function canonicalizeDirectoryPage(rawPage) {
    const { selected, mode, directoryPageIndex } = readWorkspace();
    const { view } = readControls();
    if (
      rawPage &&
      mode === "map" &&
      !selected &&
      view.value === "dependencies" &&
      (String(directoryPageIndex + 1) !== rawPage || directoryPageIndex === 0)
    )
      saveNavigation(true);
  }
  function restoreSource(params, source) {
    const { selected } = readWorkspace();
    const { projectName } = readProject();
    const { location, invalid } = readLocation(params);
    const symbol = params.get("symbol");
    const saved = invalid
      ? null
      : matchingSavedState(window.history.state?.source, source, symbol, location);
    const marker = window.history.state?.sourceBack;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    sourceExplorer.open(selected, browserHeader.querySelector('[data-mode="source"]'), {
      ...saved,
      file: source,
      symbol,
      query: params.get("q"),
      location,
      invalidLocation: invalid,
      canBack:
        !!saved &&
        marker?.project === projectName &&
        marker.anchor === selected &&
        marker.url === currentUrl,
    });
  }
  return { restore: restoreNavigation };
}
export { createWorkspaceRestoration };
