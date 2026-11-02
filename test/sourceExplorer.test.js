const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { exploreSource } = require("../src/sourceExplorer");

test("inventories nested JavaScript and TypeScript declarations and call sites", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-inventory-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const snapshot = {
    report: {
      architecture: {
        projectGraph: { nodes: ["example.ts", "bad.js", "x.jsx"].map((path) => ({ path })) },
      },
    },
  };
  const inventory = async (source, file) => {
    await fs.writeFile(path.join(root, file), source);
    return exploreSource(root, file, snapshot);
  };
  const source = `class Box {\n  run(value: number) {\n    const local = (x: number) => x + 1;\n    return [value].map(x => local(x));\n  }\n}\nfunction outer() { function inner() { return foo.bar(); } return inner(); }`;
  const result = await inventory(source, "example.ts");
  assert.deepEqual(result.diagnostics, []);
  const box = result.symbols.find((s) => s.name === "Box");
  const run = result.symbols.find((s) => s.name === "run");
  const local = result.symbols.find((s) => s.name === "local");
  const callback = result.symbols.find((s) => s.name === "<anonymous>");
  assert.equal(run.parentId, box.id);
  assert.equal(local.parentId, run.id);
  assert.equal(callback.parentId, run.id);
  assert.deepEqual([run.startLine, run.endLine], [2, 5]);
  assert.match(local.signature, /x: number/);
  assert.equal(result.calls.find((c) => c.name === "local").ownerId, callback.id);
  assert.equal(result.calls.find((c) => c.name === "foo.bar").line, 7);
  assert.ok(result.calls.every((c) => !("targetId" in c)));
  assert.equal((await inventory("const x = ;", "bad.js")).diagnostics.length, 1);
  assert.equal((await inventory("const f = () => <div />", "x.jsx")).symbols[0].name, "f");
});

test("source reads require a listed, bounded file inside the project", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-source-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "a.js"), "function a() {}\n");
  await fs.writeFile(path.join(root, "limit.js"), Buffer.alloc(512 * 1024, 32));
  await fs.writeFile(path.join(root, "large.js"), Buffer.alloc(512 * 1024 + 1));
  await fs.symlink(os.tmpdir(), path.join(root, "outside"));
  const snapshot = {
    report: {
      architecture: {
        projectGraph: {
          nodes: ["a.js", "limit.js", "large.js", "outside/other.js", "folder.js"].map((path) => ({
            path,
          })),
        },
      },
    },
  };
  const source = await exploreSource(root, "a.js", snapshot);
  assert.equal(source.symbols[0].name, "a");
  assert.match(source.hash, /^[a-f0-9]{64}$/);
  assert.equal((await exploreSource(root, "limit.js", snapshot)).source.length, 512 * 1024);
  for (const file of ["../a.js", "/tmp/a.js", "a\0.js", "a\\b.js"])
    await assert.rejects(exploreSource(root, file, snapshot), { code: "INVALID_PATH" });
  await assert.rejects(exploreSource(root, "unlisted.js", snapshot), { code: "NOT_IN_SNAPSHOT" });
  await assert.rejects(exploreSource(root, "a.png", snapshot), { code: "UNSUPPORTED_FILE" });
  await assert.rejects(exploreSource(root, "large.js", snapshot), { code: "TOO_LARGE" });
  await fs.writeFile(path.join(os.tmpdir(), `code-shame-outside-${process.pid}.js`), "outside");
  const outside = `code-shame-outside-${process.pid}.js`;
  t.after(() => fs.rm(path.join(os.tmpdir(), outside), { force: true }));
  snapshot.report.architecture.projectGraph.nodes.push({ path: `outside/${outside}` });
  await assert.rejects(exploreSource(root, `outside/${outside}`, snapshot), {
    code: "OUTSIDE_ROOT",
  });
  await fs.mkdir(path.join(root, "folder.js"));
  await assert.rejects(exploreSource(root, "folder.js", snapshot), { code: "NOT_FILE" });
});
