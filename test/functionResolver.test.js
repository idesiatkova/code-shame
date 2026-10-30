const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createResolver } = require("../src/functionResolver");
const { createServer } = require("../src/server");

test("resolves lexical bindings and relative exports without guessing dynamic calls", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-resolver-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const files = {
    "a.js": `export function shared() { return shared(); }\nexport default () => 1;\n`,
    "barrel.js": `export { shared as renamed, default } from './a.js';\n`,
    "b.js": `import def, { renamed as local } from './barrel.js';\nimport * as ns from './a.js';\nfunction caller(arg) {\n  function inner() {}\n  const arrow = () => inner();\n  inner(); arrow(); local(); def(); ns.shared(); arg(); obj.method();\n}\nfunction shadow(local) { local(); }\nlet mutable = () => 1; mutable = arg; mutable();\n`,
    "types.ts": `import type { shared } from './a.js';\nfunction f() { shared(); }\n`,
    "mutable.js": `export function changing() {}\nchanging = () => 2;\n`,
    "ambiguous.js": `export * from './a.js';\nexport * from './missing.js';\n`,
    "uncertain.js": `import { changing } from './mutable.js';\nimport { shared } from './ambiguous.js';\nfunction f() { changing(); shared(); }\n`
  };
  for (const [file, content] of Object.entries(files)) await fs.writeFile(path.join(root, file), content);
  const report = { architecture: { projectGraph: { complete: true, nodes: Object.keys(files).map((file) => ({ path: file })), edges: [{ source: "b.js", target: "barrel.js" }, { source: "barrel.js", target: "a.js" }] } } };
  const resolver = createResolver(root, { report });
  const result = await resolver.source("b.js");
  for (const name of ["inner", "arrow", "local", "def", "ns.shared"]) assert.equal(result.calls.find((call) => call.name === name).status, "resolved", name);
  for (const name of ["arg", "obj.method", "mutable"]) assert.equal(result.calls.find((call) => call.name === name).status, "unresolved", name);
  const shadow = result.symbols.find((symbol) => symbol.name === "shadow");
  assert.equal(result.calls.find((call) => call.ownerId === shadow.id).status, "unresolved");
  assert.equal((await resolver.source("types.ts")).calls[0].status, "unresolved");
  assert.ok((await resolver.source("uncertain.js")).calls.every((call) => call.status === "unresolved"));
  const caller = result.symbols.find((symbol) => symbol.name === "caller");
  const graph = await resolver.functionGraph("b.js", caller.id);
  assert.equal(graph.edges.length, 5);
  assert.ok(graph.edges.some((edge) => edge.target.file === "a.js" && edge.line === 6));
  assert.ok(graph.unresolved.some((call) => call.name === "obj.method"));
  const shared = (await resolver.source("a.js")).symbols.find((symbol) => symbol.name === "shared");
  const incoming = await resolver.functionGraph("a.js", shared.id);
  assert.ok(incoming.edges.some((edge) => edge.file === "b.js"));
  assert.ok(incoming.edges.some((edge) => edge.file === "a.js"));

  const server = createServer({ projectRoot: root, scanService: { getSnapshot: () => ({ report }), close() {} } });
  t.after(() => { server.close(); server.closeAllConnections(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/function-graph`;
  assert.equal((await fetch(`${url}?file=b.js&symbol=${encodeURIComponent(caller.id)}`)).status, 200);
  assert.equal((await fetch(`${url}?file=b.js&symbol=missing`)).status, 404);
  assert.equal((await fetch(`${url}?file=../b.js&symbol=x`)).status, 400);
});

test("bounds large function neighborhoods", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-graph-limit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = `${Array.from({ length: 100 }, (_, i) => `function f${i}() {}`).join("\n")}\nfunction root() { ${Array.from({ length: 100 }, (_, i) => `f${i}();`).join(" ")} }`;
  await fs.writeFile(path.join(root, "a.js"), source);
  const resolver = createResolver(root, { report: { architecture: { projectGraph: { nodes: [{ path: "a.js" }], edges: [] } } } });
  const result = await resolver.source("a.js");
  const graph = await resolver.functionGraph("a.js", result.symbols.find((item) => item.name === "root").id);
  assert.equal(graph.nodes.length, 80);
  assert.equal(graph.edges.length, 79);
  assert.equal(graph.coverage.truncated, true);
});
