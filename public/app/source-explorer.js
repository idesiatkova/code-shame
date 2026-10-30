export function createSourceExplorer(panel, fetchSource = fetch) {
  let request = 0, controller, data, selected, file, trigger, query = "";
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
    request++; controller?.abort(); controller = null; data = selected = file = null;
    panel.hidden = true; panel.replaceChildren();
    if (restoreFocus && trigger?.isConnected) trigger.focus();
    trigger = null; query = "";
  }
  function render(focusTarget) {
    const restorePanelFocus = !focusTarget && document.activeElement !== panel && panel.contains(document.activeElement);
    let inventoryTarget;
    const header = element("div", "source-explorer-header");
    header.append(element("h3", "", file), button("Close source", () => close(true)));
    const actions = element("div", "source-explorer-actions");
    if (selected) actions.append(button("Back to symbols", () => { const id = selected.id; selected = null; render(id); }));
    panel.replaceChildren(header, actions);
    if (restorePanelFocus) panel.focus({ preventScroll: true });
    if (!data) return;
    if (data.diagnostics?.length) {
      const status = element("p", "source-explorer-status", data.diagnostics.map((item) => typeof item === "string" ? item : item.message || String(item)).join(" · "));
      panel.append(status);
    }
    panel.append(element("p", "source-explorer-status", "Source is read from the current file on disk and may differ from the report."));
    const workspace = element("div", "source-explorer-workspace");
    const inventory = element("div", "source-explorer-inventory");
    {
      const search = element("input", "source-explorer-search");
      search.type = "search"; search.placeholder = "Search symbols"; search.setAttribute("aria-label", "Search symbols");
      search.value = query;
      const list = element("div", "source-explorer-list");
      const update = () => {
        const matches = data.symbols.filter((symbol) => `${symbol.name} ${symbol.kind} ${symbol.signature}`.toLowerCase().includes(search.value.toLowerCase()));
        list.replaceChildren(...matches.map((symbol) => {
          const item = button(`${symbol.name} · ${symbol.kind} · lines ${symbol.startLine}–${symbol.endLine}`, () => { selected = symbol; render({ detail: true }); });
          item.className = "source-explorer-item"; item.setAttribute("aria-pressed", String(selected?.id === symbol.id));
          if (focusTarget === symbol.id) inventoryTarget = item;
          return item;
        }));
        if (!matches.length) list.append(element("p", "source-explorer-status", data.symbols.length ? "No matching symbols." : data.diagnostics?.length ? "Symbol inventory unavailable." : "No functions, methods, or classes found."));
      };
      search.addEventListener("input", () => { query = search.value; update(); }); inventory.append(search, list); update();
    }
    workspace.append(inventory); panel.append(workspace);
    inventoryTarget?.focus();
    if (!selected) {
      workspace.append(element("p", "source-explorer-status", "Choose a symbol to inspect its source."));
      return;
    }
    const detail = element("div", "source-explorer-detail");
    workspace.append(detail);
    const heading = element("h4", "", `${selected.name} · ${selected.kind} · lines ${selected.startLine}–${selected.endLine}`);
    heading.tabIndex = -1; detail.append(heading);
    if (focusTarget?.detail) heading.focus();
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
    for (const call of matching) {
      calls.append(button(`${call.name} · line ${call.line} · unresolved syntax`, () => {
        const line = [...code.children].find((item) => item.id === `source-line-${call.line}`);
        for (const child of code.children) child.classList.remove("is-selected");
        line?.classList.add("is-selected"); line?.scrollIntoView?.({ block: "nearest" });
      }));
    }
    detail.append(calls);
  }
  async function open(path, sourceTrigger = document.activeElement) {
    close(); trigger = sourceTrigger; file = path; panel.hidden = false;
    panel.setAttribute("aria-label", `Source explorer for ${path}`); panel.tabIndex = -1; render();
    panel.focus({ preventScroll: true }); panel.scrollIntoView?.({ block: "start" });
    panel.append(element("p", "source-explorer-status", "Loading source…"));
    const sequence = ++request; controller = new AbortController();
    try {
      const response = await fetchSource(`/api/source?file=${encodeURIComponent(path)}`, { signal: controller.signal });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        throw new Error(failure.code === "UNSUPPORTED_FILE" || response.status === 415 ? "Source exploration is not supported for this file." : failure.error || `Could not load source (${response.status}).`);
      }
      const result = await response.json();
      if (sequence !== request) return;
      data = result; render();
    } catch (error) {
      if (sequence !== request || error.name === "AbortError") return;
      render(); panel.append(element("p", "source-explorer-status", error.message || "Could not load source."));
    }
  }
  return { open, close, get file() { return file; } };
}
