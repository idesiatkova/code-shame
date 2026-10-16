const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { FallowClient } = require("../src/fallowClient");

async function fixture(t, source, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-client-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const launcher = path.join(directory, "launcher.cjs");
  await fs.writeFile(launcher, source);
  const client = new FallowClient({ cwd: directory, ...options });
  client.launcherPath = launcher;
  return client;
}

test("uses the upstream launcher and accepts issue exit code 1", async (t) => {
  const installed = new FallowClient({ cwd: process.cwd() });
  assert.equal(installed.launcherPath, require.resolve("fallow/bin/fallow"));
  const client = await fixture(t, 'console.log(JSON.stringify({args: process.argv.slice(2)})); process.exitCode = 1;');
  const result = await client.inspectFile("src/a file.js");
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.data.args, ["inspect", "--file", "src/a file.js", "--format", "json", "--quiet"]);
});

test("rejects runtime failures even when stdout contains JSON", async (t) => {
  const client = await fixture(t, 'console.log("{}"); console.error("invalid config"); process.exitCode = 2;');
  await assert.rejects(client.analyze(), /exit 2.*invalid config/);
});

test("times out a stuck launcher and frees the next command", async (t) => {
  const client = await fixture(t, 'setInterval(() => {}, 1000);', { timeoutMs: 150 });
  await assert.rejects(client.analyze(), /timed out/);
  await fs.writeFile(client.launcherPath, 'console.log("{}");');
  assert.deepEqual((await client.analyze()).data, {});
});

test("cancels active and future commands", async (t) => {
  const controller = new AbortController();
  const client = await fixture(t, 'setInterval(() => {}, 1000);', { signal: controller.signal });
  const result = client.analyze();
  controller.abort(new Error("cancelled scan"));
  await assert.rejects(result, /cancelled scan/);
  await assert.rejects(client.listProject(), /cancelled scan/);
});
