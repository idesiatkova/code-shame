const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createServer } = require("../src/server");

test("creates an isolated HTTP server without listening on import", async (t) => {
  let starts = 0;
  let closed = false;
  const server = createServer({ scanService: {
    getSnapshot: () => ({ projectId: "a", running: starts > 0 }),
    start: () => { starts++; },
    close: () => { closed = true; }
  } });
  assert.equal(server.listening, false);
  t.after(() => { server.close(); server.closeAllConnections(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${url}/api/report`)).json(), { projectId: "a", running: false });
  const scan = await fetch(`${url}/api/scan`, { method: "POST" });
  assert.equal(scan.status, 202);
  assert.equal(starts, 1);
  const html = await (await fetch(`${url}/`)).text();
  assert.match(html, /src="\/app\/main\.js"/);
  assert.match(html, /href="\/styles\/main\.css"/);
  assert.match((await fetch(`${url}/app/main.js`)).headers.get("content-type"), /javascript/);
  assert.match((await fetch(`${url}/styles/main.css`)).headers.get("content-type"), /text\/css/);
  assert.equal((await fetch(`${url}/vendor/cytoscape.js`)).status, 200);
  assert.equal((await fetch(`${url}/api/missing`)).status, 404);
  assert.notEqual((await fetch(`${url}/%2e%2e%2fsrc/server.js`)).status, 200);
  const stopped = once(server, "close");
  server.close();
  server.closeAllConnections();
  await stopped;
  assert.equal(closed, true);
});
