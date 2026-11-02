export function createSourceRequests(fetchSource) {
  const source = channel();
  const graph = channel();

  function channel() {
    let sequence = 0;
    let controller;
    return {
      cancel() {
        sequence++;
        controller?.abort();
        controller = null;
      },
      async load(url, label, opening = false) {
        this.cancel();
        const current = sequence;
        controller = new AbortController();
        try {
          const response = await fetchSource(url, { signal: controller.signal });
          if (!response.ok) {
            const failure = await response.json().catch(() => ({}));
            throw new Error(
              opening && (failure.code === "UNSUPPORTED_FILE" || response.status === 415)
                ? "Source exploration is not supported for this file."
                : failure.error || `Could not load ${label} (${response.status}).`,
            );
          }
          const result = await response.json();
          return current === sequence ? result : null;
        } catch (error) {
          if (current !== sequence || error.name === "AbortError") return null;
          throw error;
        }
      },
    };
  }
  return {
    cancelSource: () => source.cancel(),
    cancelGraph: () => graph.cancel(),
    source: (file, opening) =>
      source.load(`/api/source?file=${encodeURIComponent(file)}`, "source", opening),
    graph: (file, symbol) =>
      graph.load(
        `/api/function-graph?file=${encodeURIComponent(file)}&symbol=${encodeURIComponent(symbol)}`,
        "function graph",
      ),
  };
}
