import { createGraphPresenter } from "./graph/graph-presenter.js";
import { createWorkspaceTransitions } from "./navigation/workspace-transitions.js";
import { createWorkspaceRestoration } from "./navigation/workspace-restoration.js";
import {
  createGraphControls,
  createGraphControlElements,
  updateDiagnostics,
  updateCycleOptions,
  updateGraphControls,
} from "./graph/graph-controls.js";
import { createWorkspaceHistory } from "./navigation/workspace-history.js";
import { createGraphRuntime } from "./graph/graph-runtime.js";
import { createFileSearch } from "./search.js";
import { renderPrompt, emptyState } from "./components/organisms/graph-details.js";
import { directoryGraph } from "./architectureProjection.js";
import { analytics } from "./graph/cycles.js";
import { createSourceExplorer } from "../source/source-explorer.js";
import { createProjectExplorer } from "../explorer/project-explorer.js";
import { projectStructure } from "./architecture-workspace.js";
import {
  createWorkspaceBrowser,
  createWorkspaceShell,
} from "./components/organisms/workspace-browser.js";

function createRenderer({ container, details, fitButton, legend, stats }) {
  const syncSourceSelection = (...args) => transitions.syncSourceSelection(...args);
  const showMode = (...args) => transitions.showMode(...args);
  const openSource = (...args) => transitions.openSource(...args);
  const selectOverview = (...args) => transitions.selectOverview(...args);
  const selectFile = (...args) => transitions.selectFile(...args);
  const { sourcePanel, browser, browserHeader, updating, browserInventory, overviewPanel, map } =
    createWorkspaceShell({ legend, stats, details });
  const sourceExplorer = createSourceExplorer(
    sourcePanel,
    fetch,
    () => {
      showMode("overview");
      saveNavigation();
      browserHeader.querySelector('[data-mode="source"]')?.focus();
    },
    (replace, sourceTransition) => {
      syncSourceSelection();
      return saveNavigation(replace, sourceTransition);
    },
    (path) => listedFiles().includes(path),
    () => window.history.back(),
  );
  let projectName = "",
    projectKey = "";
  let structure = { directories: [], entryPoints: [], scope: { listedFileCount: 0 } };
  let directory = ".",
    mode = "overview",
    directoryPageIndex = 0;
  const navigationStatus = document.createElement("p");
  navigationStatus.setAttribute("role", "status");
  const history = createWorkspaceHistory({
    readWorkspace: () => ({
      selected,
      directory,
      mode,
      directoryPageIndex,
      activeLayer,
      projectName,
      graphContext: runtime.context,
    }),
    readGraphOptions: () => graphControls.readOptions(),
    readSource: () => sourceExplorer,
    reportStatus: (message) => {
      navigationStatus.textContent = message;
    },
  });
  const saveNavigation = (...args) => history.save(...args);
  const saveCamera = (camera) => history.saveCamera(camera);
  const listedFiles = () => structure.directories.flatMap((item) => item.files);
  const explorer = createProjectExplorer({
    container: browserInventory,
    onExpansionChange: (canCollapse, hasFolders) => {
      collapse.disabled = !hasFolders;
      collapse.title = canCollapse ? "Collapse all folders" : "Expand all folders";
      collapse.setAttribute("aria-label", collapse.title);
      collapse.textContent = canCollapse ? "⊟" : "⊞";
    },
    onSelect: ({ path, kind }) => {
      if (kind === "file") {
        selectFile(path, true);
        if (window.matchMedia?.("(max-width: 600px)").matches) {
          workspaceBrowser.hideFiles();
        }
      } else selectOverview(path, true);
    },
  });
  const workspaceBrowser = createWorkspaceBrowser({
    browser,
    browserHeader,
    browserInventory,
    overviewPanel,
    updating,
    navigationStatus,
    explorer,
    onSelectOverview: selectOverview,
    onSelectFile: selectFile,
    onOpenSource: openSource,
    onShowMode: showMode,
    onChangeMode: (value) => {
      showMode(value);
      saveNavigation();
    },
    onOpenProjectMap: () => {
      view.value = "project";
      activeLayer = null;
      details.scrollTop = 0;
      showMode("map");
      saveNavigation();
    },
  });
  const transitions = createWorkspaceTransitions({
    readWorkspace: () => ({ selected, directory, mode }),
    readProject: () => ({ currentModel, projectName }),
    readControls: () => ({ dropdowns, search }),
    setSelected: (value) => {
      selected = value;
    },
    setDirectory: (value) => {
      directory = value;
    },
    setMode: (value) => {
      mode = value;
    },
    setPage: (value) => {
      directoryPageIndex = value;
    },
    resetCycle: () => {
      cycleMember = null;
    },
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
    refreshSearch: () => refreshSearch(),
    draw,
  });
  function renderBrowser() {
    workspaceBrowser.render({
      projectName,
      structure,
      mode,
      currentFile: sourceExplorer.currentFile,
      selected,
      directory,
      analysis,
    });
  }
  let currentModel = null;
  let modelSignature = null;
  let selected = null;
  let activeLayer = null;
  let analysis = null;
  let cycleMember = null;
  const {
    controls,
    search,
    results,
    direction,
    depth,
    back,
    view,
    cycle,
    collapse,
    graphNote,
    graphModes,
    mapActions,
    hint,
    dropdowns,
  } = createGraphControlElements({
    browserInventory,
    legend,
    fitButton,
    onToggleAll: () => explorer.toggleAll(),
    onDraw: draw,
    onReadable: () => runtime.readable(),
    onZoom: (factor) => runtime.zoom(factor),
  });
  const graphControls = createGraphControls({ view, direction, depth, cycle });
  const diagnostics = document.createElement("details");
  diagnostics.className = "architecture-diagnostics";
  const diagnosticsSummary = document.createElement("summary");
  diagnosticsSummary.textContent = "Why the dependency graph is partial";
  const diagnosticsList = document.createElement("ul");
  diagnostics.append(diagnosticsSummary, diagnosticsList);
  const graphHelp = document.createElement("details");
  graphHelp.className = "architecture-graph-help";
  const graphHelpSummary = document.createElement("summary");
  graphHelpSummary.textContent = "About this map";
  graphHelp.append(graphHelpSummary, graphNote, legend);
  map.append(diagnostics, graphHelp);
  const { refreshSearch, showResults, clearResults } = createFileSearch(
    search,
    results,
    listedFiles,
    selectFile,
    () => dropdowns.search.refresh(),
  );
  direction.addEventListener("change", () => {
    if (selected) draw();
    saveNavigation(true);
  });
  depth.addEventListener("change", () => {
    if (selected) draw();
    saveNavigation(true);
  });
  view.addEventListener("change", () => {
    details.scrollTop = 0;
    draw();
    saveNavigation();
  });
  cycle.addEventListener("change", () => {
    cycleMember = null;
    draw();
    saveNavigation();
  });
  back.addEventListener("click", () => {
    const parent = selected
      ? directory
      : directory.includes("/")
        ? directory.slice(0, directory.lastIndexOf("/"))
        : ".";
    const child = selected || directory;
    const index = directoryGraph(currentModel, parent, listedFiles()).nodes.findIndex(
      (node) => node.path === child,
    );
    view.value = "dependencies";
    selectOverview(parent, false, Math.max(0, Math.floor(index / 6)));
    fitButton.focus({ preventScroll: true });
  });
  fitButton.addEventListener("click", () => runtime.fit());
  let restoringNavigation = false;
  const runtime = createGraphRuntime({
    container,
    saveCamera,
    readWorkspace: () => ({
      projectKey,
      selected,
      directory,
      mode,
      view: view.value,
      direction: direction.value,
      depth: depth.value,
      cycle: cycle.value,
      directoryPageIndex,
      restoringNavigation,
    }),
  });
  const restoration = createWorkspaceRestoration({
    isReady: () => history.isReady(),
    history,
    listedFiles,
    sourceExplorer,
    graphControls,
    readControls: () => ({ view, dropdowns }),
    readProject: () => ({ analysis, currentModel, projectName }),
    readWorkspace: () => ({ selected, mode, directoryPageIndex }),
    applySelection: (state) => {
      selected = state.selected;
      directory = state.directory;
      mode = state.mode;
    },
    applyGraphLocation: (state) => {
      directoryPageIndex = state.directoryPageIndex;
      activeLayer = state.activeLayer;
      cycleMember = null;
    },
    navigationStatus,
    setRestoring: (value) => {
      restoringNavigation = value;
    },
    renderBrowser,
    explorer,
    browserHeader,
    saveNavigation,
  });
  if (typeof window !== "undefined")
    window.addEventListener?.("popstate", () => restoration.restore());
  function clear(message = "No project structure yet.") {
    sourceExplorer.close();
    updating.hidden = true;
    runtime.destroyGraph();
    currentModel = null;
    modelSignature = null;
    selected = null;
    activeLayer = null;
    analysis = null;
    structure = { directories: [], entryPoints: [], scope: { listedFileCount: 0 } };
    search.value = "";
    search.disabled = true;
    showResults(false);
    clearResults();
    direction.value = "both";
    depth.value = "1";
    view.value = "dependencies";
    cycle.value = "";
    cycle.replaceChildren(new Option("Select a cycle", ""));
    results.replaceChildren(new Option("Search for a file", ""));
    Object.values(dropdowns).forEach((dropdown) => dropdown.refresh());
    diagnostics.hidden = true;
    diagnosticsList.replaceChildren();
    controls.hidden = true;
    graphNote.hidden = true;
    back.hidden = true;
    browserHeader.replaceChildren();
    explorer.clear();
    overviewPanel.replaceChildren(emptyState(message));
    overviewPanel.hidden = false;
    map.hidden = true;
    container.replaceChildren(emptyState(message));
    legend.replaceChildren();
    stats.textContent = "";
    renderPrompt(details, "Search for a file to explore its dependencies.");
  }
  function render(model, name, projectId) {
    const nextProjectKey = projectId || name || "Project";
    if (model?.state === "running" && currentModel && projectKey === nextProjectKey) {
      updating.hidden = false;
      return;
    }
    if (model?.state !== "ready") {
      clear(unavailableMessage(model));
      return;
    }
    updating.hidden = true;
    const newProject = !currentModel || projectKey !== nextProjectKey;
    const nextSignature = JSON.stringify(model);
    if (!newProject && projectName === (name || "Project") && modelSignature === nextSignature)
      return;
    search.disabled = false;
    if (newProject) sourceExplorer.close();
    currentModel = model;
    modelSignature = nextSignature;
    projectName = name || "Project";
    projectKey = nextProjectKey;
    structure = projectStructure(model);
    if (newProject) {
      directory = ".";
      selected = null;
      presenter.clearSelection();
      mode = "overview";
      explorer.clear();
    }
    updateDiagnostics(model, diagnostics, diagnosticsList);
    analysis = analytics(model);
    updateCycleOptions(analysis, cycle, dropdowns);
    reconcileSelection();
    refreshSearch();
    controls.hidden = false;
    graphNote.hidden = false;
    renderBrowser();
    if (newProject) {
      history.setReady(true);
      restoration.restore();
    }
  }
  function reconcileSelection() {
    if (selected && !listedFiles().includes(selected)) {
      selected = null;
      sourceExplorer.close();
      mode = "overview";
    } else if (sourceExplorer.currentFile && !listedFiles().includes(sourceExplorer.currentFile)) {
      sourceExplorer.close();
      mode = "overview";
      navigationStatus.textContent = "The source file is no longer listed in this project.";
    }
  }
  const presenter = createGraphPresenter({
    runtime,
    details,
    legend,
    stats,
    container,
    mapActions,
    back,
    browserHeader,
    readWorkspace: () => ({
      selected,
      directory,
      directoryPageIndex,
      activeLayer,
      cycleMember,
      restoringNavigation,
    }),
    readProject: () => ({ analysis, currentModel }),
    readControls: () => ({ view, cycle, direction, depth }),
    listedFiles,
    setLayer: (value) => {
      activeLayer = value;
    },
    setPage: (value) => {
      directoryPageIndex = value;
    },
    setCycleMember: (value) => {
      cycleMember = value;
    },
    updateGraphControls: (graphSelected) =>
      updateGraphControls({
        graphSelected,
        graphModes,
        view,
        direction,
        depth,
        dropdowns,
        hint,
        selected,
        cycle,
        analysis,
      }),
    saveNavigation,
    selectFile,
    selectOverview,
    openSource,
    refreshSearch,
  });
  function draw() {
    presenter.draw();
  }
  return { clear, render };
}

export { createRenderer };

function unavailableMessage(model) {
  if (model?.state === "running") return "Building project structure…";
  if (model?.error) return `Project structure unavailable: ${model.error}`;
  return "No project structure yet.";
}
