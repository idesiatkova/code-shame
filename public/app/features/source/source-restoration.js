export function createSourceRestoration(panel, onNavigate) {
  let rendering = false,
    restoring = false,
    restoreFocusCancelled = false,
    pageMoved = false;
  let pendingFocus = null,
    pendingPage = null;
  function snapshot(file, data, selected, query, location) {
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
  const cancelPage = () => {
    if (!rendering && !panel.hidden) {
      pendingPage = null;
      pendingFocus = null;
      if (restoring) {
        pageMoved = true;
        restoreFocusCancelled = true;
      }
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

  return {
    snapshot,
    restorePagePosition,
    restoreFocus,
    get rendering() {
      return rendering;
    },
    set rendering(value) {
      rendering = value;
    },
    get restoring() {
      return restoring;
    },
    set restoring(value) {
      restoring = value;
    },
    get restoreFocusCancelled() {
      return restoreFocusCancelled;
    },
    set restoreFocusCancelled(value) {
      restoreFocusCancelled = value;
    },
    get pageMoved() {
      return pageMoved;
    },
    set pageMoved(value) {
      pageMoved = value;
    },
    get pendingFocus() {
      return pendingFocus;
    },
    set pendingFocus(value) {
      pendingFocus = value;
    },
    get pendingPage() {
      return pendingPage;
    },
    set pendingPage(value) {
      pendingPage = value;
    },
  };
}
