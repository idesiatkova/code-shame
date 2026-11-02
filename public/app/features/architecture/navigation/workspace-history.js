function createWorkspaceHistory({ readWorkspace, readGraphOptions, readSource, reportStatus }) {
  let navigationReady = false;
  function mapParams(params) {
    const { selected, directoryPageIndex, activeLayer } = readWorkspace();
    const { view, direction, depth, cycle } = readGraphOptions();
    if (!selected && view === "dependencies" && directoryPageIndex > 0)
      params.set("page", String(directoryPageIndex + 1));
    if (view !== "dependencies") params.set("graph", view);
    if (direction !== "both") params.set("direction", direction);
    if (depth !== "1") params.set("depth", depth);
    if (cycle) params.set("cycle", cycle);
    if (view === "project" && activeLayer) params.set("layer", activeLayer);
  }
  function sourceParams(params) {
    const { selected } = readWorkspace();
    const state = readSource().state;
    if (state.file !== selected) params.set("source", state.file);
    if (state.symbol) params.set("symbol", state.symbol);
    if (state.query) params.set("q", state.query);
    if (state.location) {
      params.set("line", state.location.line);
      params.set("column", state.location.column);
      params.set("hash", state.location.hash);
    }
  }
  function navigationParams() {
    const { selected, directory, mode } = readWorkspace();
    const sourceExplorer = readSource();
    const params = new URLSearchParams();
    if (selected) params.set("file", selected);
    else if (directory !== ".") params.set("directory", directory);
    if (mode !== "overview") params.set("view", mode);
    if (mode === "map") mapParams(params);
    if (mode === "source" && sourceExplorer.file) sourceParams(params);
    return params;
  }
  function saveNavigation(replace = false, sourceTransition = false) {
    const { mode, projectName, selected } = readWorkspace();
    if (!navigationReady || !window.history?.pushState || !window.location) return;
    reportStatus("");
    const hash = navigationParams().toString();
    const url = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (replace || currentUrl !== url) {
      return writeNavigation(url, currentUrl, replace, sourceTransition);
    }
    const marker = window.history.state?.sourceBack;
    return (
      mode === "source" &&
      marker?.project === projectName &&
      marker.anchor === selected &&
      marker.url === currentUrl
    );
  }
  function writeNavigation(url, currentUrl, replace, sourceTransition) {
    const { mode, projectName, selected, graphContext } = readWorkspace();
    const sourceExplorer = readSource();
    const previous = window.history.state;
    const sourceBack = sourceBackForNavigation(previous, currentUrl, replace, sourceTransition);
    const sourceState =
      mode === "source" && sourceExplorer.currentFile ? sourceExplorer.state : null;
    const retainedSource = retainedSourceForNavigation(previous, sourceState);
    window.history[replace ? "replaceState" : "pushState"](
      {
        ...(replace ? previous : {}),
        source: mode === "source" ? sourceExplorer.state : null,
        sourceBack: sourceBack ? { project: projectName, anchor: selected, url } : null,
        retainedSource,
        camera:
          replace && previous?.camera?.context === graphContext && mode === "map"
            ? previous.camera
            : null,
      },
      "",
      url,
    );
    return !!sourceBack;
  }
  function sourceBackForNavigation(previous, currentUrl, replace, sourceTransition) {
    const { mode, projectName, selected } = readWorkspace();
    const sourceExplorer = readSource();
    if (mode !== "source") return false;
    if (!replace)
      return (
        sourceTransition &&
        new URLSearchParams(window.location.hash.slice(1)).get("view") === "source"
      );
    return (
      sourceExplorer.canBack &&
      previous?.sourceBack?.project === projectName &&
      previous.sourceBack.anchor === selected &&
      previous.sourceBack.url === currentUrl
    );
  }
  function retainedSourceForNavigation(previous, sourceState) {
    const { projectName, selected } = readWorkspace();
    if (sourceState?.sourceHash)
      return { project: projectName, file: sourceState.file, state: sourceState };
    if (
      previous?.retainedSource?.project === projectName &&
      previous.retainedSource.file === selected
    )
      return previous.retainedSource;
    return null;
  }
  function saveCamera(camera) {
    if (!navigationReady || !window.history?.replaceState) return;
    try {
      window.history.replaceState(
        { ...window.history.state, camera },
        "",
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
    } catch (error) {
      if (error.name !== "SecurityError") throw error;
    }
  }
  function readLocation(files) {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const path = params.get("file"),
      dir = params.get("directory"),
      source = params.get("source") || path;
    const nextMode = params.get("view") || "overview";
    const invalid = invalidNavigation(params, path, dir, source, nextMode, files);
    return {
      params,
      path,
      source,
      nextMode,
      invalid,
      directory: navigationDirectory(invalid, path, dir),
    };
  }
  function navigationDirectory(invalid, path, dir) {
    if (invalid) return ".";
    if (!path) return dir || ".";
    return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  }
  function invalidNavigation(params, path, dir, source, nextMode, files) {
    const directories = new Set([
      ".",
      ...files.flatMap((file) => {
        const parts = file.split("/");
        parts.pop();
        return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
      }),
    ]);
    return (
      (path && !files.includes(path)) ||
      (dir && !directories.has(dir)) ||
      !["overview", "source", "map"].includes(nextMode) ||
      (nextMode === "source" && (!path || !files.includes(source))) ||
      (params.has("symbol") && nextMode !== "source")
    );
  }
  return {
    readLocation,
    isReady: () => navigationReady,
    save: saveNavigation,
    saveCamera,
    setReady: (ready) => {
      navigationReady = ready;
    },
  };
}

export { createWorkspaceHistory };
