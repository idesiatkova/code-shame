import { createSymbolContext } from "../../symbol-context.js";
import { element, button } from "../../source-dom.js";
import { renderSourceCode } from "./source-code.js";
import { renderCallGraph } from "../../graph/source-call-graph.js";

export function renderSourceWorkspace(
  focusTarget,
  {
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
    setQuery,
    backToSymbols,
  },
) {
  function render(focusTarget) {
    restoration.rendering = true;
    graphRuntime.destroy();
    const canRestoreFocus = panel.contains(document.activeElement);
    const restoreDetailFocus =
      !focusTarget && document.activeElement?.className === "source-explorer-heading";
    const restorePanelFocus =
      !focusTarget && document.activeElement !== panel && panel.contains(document.activeElement);
    let inventoryTarget;
    renderHeader(focusTarget, canRestoreFocus, restorePanelFocus);
    if (!data) {
      restoration.rendering = false;
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
        restoration.pendingFocus = focusTarget.restore.focus;
        restoration.restoreFocus();
      }
      restoration.restorePagePosition(focusTarget?.restore);
      restoration.rendering = false;
      return;
    }
    renderDetail(workspace, symbols, focusTarget, restoreDetailFocus);
    restoration.restorePagePosition(focusTarget?.restore);
    restoration.rendering = false;
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
        if (!restoration.rendering) onNavigate(true);
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
        setQuery(search.value);
        update();
        onNavigate(true);
      });
      inventory.append(search, list);
      update();
    }
    return inventoryTarget;
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
    if (selected) actions.append(button("Back to symbols", backToSymbols));
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
      if (!restoration.rendering) onNavigate(true);
    });
    renderSourceCode(
      detail,
      code,
      focusTarget,
      data,
      selected,
      file,
      location,
      navigate,
      onNavigate,
      () => restoration.rendering,
    );
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
    if (focusTarget?.restore) {
      code.scrollTop = focusTarget.restore.scroll || 0;
      code.scrollLeft = focusTarget.restore.scrollLeft || 0;
      restoration.pendingFocus = focusTarget.restore.focus;
      restoration.restoreFocus();
    }
  }
  render(focusTarget);
}
