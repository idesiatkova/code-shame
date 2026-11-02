import assert from "node:assert/strict";
import { once } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import { parse } from "@babel/parser";

const require = createRequire(import.meta.url);
const { createServer } = require("../src/server.js");

function addStylesheetImports(queue, body, assetUrl) {
  for (const match of body.matchAll(/@import\s+url\(["']([^"']+)["']\)/g)) {
    queue.push(new URL(match[1], assetUrl).pathname);
  }
}

function addModuleImports(queue, body, assetUrl, asset) {
  const { program } = parse(body, { sourceType: "module" });
  for (const declaration of program.body) {
    if (!declaration.source) continue;
    assert.ok(
      declaration.source.value.startsWith("."),
      `browser import ${declaration.source.value}`,
    );
    const dependency = new URL(declaration.source.value, assetUrl).pathname;
    if (asset.startsWith("/app/shared/")) {
      assert.ok(
        dependency.startsWith("/app/shared/"),
        `shared module ${asset} imports ${dependency}`,
      );
    }
    queue.push(dependency);
  }
}

async function walkAssets(origin, queue) {
  const visited = new Set();
  for (const asset of queue) {
    if (visited.has(asset)) continue;
    visited.add(asset);
    const response = await fetch(origin + asset);
    assert.equal(response.status, 200, `asset ${asset}`);
    const body = await response.text();
    if (asset.startsWith("/vendor/")) continue;
    if (asset.endsWith(".css")) {
      assert.match(response.headers.get("content-type"), /text\/css/);
      addStylesheetImports(queue, body, origin + asset);
    } else if (asset.endsWith(".js")) {
      assert.match(response.headers.get("content-type"), /javascript/);
      addModuleImports(queue, body, origin + asset, asset);
    }
  }
  return visited;
}

test("HTML entry points and their complete module/style graphs are served", async (t) => {
  const server = createServer({ scanService: { getSnapshot: () => ({}), close() {} } });
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const html = await (await fetch(origin)).text();
  const queue = [...html.matchAll(/(?:src|href)="(\/(?:app|styles|vendor)\/[^"?#]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(queue.includes("/app/main.js"));
  assert.ok(queue.includes("/styles/main.css"));
  const visited = await walkAssets(origin, queue);
  assert.ok(visited.has("/styles/tokens/index.css"));
  assert.ok(visited.has("/app/shared/design/tokens.js"));
});
