const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { FallowClient } = require("../src/fallowClient");
const { parseFallowGraph } = require("../src/fallowGraphAdapter");
const { ProjectArchitectureAnalyzer } = require("../src/architectureAnalyzer");

const files = {
  "package.json": JSON.stringify({ name: "graph-fixture", private: true, workspaces: ["packages/*"], dependencies: { "@fixture/lib": "*", "external-pkg": "1.0.0" } }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@alias/*": ["src/*"] } } }),
  "packages/lib/package.json": JSON.stringify({ name: "@fixture/lib", version: "1.0.0", main: "src/index.ts" }),
  "packages/lib/src/index.ts": "export const workspace = 1;",
  "src/index.ts": [
    "import { alias } from '@alias/alias';",
    "import type { Thing } from './types';",
    "import { workspace } from '@fixture/lib';",
    "import 'external-pkg';",
    "import './missing';",
    "export { value } from './reexport';",
    "const required = require('./required');",
    "const lazy = import('./lazy');",
    "export const result: Thing = { alias, workspace, required, lazy };"
  ].join("\n"),
  "src/alias.ts": "import './cycle'; export const alias = 1;",
  "src/cycle.ts": "import './alias';",
  "src/types.ts": "export type Thing = Record<string, unknown>;",
  "src/reexport.ts": "export const value = 1;",
  "src/required.ts": "module.exports = 1;",
  "src/lazy.ts": "export const lazy = 1;",
  "src/isolated.ts": "export const isolated = 1;"
};

async function project(t, entries = files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-contract-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(entries)) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }
  return root;
}

test("pinned Fallow DOT agrees with inspect for resolved dependencies", async (t) => {
  const root = await project(t);
  const client = new FallowClient({ cwd: root });
  const [list, primary, dot, inspection] = await Promise.all([
    client.listProject(), client.analyze(), client.exportGraph(), client.inspectFile("src/index.ts")
  ]);
  const fixture = await fs.readFile(path.join(__dirname, "fixtures/fallow-graph.dot"), "utf8");
  assert.deepEqual(parseFallowGraph(dot, list.data.files), parseFallowGraph(fixture, list.data.files));
  const edges = parseFallowGraph(dot, list.data.files);
  assert.deepEqual(edges.filter((edge) => edge.source === "src/index.ts").map((edge) => edge.target).sort(),
    inspection.data.evidence.trace_file.data.imports_from.slice().sort());
  assert.deepEqual(edges.filter((edge) => edge.source === "src/index.ts").map((edge) => edge.target).sort(),
    ["packages/lib/src/index.ts", "src/alias.ts", "src/lazy.ts", "src/reexport.ts", "src/required.ts", "src/types.ts"]);
  assert.ok(edges.some((edge) => edge.source === "src/alias.ts" && edge.target === "src/cycle.ts"));
  assert.ok(edges.some((edge) => edge.source === "src/cycle.ts" && edge.target === "src/alias.ts"));
  assert.ok(list.data.files.includes("src/isolated.ts"));
  const result = await new ProjectArchitectureAnalyzer({ client, maxFiles: 1 }).analyze({ rawReport: primary.data });
  assert.equal(result.projectGraph.nodes.length, 9);
  assert.equal(result.projectGraph.edges.length, 8);
  assert.equal(result.projectGraph.complete, false);
  assert.match(result.projectGraph.diagnostics.join(" "), /unresolved imports/);
  assert.match(result.projectGraph.diagnostics.join(" "), /degraded/);
});

test("pinned Fallow exports an empty project", async (t) => {
  const root = await project(t, { "package.json": '{"name":"empty","private":true}' });
  const client = new FallowClient({ cwd: root });
  const [list, dot, primary] = await Promise.all([client.listProject(), client.exportGraph(), client.analyze()]);
  assert.deepEqual(list.data.files, []);
  assert.deepEqual(parseFallowGraph(dot, []), []);
  const result = await new ProjectArchitectureAnalyzer({ client }).analyze({ rawReport: primary.data });
  assert.equal(result.projectGraph.complete, false);
  assert.match(result.projectGraph.diagnostics.join(" "), /degraded/);
});

test("DOT parser validates syntax, node labels and listed files", async () => {
  assert.deepEqual(parseFallowGraph("digraph fallow {}", []), []);
  assert.deepEqual(parseFallowGraph('digraph { a [label="a.js"]; b [label="b.js"]; a -> b; }', ["a.js", "b.js"]).map(({ source, target }) => [source, target]), [["a.js", "b.js"]]);
  for (const source of ["", "graph { a -- b }", 'digraph { a [label="../x"]; }', 'digraph { a [label="x"]; b [label="x"]; }', 'digraph { a -> b; }', 'digraph { a [label="x"]; }']) {
    assert.throws(() => parseFallowGraph(source, []));
  }
});

test("DOT graph is complete beyond the visible cap, and failure retains a partial fallback", async () => {
  const base = {
    listProject: async () => ({ data: { files: ["a.js", "b.js", "c.js"] } }),
    resolvedConfig: async () => ({ data: {} }),
    inspectFile: async (file) => ({ data: { evidence: { trace_file: { data: { file, imports_from: [], imported_by: [] } } } } })
  };
  const dot = 'digraph { a [label="a.js"]; b [label="b.js"]; c [label="c.js"]; a -> b; b -> c; }';
  const good = await new ProjectArchitectureAnalyzer({ client: { ...base, exportGraph: async () => dot }, maxFiles: 1 }).analyze({});
  assert.equal(good.projectGraph.complete, true);
  assert.equal(good.projectGraph.edges.length, 2);
  assert.equal(good.edges.length, 0);
  const bad = await new ProjectArchitectureAnalyzer({ client: { ...base, exportGraph: async () => "bad" }, maxFiles: 1 }).analyze({});
  assert.equal(bad.projectGraph.complete, false);
  assert.match(bad.projectGraph.diagnostics.join(" "), /DOT extraction failed/);
  const invalidList = await new ProjectArchitectureAnalyzer({ client: {
    ...base, listProject: async () => ({ data: { files: ["a.js"], file_count: 2 } }),
    exportGraph: async () => 'digraph { a [label="a.js"]; }'
  } }).analyze({});
  assert.equal(invalidList.projectGraph.complete, false);
  assert.match(invalidList.projectGraph.diagnostics.join(" "), /invalid project file list/);
  const degraded = await new ProjectArchitectureAnalyzer({ client: { ...base, exportGraph: async () => dot } }).analyze({
    rawReport: { workspace_diagnostics: [{ degrades_analysis: true, message: "skipped source" }] }
  });
  assert.equal(degraded.projectGraph.complete, false);
  assert.match(degraded.projectGraph.diagnostics.join(" "), /skipped source/);
});
