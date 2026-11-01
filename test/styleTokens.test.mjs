import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../public/", import.meta.url));

test("stylesheet imports resolve without cycles and custom properties are defined", () => {
  const visited = new Set(), active = new Set(), stylesheets = [];
  function visit(path) {
    assert.ok(!active.has(path), `stylesheet import cycle at ${path}`);
    if (visited.has(path)) return;
    active.add(path);
    const css = readFileSync(path, "utf8");
    stylesheets.push(css);
    for (const match of css.matchAll(/@import\s+(?:url\()?\s*["']([^"']+)["']\s*\)?\s*;/g)) {
      visit(resolve(dirname(path), match[1]));
    }
    active.delete(path);
    visited.add(path);
  }
  visit(resolve(root, "styles/main.css"));
  visit(resolve(root, "styles/styled-select.css"));

  const css = stylesheets.join("\n");
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  function readScripts(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(dir, entry.name);
      return entry.isDirectory() ? readScripts(path) : entry.name.endsWith(".js") ? [readFileSync(path, "utf8")] : [];
    });
  }
  for (const script of readScripts(resolve(root, "app"))) {
    for (const match of script.matchAll(/\.setProperty\(\s*["'](--[\w-]+)["']/g)) defined.add(match[1]);
  }
  const missing = [...new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]).filter((name) => !defined.has(name)))];
  assert.deepEqual(missing, []);
});
