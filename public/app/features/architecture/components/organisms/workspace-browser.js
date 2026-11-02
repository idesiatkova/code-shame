import { renderWorkspaceOverview } from "../../architecture-workspace.js";
import { formatNumber } from "./graph-details.js";

function createWorkspaceShell({ legend, stats, details }) {
  const sourcePanel = document.createElement("section");
  sourcePanel.className = "source-explorer";
  sourcePanel.hidden = true;
  const browser = document.createElement("section");
  browser.className = "architecture-browser";
  const browserHeader = document.createElement("div");
  const updating = document.createElement("p");
  updating.className = "architecture-scope";
  updating.textContent = "Updating project structure…";
  updating.hidden = true;
  const browserInventory = document.createElement("div");
  browserInventory.className = "architecture-inventory";
  const workspace = document.createElement("div");
  workspace.className = "architecture-workspace";
  const overviewPanel = document.createElement("div");
  browser.append(browserInventory, workspace);
  const map = document.createElement("section");
  map.className = "architecture-map-disclosure";
  legend.before(browser);
  map.append(stats, legend, details.parentElement);
  workspace.append(browserHeader, overviewPanel, sourcePanel, map);
  return { sourcePanel, browser, browserHeader, updating, browserInventory, overviewPanel, map };
}

function createWorkspaceBrowser({
  browser,
  browserHeader,
  browserInventory,
  overviewPanel,
  updating,
  navigationStatus,
  explorer,
  onSelectOverview,
  onSelectFile,
  onOpenProjectMap,
  onOpenSource,
  onShowMode,
  onChangeMode,
}) {
  let filesVisible = !window.matchMedia?.("(max-width: 600px)").matches;
  browser.classList.toggle("files-hidden", !filesVisible);
  browserInventory.id = "architecture-files";
  function hideFiles() {
    filesVisible = false;
    browser.classList.toggle("files-hidden", true);
    const toggle = browserHeader.querySelector(".architecture-files-toggle");
    toggle?.setAttribute("aria-expanded", "false");
    toggle?.focus({ preventScroll: true });
  }
  function render({ projectName, structure, mode, currentFile, selected, directory, analysis }) {
    browserHeader.replaceChildren();
    const filesToggle = document.createElement("button");
    filesToggle.type = "button";
    filesToggle.className = "architecture-files-toggle";
    filesToggle.textContent = "Files";
    filesToggle.setAttribute("aria-expanded", String(filesVisible));
    filesToggle.setAttribute("aria-controls", browserInventory.id);
    filesToggle.addEventListener("click", () => {
      filesVisible = !filesVisible;
      browser.classList.toggle("files-hidden", !filesVisible);
      filesToggle.setAttribute("aria-expanded", String(filesVisible));
    });
    const heading = document.createElement("p");
    heading.className = "architecture-scope";
    heading.textContent = `${projectName || "Project"} · ${formatNumber(structure.scope.listedFileCount)} listed files in analysis`;
    browserHeader.append(heading);
    const panel = document.createElement("div");
    panel.className = "architecture-selected-file";
    panel.tabIndex = -1;
    const displayedFile = mode === "source" ? currentFile || selected : selected;
    const label = document.createElement("strong");
    label.textContent = displayedFile
      ? `File: ${displayedFile}`
      : directory === "."
        ? "Project overview"
        : `Directory: ${directory}`;
    panel.append(label);
    if (selected || directory !== ".") {
      const backOverview = document.createElement("button");
      backOverview.type = "button";
      backOverview.className = "secondary-button";
      backOverview.textContent = "Project overview";
      backOverview.addEventListener("click", () => onSelectOverview());
      panel.append(backOverview);
    }
    browserHeader.append(panel);
    renderWorkspaceTabs(filesToggle, selected);
    const allFiles = structure.directories
      .flatMap((item) => item.files)
      .sort((a, b) => a.localeCompare(b));
    explorer.update({
      files: allFiles,
      projectName,
      selectedPath: displayedFile || directory,
      selectedKind: displayedFile ? "file" : directory === "." ? "project" : "directory",
    });
    const fileButton = (path) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = path;
      button.setAttribute("aria-current", String(path === selected));
      button.addEventListener("click", () => onSelectFile(path));
      return button;
    };
    renderWorkspaceOverview({
      overviewPanel,
      selected,
      directory,
      allFiles,
      structure,
      analysis,
      fileButton,
      openProjectMap: () => {
        onOpenProjectMap();
      },
    });
    onShowMode(mode);
  }
  function renderWorkspaceTabs(filesToggle, selected) {
    const tabs = document.createElement("div");
    tabs.className = "architecture-workspace-tabs";
    tabs.setAttribute("role", "group");
    tabs.setAttribute("aria-label", "Workspace view");
    for (const [name, value] of [
      [selected ? "File" : "Overview", "overview"],
      ["Source", "source"],
      ["Graph", "map"],
    ]) {
      if (value === "source" && !selected) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary-button";
      button.textContent = name;
      button.dataset.mode = value;
      button.addEventListener("click", () => {
        if (value === "source") onOpenSource(button);
        else {
          onChangeMode(value);
        }
      });
      tabs.append(button);
    }
    browserHeader.append(tabs, updating, navigationStatus, filesToggle);
  }
  return { render, hideFiles };
}

export { createWorkspaceBrowser, createWorkspaceShell };
