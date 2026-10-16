const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await exited;
}

test("ignores stale PID files and leaves an occupied server running", { timeout: 10000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "code-shame-cli-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => stop(unrelated));
  const hash = createHash("sha256").update(directory).digest("hex").slice(0, 12);
  const pidFile = path.join(os.tmpdir(), `code-shame-${hash}.pid`);
  await fs.writeFile(pidFile, `${unrelated.pid}\n`);
  t.after(() => fs.rm(pidFile, { force: true }));

  const env = { ...process.env, PORT: "0", HOST: "127.0.0.1", CODE_SCAN_ROOT: directory };
  const cliPath = path.join(__dirname, "../src/start.js");
  const first = spawn(process.execPath, [cliPath], { env });
  t.after(() => stop(first));
  let output = "";
  const url = await new Promise((resolve, reject) => {
    first.once("error", reject);
    first.once("exit", (code) => reject(new Error(`CLI exited before listening: ${code}`)));
    first.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/Code Shame: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
  });
  assert.equal(unrelated.exitCode, null);
  assert.equal(unrelated.signalCode, null);
  assert.equal(await fs.readFile(pidFile, "utf8"), `${unrelated.pid}\n`);

  const second = spawn(process.execPath, [cliPath], { env: { ...env, PORT: new URL(url).port } });
  t.after(() => stop(second));
  let errorOutput = "";
  second.stderr.on("data", (chunk) => { errorOutput += chunk; });
  const [code] = await once(second, "close");
  assert.equal(code, 1);
  assert.match(errorOutput, /already in use/);
  assert.deepEqual(await (await fetch(`${url}/api/health`)).json(), { ok: true });
  await stop(first);
});
