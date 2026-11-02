const { LIMIT } = require("./source-repository");

const NODE_LIMIT = 80;
const EDGE_LIMIT = 200;
const key = (file, id) => JSON.stringify([file, id]);

function createFunctionGraph({ repository, resolveCalls, source, snapshotGraph: graph }) {
  const { load, allowed } = repository;
  let truncated = false;
  function importerFiles(file) {
    const reverse = new Map();
    for (const edge of graph.edges || []) {
      if (!allowed.has(edge.source) || !allowed.has(edge.target)) continue;
      if (!reverse.has(edge.target)) reverse.set(edge.target, []);
      reverse.get(edge.target).push(edge.source);
    }
    return collectImporters(file, reverse);
  }
  function collectImporters(file, reverse) {
    const files = [file];
    const discovered = new Set(files);
    for (let i = 0; i < files.length; i++)
      for (const importer of reverse.get(files[i]) || []) {
        if (discovered.has(importer)) continue;
        discovered.add(importer);
        if (files.length < LIMIT) files.push(importer);
        else truncated = true;
      }
    return files;
  }
  function addGraphCall({ call, data, candidate, file, id, nodes, edges, unresolved }) {
    const outgoing = candidate === file && call.ownerId === id;
    const incoming = call.target?.file === file && call.target?.id === id;
    if (outgoing && call.status === "unresolved") {
      if (unresolved.length < EDGE_LIMIT) unresolved.push({ ...call, file: candidate });
      else truncated = true;
    }
    if ((!outgoing && !incoming) || !call.target || !call.ownerId) return;
    const owner = data.symbols.find((item) => item.id === call.ownerId);
    if (!owner) return;
    const newNodes = [key(candidate, owner.id), key(call.target.file, call.target.id)].filter(
      (k, i, all) => all.indexOf(k) === i && !nodes.has(k),
    );
    if (edges.length >= EDGE_LIMIT || nodes.size + newNodes.length > NODE_LIMIT) {
      truncated = true;
      return;
    }
    nodes.set(key(candidate, owner.id), { file: candidate, hash: data.hash, ...owner });
    nodes.set(key(call.target.file, call.target.id), call.target);
    edges.push({
      source: { file: candidate, id: owner.id },
      target: { file: call.target.file, id: call.target.id },
      file: candidate,
      line: call.line,
      column: call.column,
    });
  }
  async function functionGraph(file, id) {
    if (typeof id !== "string" || !id || id.length > 200)
      throw Object.assign(new Error("Invalid symbol"), { code: "INVALID_SYMBOL", status: 400 });
    const requested = await source(file);
    const selected = requested.symbols.find((s) => s.id === id);
    if (!selected)
      throw Object.assign(new Error("Symbol not found"), { code: "SYMBOL_NOT_FOUND", status: 404 });
    if (requested.diagnostics.length)
      throw Object.assign(new Error("Resolution unavailable for this source"), {
        code: "RESOLUTION_UNAVAILABLE",
        status: 422,
      });
    const rootNode = { file, hash: requested.hash, ...selected };
    const nodes = new Map([[key(file, id), rootNode]]);
    const edges = [];
    const unresolved = [];
    for (const candidate of importerFiles(file)) {
      const data = await load(candidate);
      if (!data || data.unavailable) continue;
      await resolveCalls(data);
      for (const call of data.calls) {
        addGraphCall({ call, data, candidate, file, id, nodes, edges, unresolved });
      }
    }
    const coverage = repository.coverage();
    return {
      root: rootNode,
      nodes: [...nodes.values()],
      edges,
      unresolved,
      coverage: {
        files: coverage.files,
        limit: LIMIT,
        nodeLimit: NODE_LIMIT,
        edgeLimit: EDGE_LIMIT,
        truncated: truncated || coverage.truncated,
        incoming: "current file and bounded transitive snapshot importers",
        snapshotComplete: !!graph.complete,
      },
      diagnostics: coverage.diagnostics,
    };
  }
  return functionGraph;
}

module.exports = { createFunctionGraph };
