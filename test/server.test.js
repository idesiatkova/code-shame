const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createServer } = require("../src/server");
const path = require("node:path");

test("creates an isolated HTTP server without listening on import", async (t) => {
  let starts = 0;
  let closed = false;
  const server = createServer({
    scanService: {
      getSnapshot: () => ({ projectId: "a", running: starts > 0 }),
      start: () => {
        starts++;
      },
      close: () => {
        closed = true;
      },
    },
  });
  assert.equal(server.listening, false);
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${url}/api/report`)).json(), {
    projectId: "a",
    running: false,
  });
  const scan = await fetch(`${url}/api/scan`, { method: "POST" });
  assert.equal(scan.status, 202);
  assert.equal(starts, 1);
  const html = await (await fetch(`${url}/`)).text();
  assert.match(html, /src="\/app\/main\.js"/);
  assert.match(html, /href="\/styles\/main\.css"/);
  assert.ok(html.includes(`Code Shame ${require("../package.json").version}`));
  assert.ok(html.includes(`Fallow ${require("fallow/package.json").version}`));
  assert.doesNotMatch(html, /\{\{(?:CODE_SHAME|FALLOW)_VERSION\}\}/);
  const head = await fetch(`${url}/`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.match(head.headers.get("content-type"), /text\/html/);
  assert.equal(head.headers.get("cache-control"), "no-store");
  assert.equal(await head.text(), "");
  assert.match((await fetch(`${url}/app/main.js`)).headers.get("content-type"), /javascript/);
  assert.match((await fetch(`${url}/styles/main.css`)).headers.get("content-type"), /text\/css/);
  assert.equal((await fetch(`${url}/vendor/cytoscape.js`)).status, 200);
  assert.equal((await fetch(`${url}/vendor/cytoscape-dagre.js`)).status, 200);
  assert.equal((await fetch(`${url}/api/missing`)).status, 404);
  assert.notEqual((await fetch(`${url}/%2e%2e%2fsrc/server.js`)).status, 200);
  const stopped = once(server, "close");
  server.close();
  server.closeAllConnections();
  await stopped;
  assert.equal(closed, true);
});

test("source API is restricted to the active snapshot", async (t) => {
  const report = { architecture: { projectGraph: { nodes: [{ path: "src/server.js" }] } } };
  const server = createServer({
    projectRoot: path.resolve(__dirname, ".."),
    scanService: { getSnapshot: () => ({ report }), close() {} },
  });
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/source?file=`;
  const response = await fetch(url + encodeURIComponent("src/server.js"));
  assert.equal(response.status, 200);
  assert.ok((await response.json()).symbols.some((symbol) => symbol.name === "createServer"));
  const rejected = await fetch(url + encodeURIComponent("src/scanService.js"));
  assert.equal(rejected.status, 404);
  assert.equal((await rejected.json()).code, "NOT_IN_SNAPSHOT");
});
