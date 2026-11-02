import { graphHint } from "./projection-view.js";
import { createStyledSelect } from "../../../shared/components/molecules/styled-select.js";

function createGraphControls({ view, direction, depth, cycle }) {
  function readOptions() {
    return { view: view.value, direction: direction.value, depth: depth.value, cycle: cycle.value };
  }
  function restoreOptions(params, analysis) {
    const filters = [
      [
        view,
        "graph",
        "dependencies",
        (value) => ["dependencies", "project", "impact", "cycles"].includes(value),
      ],
      [direction, "direction", "both", (value) => ["both", "inbound", "outbound"].includes(value)],
      [depth, "depth", "1", (value) => [...depth.options].some((option) => option.value === value)],
      [
        cycle,
        "cycle",
        "",
        (value) =>
          !value || (analysis?.cycles || []).some((group) => JSON.stringify(group) === value),
      ],
    ];
    let valid = true;
    for (const [element, key, fallback, accepts] of filters) {
      const value = params.get(key) || fallback;
      if (!accepts(value)) valid = false;
      element.value = accepts(value) ? value : fallback;
    }
    return valid;
  }
  return { readOptions, restoreOptions };
}
function createGraphControlElements({
  browserInventory,
  legend,
  fitButton,
  onToggleAll,
  onDraw,
  onZoom,
}) {
  const controls = document.createElement("div");
  controls.className = "architecture-controls";
  controls.innerHTML = `<div class="architecture-search"><label>Find file <input type="search" placeholder="Search file paths" autocomplete="off" role="combobox" aria-label="Find file" aria-autocomplete="list" aria-expanded="false" aria-controls="architecture-file-results"></label>
    <select hidden aria-label="Matching files"></select></div>
    <div class="architecture-secondary"><div class="architecture-graph-settings"><label class="architecture-direction">Direction <select aria-label="Dependency direction"><option value="both">Both</option><option value="inbound">Imported by</option><option value="outbound">Imports</option></select></label>
    <label class="architecture-depth">Depth <select aria-label="Dependency depth"><option value="1">1 step</option><option value="2">2 steps</option></select></label>
    <button type="button" class="secondary-button">Up to directory</button>
    <label class="architecture-view" hidden>View <select aria-label="Graph view"><option value="dependencies">Imports</option><option value="project">Project map</option><option value="impact">Impact</option><option value="cycles">Cycles</option></select></label>
    <label class="architecture-cycle">Cycle group <select aria-label="Cycle group"><option value="">Select a cycle</option></select></label></div><p class="architecture-control-hint"></p></div>`;
  const secondary = controls.querySelector?.(".architecture-secondary");
  const [search, results, direction, depth, back, view, cycle] =
    controls.querySelectorAll("input, select, button");
  const inventoryHeader = document.createElement("div");
  inventoryHeader.className = "architecture-inventory-header";
  const inventoryTitle = document.createElement("h3");
  inventoryTitle.textContent = "Explorer";
  const collapse = document.createElement("button");
  collapse.type = "button";
  collapse.className = "architecture-collapse";
  collapse.title = "Collapse all folders";
  collapse.setAttribute("aria-label", "Collapse all folders");
  const collapseIcon = document.createElement("i");
  collapseIcon.setAttribute("data-lucide", "list-minus");
  collapseIcon.setAttribute("aria-hidden", "true");
  collapse.append(collapseIcon);
  collapse.addEventListener("click", onToggleAll);
  inventoryHeader.append(inventoryTitle, collapse);
  browserInventory.prepend(inventoryHeader, controls.querySelector(".architecture-search"));
  const graphNote = document.createElement("p");
  graphNote.className = "architecture-graph-note";
  graphNote.textContent =
    "Arrows show static imports. Select a file, folder, or arrow to inspect its connections. Drag to pan; use zoom or Fit map to adjust the view. Colors identify layers.";
  legend.before(secondary);
  const graphModes = document.createElement("div");
  graphModes.className = "architecture-graph-modes";
  graphModes.setAttribute("role", "group");
  graphModes.setAttribute("aria-label", "Dependency view");
  for (const [label, value] of [
    ["Imports", "dependencies"],
    ["Project map", "project"],
    ["Impact", "impact"],
    ["Cycles", "cycles"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.graphView = value;
    button.addEventListener("click", () => {
      if (view.value !== value) {
        view.value = value;
        view.dispatchEvent(new Event("change", { bubbles: true }));
      } else onDraw();
    });
    graphModes.append(button);
  }
  secondary.prepend(graphModes);
  const mapActions = document.createElement("div");
  mapActions.className = "architecture-map-actions";
  fitButton.before(mapActions);
  mapActions.append(back, fitButton);
  for (const [label, factor] of [
    ["Zoom in", 1.25],
    ["Zoom out", 0.8],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = label;
    button.addEventListener("click", () => onZoom(factor));
    mapActions.append(button);
  }
  for (const [button, label, iconName] of [
    [back, "Up to directory", "arrow-up"],
    [fitButton, "Fit map", "maximize-2"],
    [mapActions.children[2], "Zoom in", "zoom-in"],
    [mapActions.children[3], "Zoom out", "zoom-out"],
  ]) {
    const fullLabel = document.createElement("span");
    fullLabel.className = "architecture-action-full";
    fullLabel.textContent = label;
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", iconName);
    icon.setAttribute("aria-hidden", "true");
    button.replaceChildren(icon, fullLabel);
    button.setAttribute("aria-label", label);
    button.title = label;
  }
  const hint = secondary?.querySelector?.(".architecture-control-hint");
  back.hidden = true;
  const dropdowns = {
    search: { refresh() {}, focus: () => search.focus() },
    direction: createStyledSelect(direction),
    depth: createStyledSelect(depth),
    view: { refresh() {} },
    cycle: createStyledSelect(cycle),
  };
  return {
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
  };
}

function updateDiagnostics(model, diagnostics, diagnosticsList) {
  const reasons =
    model.projectGraph?.complete === false ? model.projectGraph.diagnostics || [] : [];
  diagnostics.hidden = reasons.length === 0;
  diagnosticsList.replaceChildren(
    ...reasons.map((reason) => {
      const item = document.createElement("li");
      item.textContent = reason;
      return item;
    }),
  );
}
function updateCycleOptions(analysis, cycle, dropdowns) {
  const previousCycle = cycle.value;
  cycle.replaceChildren(
    new Option(
      analysis
        ? `${analysis.cycles.length} cycle ${analysis.cycles.length === 1 ? "group" : "groups"}`
        : "Unavailable",
      "",
    ),
    ...(analysis?.cycles || []).map(
      (group) => new Option(`${group[0]} · ${group.length} files`, JSON.stringify(group)),
    ),
  );
  cycle.value = [...cycle.options].some((option) => option.value === previousCycle)
    ? previousCycle
    : "";
  dropdowns.cycle.refresh();
}
function updateGraphControls({
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
}) {
  [...graphModes.children].forEach((button) =>
    button.setAttribute("aria-pressed", String(button.dataset.graphView === view.value)),
  );
  direction.parentElement.hidden = depth.parentElement.hidden =
    view.value !== "dependencies" || !graphSelected;
  direction.disabled = depth.disabled = !graphSelected;
  dropdowns.direction.refresh();
  dropdowns.depth.refresh();
  if (hint)
    hint.textContent =
      analysis && !analysis.data.files.size
        ? "No graph files available. Add project files or refresh the scan."
        : graphHint(view.value, selected, graphSelected);
  cycle.parentElement.hidden = view.value !== "cycles" || !analysis?.cycles.length;
}

export {
  createGraphControls,
  createGraphControlElements,
  updateDiagnostics,
  updateCycleOptions,
  updateGraphControls,
};
