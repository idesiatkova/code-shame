import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import cytoscape from "cytoscape";
import { createGraphOptions } from "../public/app/graph/architecture-graph.js";
import { functionGraphStyle } from "../public/app/graph/function-graph.js";
import { colorizeProjection } from "../public/app/graph/layer-colors.js";
import { readDesignTokens } from "../public/app/design-tokens.js";

test("all runtime design tokens are defined in the stylesheet", () => {
  const css = readFileSync(new URL("../public/styles/tokens.css", import.meta.url), "utf8");
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  const missing = [];
  globalThis.document = { documentElement: {} };
  globalThis.window = { getComputedStyle: () => ({ getPropertyValue(name) {
    if (!css.includes(`${name}:`)) missing.push(name);
    return "";
  } }) };
  try {
    readDesignTokens();
    assert.deepEqual(missing, []);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test("both graph renderers use the current root design tokens", () => {
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  const values = { "--ink": "#123456", "--graph-function-node": "#abcdef", "--layer-ui": "#112233", "--layer-unknown": "#223344" };
  globalThis.document = { documentElement: {} };
  globalThis.window = { getComputedStyle: () => ({ getPropertyValue: (name) => values[name] || "" }) };
  try {
    const architecture = cytoscape({ ...createGraphOptions(undefined, { nodes: [{ id: "file", type: "file", label: "file", color: "#ffffff" }] }), layout: { name: "preset" }, headless: true, styleEnabled: true });
    const functions = cytoscape({ elements: [{ data: { id: "function", label: "function" } }], style: functionGraphStyle(), layout: { name: "preset" }, headless: true, styleEnabled: true });
    assert.equal(architecture.getElementById("file").style("color"), "rgb(18,52,86)");
    assert.equal(functions.getElementById("function").style("background-color"), "rgb(171,205,239)");
    const model = { nodes: [{ type: "layer", layerId: "ui", source: "automatic" }, { type: "layer", layerId: "custom", source: "fallow-boundary" }] };
    const projection = { nodes: [{ id: "ui", type: "file", label: "ui", layerId: "ui", color: "#ffffff" }, { id: "unknown", type: "file", label: "unknown" }, { id: "custom", type: "file", label: "custom", layerId: "custom", color: "#445566" }] };
    const graph = cytoscape({ ...createGraphOptions(undefined, colorizeProjection(model, projection, readDesignTokens())), layout: { name: "preset" }, headless: true, styleEnabled: true });
    assert.equal(graph.getElementById("ui").style("border-color"), "rgb(17,34,51)");
    assert.equal(graph.getElementById("unknown").style("border-color"), "rgb(34,51,68)");
    assert.equal(graph.getElementById("custom").style("border-color"), "rgb(68,85,102)");
    values["--ink"] = "#654321";
    values["--graph-function-node"] = "#fedcba";
    values["--layer-ui"] = "#334455";
    architecture.style(createGraphOptions(undefined, { nodes: [] }).style).update();
    functions.style(functionGraphStyle()).update();
    assert.equal(architecture.getElementById("file").style("color"), "rgb(101,67,33)");
    assert.equal(functions.getElementById("function").style("background-color"), "rgb(254,220,186)");
    graph.getElementById("ui").data(colorizeProjection(model, projection, readDesignTokens()).nodes[0]);
    assert.equal(graph.getElementById("ui").style("border-color"), "rgb(51,68,85)");
    architecture.destroy();
    functions.destroy();
    graph.destroy();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
