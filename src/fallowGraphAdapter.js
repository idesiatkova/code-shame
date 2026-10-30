const path = require("node:path");
const dot = require("graphlib-dot");

// Fallow's labels are project-relative file paths, not DOT node IDs.
function parseFallowGraph(source, files) {
  const graph = dot.read(source);
  if (!graph.isDirected() || graph.nodes().some((id) => graph.parent(id) !== undefined || graph.children(id).length)) {
    throw new Error("Expected a directed, flat Fallow graph.");
  }
  const paths = new Map();
  const seen = new Set();
  for (const id of graph.nodes()) {
    const label = graph.node(id)?.label;
    if (typeof label !== "string" || !label || label.includes("\0") || path.posix.isAbsolute(label)
        || path.win32.isAbsolute(label) || label.split(/[\\/]/).includes("..")) {
      throw new Error("Fallow DOT contains an invalid file label.");
    }
    const normalized = label.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
    if (!normalized || seen.has(normalized)) throw new Error("Fallow DOT contains duplicate file labels.");
    seen.add(normalized);
    paths.set(id, normalized);
  }
  const expected = new Set(files);
  if (seen.size !== expected.size || [...seen].some((file) => !expected.has(file))) {
    throw new Error("Fallow DOT file labels do not match the project file list.");
  }
  return graph.edges().map(({ v, w }) => ({
    source: paths.get(v), target: paths.get(w), kind: "unknown", provenance: "fallow"
  }));
}

module.exports = { parseFallowGraph };
