import { element, button } from "../../source-dom.js";

export function renderSourceCode(
  detail,
  code,
  focusTarget,
  data,
  selected,
  file,
  location,
  navigate,
  onNavigate,
  isRendering,
) {
  function renderCalls(detail, focusTarget) {
    const calls = element("div", "source-explorer-calls");
    calls.append(element("h4", "", "Calls in this symbol"));
    const matching = data.calls.filter((call) => call.ownerId === selected.id);
    if (!matching.length) calls.append(element("p", "source-explorer-status", "No calls found."));
    const unresolved = matching.filter((call) => call.status !== "resolved" || !call.target);
    const unresolvedDetails = element("details", "source-explorer-unresolved");
    unresolvedDetails.open = !!focusTarget?.restore?.unresolvedOpen;
    unresolvedDetails.addEventListener("toggle", () => {
      if (!isRendering()) onNavigate(true);
    });
    if (unresolved.length)
      unresolvedDetails.append(element("summary", "", `Unresolved calls (${unresolved.length})`));
    renderCallItems(matching, calls, unresolvedDetails);
    if (unresolved.length) calls.append(unresolvedDetails);
    detail.append(calls);
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
  renderCode(code, detail);
  renderCalls(detail, focusTarget);
}
